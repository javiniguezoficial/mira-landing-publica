-- 036 — El borrado aborta si las copias de seguridad no cuadran
--
-- ═════════════════════════════════════════════════════════════════════════════
-- QUÉ AÑADE Y POR QUÉ
-- ═════════════════════════════════════════════════════════════════════════════
--
-- `apply_price_deletion` (035) borra los precios cuyo identificador está
-- guardado en `market_price_deletion_rows`. Eso ya impide borrar de más.
--
-- Lo que NO comprobaba es que las copias estén COMPLETAS. Si la vista previa
-- hubiera guardado 600 de 608 filas —una tanda de inserción perdida, un fallo a
-- mitad— la función habría borrado esas 600 tan tranquila, y las 8 restantes se
-- habrían quedado sin copia y sin borrar, con el lote diciendo 608.
--
-- Con el vaciado total del histórico por delante, esa diferencia entre «lo que
-- el lote dice» y «lo que hay copiado» es exactamente el fallo que no se puede
-- permitir: sería descubrir que faltan copias DESPUÉS de borrar.
--
-- Se añaden dos comprobaciones, las dos ANTES del primer DELETE y dentro de la
-- misma transacción:
--
--   1. el número de copias pendientes es EXACTAMENTE `total_rows`;
--   2. ninguna copia está vacía de los campos que hacen falta para reconstruir
--      el precio.
--
-- Si cualquiera falla, la función lanza y la transacción entera se deshace: no
-- se borra ni un precio y el lote se queda en `ready` para poder repetirlo.
--
-- El resto de la función es IDÉNTICO a 035: mismo `is_platform_admin()` en la
-- primera línea, mismo `for update`, mismo bloqueo de la segunda confirmación,
-- mismo borrado por lista guardada y mismo cierre del lote.

create or replace function public.apply_price_deletion(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch      public.market_price_deletion_batches%rowtype;
  v_copias     integer := 0;
  v_incompleta integer := 0;
  v_borrados   integer := 0;
  v_omitidos   integer := 0;
  v_filas_imp  integer := 0;
  v_lotes_imp  integer := 0;
  v_estado     text;
begin
  -- 1. Autorización. Antes que nada y sin excepciones.
  if not public.is_platform_admin() then
    raise exception 'Solo un administrador de plataforma puede borrar precios.'
      using errcode = '42501';
  end if;

  -- 2. Bloqueo del lote. Serializa las confirmaciones concurrentes.
  select * into v_batch
    from public.market_price_deletion_batches
   where id = p_batch_id
   for update;

  if not found then
    raise exception 'No se ha encontrado la operación de borrado indicada.' using errcode = 'P0002';
  end if;

  -- 3. Solo se borra desde `ready`, y una sola vez.
  if v_batch.status <> 'ready' then
    raise exception 'Esta operación ya no se puede confirmar (estado actual: %).', v_batch.status
      using errcode = '22023';
  end if;

  -- ══════════════════════════════════════════════════════════════════════════
  -- 4. LAS COPIAS TIENEN QUE ESTAR COMPLETAS (036)
  -- ══════════════════════════════════════════════════════════════════════════
  --
  -- Se cuenta lo que hay copiado y se compara con lo que el lote declaró al
  -- prepararse. Si no coincide, no se borra NADA.
  select count(*) into v_copias
    from public.market_price_deletion_rows
   where deletion_batch_id = p_batch_id
     and status = 'pending';

  if v_copias <> v_batch.total_rows then
    raise exception
      'Copias de seguridad incompletas: el lote declara % precios y solo hay % copias. No se ha borrado nada.',
      v_batch.total_rows, v_copias
      using errcode = '23514';
  end if;

  -- Y una copia sin los campos que reconstruyen el precio no es una copia.
  -- `price` puede ser 0 pero no puede FALTAR, de ahí el `?` sobre la clave y no
  -- una comprobación de valor.
  select count(*) into v_incompleta
    from public.market_price_deletion_rows
   where deletion_batch_id = p_batch_id
     and status = 'pending'
     and not (original_data ? 'id'
          and original_data ? 'product_id'
          and original_data ? 'recorded_at'
          and original_data ? 'price'
          and original_data ? 'currency'
          and original_data ? 'unit');

  if v_incompleta > 0 then
    raise exception
      'Hay % copias de seguridad sin los campos necesarios para reconstruir el precio. No se ha borrado nada.',
      v_incompleta
      using errcode = '23514';
  end if;

  -- 5. Borrar SOLO los precios cuyo identificador quedó guardado.
  with objetivo as (
    select original_price_id
      from public.market_price_deletion_rows
     where deletion_batch_id = p_batch_id
       and status = 'pending'
  ),
  borrados as (
    delete from public.product_price_records p
     where p.id in (select original_price_id from objetivo)
    returning p.id
  )
  update public.market_price_deletion_rows r
     set status = 'deleted', deleted_at = now()
    from borrados b
   where r.deletion_batch_id = p_batch_id
     and r.original_price_id = b.id;

  get diagnostics v_borrados = row_count;

  -- Lo que siguiera pendiente es un precio que ya no existía al confirmar.
  update public.market_price_deletion_rows
     set status = 'skipped',
         error  = 'El precio ya no existía al confirmar el borrado.'
   where deletion_batch_id = p_batch_id
     and status = 'pending';

  get diagnostics v_omitidos = row_count;

  -- 6. Modo `import`: además, las filas técnicas y el propio lote.
  --
  --    La auditoría NO se ve afectada: `market_price_deletion_rows` no tiene
  --    clave foránea contra `market_import_batches`, precisamente para que
  --    borrar la importación no se lleve por delante la copia.
  if v_batch.mode = 'import' and v_batch.source_import_batch_id is not null then
    delete from public.market_import_rows
     where batch_id = v_batch.source_import_batch_id;
    get diagnostics v_filas_imp = row_count;

    delete from public.market_import_batches
     where id = v_batch.source_import_batch_id;
    get diagnostics v_lotes_imp = row_count;
  end if;

  -- 7. Cerrar el lote.
  v_estado := case when v_omitidos > 0 then 'completed_with_errors' else 'completed' end;

  update public.market_price_deletion_batches
     set status       = v_estado,
         deleted_rows = v_borrados,
         failed_rows  = 0,
         confirmed_at = coalesce(confirmed_at, now()),
         completed_at = now(),
         metadata     = metadata || jsonb_build_object(
                          'skipped_rows',         v_omitidos,
                          'snapshots_verified',   v_copias,
                          'import_rows_deleted',  v_filas_imp,
                          'import_batch_deleted', v_lotes_imp)
   where id = p_batch_id;

  return jsonb_build_object(
    'deletion_batch_id',    p_batch_id,
    'status',               v_estado,
    'snapshots_verified',   v_copias,
    'deleted_rows',         v_borrados,
    'skipped_rows',         v_omitidos,
    'import_rows_deleted',  v_filas_imp,
    'import_batch_deleted', v_lotes_imp
  );
end;
$$;

comment on function public.apply_price_deletion(uuid) is
  'Fase 2.5 (036) — borra los precios cuyo id quedó guardado en la vista previa '
  'del lote, en una sola transacción. Comprueba platform_admin internamente, '
  'bloquea el lote, y ABORTA sin borrar nada si las copias de seguridad no '
  'coinciden en número con lo declarado o les faltan campos. En modo import '
  'elimina también las filas y el lote de importación de origen.';

-- `create or replace function` conserva los privilegios, pero se repiten: es
-- barato, idempotente, y deja el estado deseado escrito aquí en lugar de
-- depender de que nadie los haya tocado desde 035.
revoke all on function public.apply_price_deletion(uuid) from public;
revoke all on function public.apply_price_deletion(uuid) from anon;
grant execute on function public.apply_price_deletion(uuid) to authenticated, service_role;

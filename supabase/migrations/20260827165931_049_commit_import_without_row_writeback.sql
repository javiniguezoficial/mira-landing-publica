-- ═════════════════════════════════════════════════════════════════════════════
-- 049 · `commit_market_import` deja de reescribir las filas de importación
-- ═════════════════════════════════════════════════════════════════════════════
--
-- ── El problema ─────────────────────────────────────────────────────────────
--
-- La confirmación rozaba el `statement_timeout` de 8 s del rol `authenticated`.
-- Medido en remoto sobre fixtures sintéticos y con rollback, para 15.000 filas:
--
--   lock del batch        25 ms   ·  0,4 %
--   selección de válidas  15 ms   ·  0,2 %
--   INSERT en precios  4.525 ms   ·   70 %
--   UPDATE de las filas 1.855 ms  ·   29 %   ← esto
--   cierre del batch       9 ms   ·  0,1 %
--
-- Ese UPDATE marcaba cada fila importada con `status = 'imported'` y
-- `imported_record_id`. Costaba casi un tercio del total por tres razones:
--
--   1. NO puede ser HOT. Cambia `status` e `imported_record_id`, y las dos
--      columnas están indexadas. Un update no-HOT escribe una entrada nueva en
--      TODOS los índices de la tabla, no solo en los de las columnas tocadas.
--   2. Las filas son gordas. `market_import_rows` lleva `raw_data` y
--      `validation_errors` en jsonb: ~630 B por fila que se reescriben enteros
--      para cambiar dos campos.
--   3. ~560 ms de triggers de FK revalidando claves que en su mayoría no
--      habían cambiado.
--
-- ── Por qué el dato era redundante ──────────────────────────────────────────
--
-- `product_price_records.import_row_id` ya apunta a la fila que originó cada
-- precio, con su índice (`idx_ppr_import_row`) y en relación 1:1 verificada en
-- producción: 78.274 precios con lineage, 78.274 filas distintas, cero filas
-- con más de un precio. Saber si una fila se importó es preguntar si existe un
-- precio que la referencie. Escribirlo ADEMÁS en la propia fila era guardar dos
-- veces el mismo hecho.
--
-- ── Y encima el dato guardado ya mentía ─────────────────────────────────────
--
-- En el momento de escribir esto, en producción:
--
--   status = 'imported' con imported_record_id NO nulo →  78.274 filas
--   status = 'imported' con imported_record_id NULO    →  75.002 filas (620 lotes)
--
-- La mitad de las filas marcadas como importadas no tienen ningún precio
-- detrás. La FK `on delete set null` limpió `imported_record_id` cuando esos
-- precios se borraron, pero `status` se quedó congelado en 'imported' porque
-- nadie lo actualiza al borrar. El valor derivado no solo es más barato: es
-- más veraz.
--
-- ── Qué NO cambia ───────────────────────────────────────────────────────────
--
-- Firma, permisos, SECURITY DEFINER, search_path, comprobación de
-- `is_platform_admin()`, `select … for update` sobre el batch, la máquina de
-- estados, el `on conflict do nothing` sobre la clave natural, el cierre del
-- batch y el jsonb de retorno: idénticos. Sigue siendo UNA transacción y sigue
-- siendo todo-o-nada.
--
-- Las columnas `status` e `imported_record_id` NO se eliminan. Se conservan por
-- compatibilidad y por el histórico ya escrito; simplemente dejan de recibir la
-- marca de importación. La lectura pasa a derivarse en un único sitio
-- (`src/lib/imports/row-state.ts`), con la regla `hay precio ⇒ importada`, que
-- reproduce el comportamiento actual también para las filas antiguas.
--
-- ── El caso que hay que tener claro: ON CONFLICT DO NOTHING ─────────────────
--
-- Cuando una fila válida choca con un precio que ya existía, el INSERT no la
-- devuelve. Antes: el UPDATE no la tocaba y se quedaba en 'valid', con
-- `imported_record_id` nulo. Ahora: no hay precio que la referencie, así que la
-- derivación dice «no importada». Es EXACTAMENTE la misma semántica, y
-- `imported_rows < valid_rows` sigue cerrando el batch como
-- `completed_with_errors`.

create or replace function public.commit_market_import(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch      public.market_import_batches%rowtype;
  v_insertadas integer := 0;
  v_estado     text;
begin
  -- 1. Autorización. Antes que nada y sin excepciones. `security definer` sin
  --    esta línea sería una puerta trasera para cualquier `authenticated`.
  if not public.is_platform_admin() then
    raise exception 'Solo un administrador de plataforma puede importar precios.'
      using errcode = '42501';
  end if;

  -- 2. Bloqueo del batch. Serializa las confirmaciones concurrentes: doble
  --    clic o dos pestañas no pueden importar dos veces.
  select * into v_batch
    from public.market_import_batches
   where id = p_batch_id
   for update;

  if not found then
    raise exception 'No se ha encontrado la importación indicada.' using errcode = 'P0002';
  end if;

  -- 3. Solo se importa desde `ready`. Un batch ya cerrado no se reabre.
  if v_batch.status <> 'ready' then
    raise exception 'Esta importación ya no se puede confirmar (estado actual: %).', v_batch.status
      using errcode = '22023';
  end if;

  -- 4. Insertar SOLO las filas válidas.
  --
  --    Lo único que cambia respecto de la 037: el CTE ya no alimenta un UPDATE
  --    de miles de filas, solo se cuenta. El lineage sigue guardándose donde
  --    siempre estuvo —`import_row_id` en cada precio— y de ahí se deriva
  --    después qué filas entraron.
  with insertadas as (
    insert into public.product_price_records (
      product_id, price, unit, currency, country, region, recorded_at, lonja,
      min_price, max_price, avg_price, volume, metadata,
      import_batch_id, import_row_id
    )
    select r.resolved_product_id,
           r.resolved_price,
           r.resolved_unit,
           r.resolved_currency,
           coalesce(r.resolved_country, 'ES'),
           r.resolved_region,
           r.resolved_recorded_at,
           r.resolved_lonja,
           r.resolved_min_price,
           r.resolved_max_price,
           r.resolved_avg_price,
           r.resolved_volume,
           jsonb_strip_nulls(jsonb_build_object(
             'source', r.resolved_source,
             'notes',  r.resolved_notes,
             'import_batch_id', p_batch_id::text
           )),
           p_batch_id,
           r.id
      from public.market_import_rows r
     where r.batch_id = p_batch_id
       and r.status   = 'valid'
     order by r.row_number
    on conflict (
      product_id,
      recorded_at,
      (coalesce(currency, '')),
      unit,
      (coalesce(btrim(lonja), ''))
    )
      do nothing
    returning id
  )
  select count(*) into v_insertadas from insertadas;

  -- 5. Cerrar el batch. `completed_with_errors` cuando algo se quedó fuera:
  --    quien importa debe ver de un vistazo que no entró todo.
  v_estado := case
    when v_batch.invalid_rows > 0 or v_batch.duplicate_rows > 0 or v_insertadas < v_batch.valid_rows
      then 'completed_with_errors'
    else 'completed'
  end;

  update public.market_import_batches
     set status        = v_estado,
         imported_rows = v_insertadas,
         imported_at   = now()
   where id = p_batch_id;

  return jsonb_build_object(
    'batch_id',       p_batch_id,
    'status',         v_estado,
    'imported_rows',  v_insertadas,
    'valid_rows',     v_batch.valid_rows,
    'invalid_rows',   v_batch.invalid_rows,
    'duplicate_rows', v_batch.duplicate_rows
  );
end;
$$;

comment on function public.commit_market_import(uuid) is
  '049 — importa las filas válidas de un batch en una sola transacción. '
  'Comprueba platform_admin internamente y bloquea el batch para que un doble '
  'clic no importe dos veces. Ya NO marca fila a fila: si una fila se importó '
  'se deriva de product_price_records.import_row_id.';

-- Los permisos se vuelven a declarar porque `create or replace` conserva los
-- existentes pero dejarlo escrito evita que una recreación futura los pierda.
-- Es la lección de la 029: el esquema tiene un `alter default privileges` que
-- concede EXECUTE a `anon` de forma DIRECTA, y revocar de PUBLIC no lo toca.
revoke all on function public.commit_market_import(uuid) from public;
revoke all on function public.commit_market_import(uuid) from anon;
grant execute on function public.commit_market_import(uuid) to authenticated, service_role;

-- ── Documentar la semántica nueva en las columnas ───────────────────────────
--
-- Que dejen de actualizarse sin que nadie lo sepa es exactamente el fallo que
-- estas dos líneas impiden.

comment on column public.market_import_rows.status is
  'Resultado de la VALIDACIÓN: valid | invalid | duplicate. Desde la 049 la '
  'confirmación ya no lo cambia a ''imported''; el valor ''imported'' solo '
  'aparece en filas anteriores a esa migración. Si una fila entró se deriva de '
  'la existencia de un precio con import_row_id = market_import_rows.id.';

comment on column public.market_import_rows.imported_record_id is
  'Histórico. Desde la 049 la confirmación ya no lo escribe. El lineage vivo '
  'es product_price_records.import_row_id. Se conserva la columna y su FK '
  'porque hay 78.274 filas antiguas que sí lo tienen, y su índice '
  '(idx_mir_imported_record, migración 044) porque respalda el on delete set '
  'null que usa el borrado masivo de precios.';

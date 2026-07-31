-- 035 — Borrado administrado de precios, con auditoría
--
-- ═════════════════════════════════════════════════════════════════════════════
-- POR QUÉ EXISTE
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Hasta ahora no había forma de retirar un precio mal cargado que no fuera
-- entrar a la base de datos a mano. Eso significa que cualquier corrección del
-- histórico —una lonja que cambia, un periodo importado con la unidad
-- equivocada, un fichero subido dos veces— dependía de que alguien escribiera
-- un DELETE en producción sin red debajo.
--
-- Este bloque convierte esa operación en algo que se puede revisar antes y
-- reconstruir después.
--
-- ── La idea que ordena el diseño ───────────────────────────────────────────
--
-- Un borrado se hace en DOS tiempos, igual que las importaciones (030) y la
-- actualización masiva de proveedores (033):
--
--   1. la VISTA PREVIA ejecuta la búsqueda en servidor y guarda, fila a fila,
--      una copia completa de cada precio que se va a borrar;
--   2. la CONFIRMACIÓN solo manda el identificador del lote, y borra
--      exactamente los identificadores que quedaron guardados en el paso 1.
--
-- Entre los dos pasos el navegador no puede añadir ni quitar nada. Y como la
-- copia se guarda ANTES de borrar, después del borrado sigue existiendo el dato
-- íntegro para saber qué había.
--
-- ═════════════════════════════════════════════════════════════════════════════
-- 1. Lotes de borrado
-- ═════════════════════════════════════════════════════════════════════════════

create table if not exists public.market_price_deletion_batches (
  id            uuid        primary key default gen_random_uuid(),

  -- ── Modos ─────────────────────────────────────────────────────────────────
  --
  --   import   una importación entera: sus precios, sus filas y el propio lote
  --   filters  los precios que casan con unos filtros concretos
  --   all      TODOS los precios. Acción diferenciada y con su propia frase de
  --            confirmación, precisamente porque no admite equivocarse
  mode          text        not null check (mode in ('import', 'filters', 'all')),

  status        text        not null default 'ready'
                            check (status in ('ready', 'completed',
                                              'completed_with_errors',
                                              'cancelled', 'failed')),

  -- Criterios usados, tal cual se aplicaron. Es lo que permite responder meses
  -- después a «¿por qué desapareció este precio?».
  filters       jsonb       not null default '{}'::jsonb,

  -- ── Por qué NO hay clave foránea al lote de importación ───────────────────
  --
  -- Porque en modo `import` ese lote se BORRA como parte de la operación. Una
  -- FK obligaría a ponerlo a null y se perdería justo el dato que explica el
  -- borrado. Se guarda el uuid suelto, y el nombre del fichero y sus contadores
  -- en `metadata`, para que la auditoría siga siendo legible cuando el original
  -- ya no exista.
  source_import_batch_id uuid,

  total_rows    integer     not null default 0,
  deleted_rows  integer     not null default 0,
  failed_rows   integer     not null default 0,

  created_by    uuid        references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  confirmed_at  timestamptz,
  completed_at  timestamptz,

  metadata      jsonb       not null default '{}'::jsonb,
  error_summary text,

  constraint mpdb_counts_positive check (
    total_rows >= 0 and deleted_rows >= 0 and failed_rows >= 0
  ),

  -- Un lote cerrado tiene fecha de cierre; uno abierto, no. Impide que un
  -- `update` suelto deje el registro diciendo dos cosas a la vez.
  constraint mpdb_completed_coherent check (
    (status in ('completed', 'completed_with_errors')) = (completed_at is not null)
  ),

  -- ── El cerrojo del borrado sin filtros ────────────────────────────────────
  --
  -- Un modo `filters` con el objeto vacío borraría TODOS los precios mientras
  -- la interfaz dice «borrado filtrado». Para eso está el modo `all`, que tiene
  -- su propia frase de confirmación. Aquí se hace imposible confundirlos.
  constraint mpdb_filters_not_empty check (
    mode <> 'filters' or (filters <> '{}'::jsonb)
  ),

  -- Y el modo `import` sin lote de origen no tiene sentido.
  constraint mpdb_import_needs_source check (
    mode <> 'import' or source_import_batch_id is not null
  )
);

comment on table public.market_price_deletion_batches is
  'Fase 2.5 (035) — una operación de borrado de precios: qué criterios, quién y '
  'cuándo. Solo platform_admin.';

create index if not exists idx_mpdb_created_at on public.market_price_deletion_batches (created_at desc);
create index if not exists idx_mpdb_source on public.market_price_deletion_batches (source_import_batch_id)
  where source_import_batch_id is not null;

-- ═════════════════════════════════════════════════════════════════════════════
-- 2. Filas: la copia de seguridad, fila a fila
-- ═════════════════════════════════════════════════════════════════════════════
--
-- `original_data` guarda el precio ENTERO —todas sus columnas— tal y como
-- estaba justo antes de borrarlo. No es un registro de que «algo se borró»: es
-- el dato, y con él se puede volver a insertar.
--
-- Tampoco aquí hay clave foránea a `product_price_records`: la fila a la que
-- apunta deja de existir por definición. `original_price_id` es un uuid suelto.

create table if not exists public.market_price_deletion_rows (
  id                uuid        primary key default gen_random_uuid(),
  deletion_batch_id uuid        not null references public.market_price_deletion_batches(id) on delete cascade,

  original_price_id uuid        not null,
  original_data     jsonb       not null,
  source_import_batch_id uuid,

  status            text        not null default 'pending'
                                check (status in ('pending', 'deleted', 'skipped', 'failed')),
  deleted_at        timestamptz,
  error             text,

  created_at        timestamptz not null default now(),

  -- El mismo precio no puede estar dos veces en el mismo lote: si lo estuviera,
  -- el contador de borrados diría el doble de lo que se borró.
  constraint mpdr_unique_price unique (deletion_batch_id, original_price_id),

  constraint mpdr_snapshot_object check (jsonb_typeof(original_data) = 'object'),

  constraint mpdr_deleted_coherent check (
    (status = 'deleted') = (deleted_at is not null)
  )
);

comment on table public.market_price_deletion_rows is
  'Fase 2.5 (035) — copia completa de cada precio antes de borrarlo. Es la '
  'ÚNICA fuente de qué se borra: la confirmación no acepta identificadores del '
  'navegador, solo el id del lote.';

comment on column public.market_price_deletion_rows.original_data is
  'Snapshot íntegro de la fila de product_price_records. Permite reconstruir el '
  'precio eliminado sin depender de ninguna copia externa.';

create index if not exists idx_mpdr_batch on public.market_price_deletion_rows (deletion_batch_id, created_at);
create index if not exists idx_mpdr_batch_status on public.market_price_deletion_rows (deletion_batch_id, status);
-- «¿Se borró alguna vez este precio, y en qué operación?»
create index if not exists idx_mpdr_price on public.market_price_deletion_rows (original_price_id);

-- ═════════════════════════════════════════════════════════════════════════════
-- 3. RLS — solo plataforma
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Una sola policy `ALL` por tabla, igual que en 030 y 033. Ningún perfil de
-- cliente tiene nada que hacer aquí: `original_data` contiene el histórico de
-- precios entero, incluidos los de mercados que su organización puede tener
-- deshabilitados.
--
-- Sin policy para el resto de `authenticated`, RLS deniega por defecto.

alter table public.market_price_deletion_batches enable row level security;
alter table public.market_price_deletion_rows    enable row level security;

drop policy if exists admin_all_price_deletion_batches on public.market_price_deletion_batches;
create policy admin_all_price_deletion_batches on public.market_price_deletion_batches
  for all using (is_platform_admin()) with check (is_platform_admin());

drop policy if exists admin_all_price_deletion_rows on public.market_price_deletion_rows;
create policy admin_all_price_deletion_rows on public.market_price_deletion_rows
  for all using (is_platform_admin()) with check (is_platform_admin());

-- ═════════════════════════════════════════════════════════════════════════════
-- 4. `apply_price_deletion(uuid)` — el borrado, en UNA transacción
-- ═════════════════════════════════════════════════════════════════════════════
--
-- ── Qué borra, exactamente ────────────────────────────────────────────────
--
-- Los precios cuyos identificadores están GUARDADOS en
-- `market_price_deletion_rows` para este lote. Ni uno más. No se vuelve a
-- ejecutar la búsqueda: si entre la vista previa y la confirmación alguien
-- importa precios nuevos que casarían con los mismos filtros, esos NO se
-- borran, porque nadie los ha visto ni los ha autorizado.
--
-- ── El caso `import` ──────────────────────────────────────────────────────
--
-- Además de los precios, borra las filas técnicas del lote de importación y el
-- lote en sí. Ese es el punto: dejar el sistema como si aquella importación no
-- se hubiera hecho, para poder volver a subir el fichero corregido sin que el
-- hash anterior lo señale como repetido.
--
-- El orden importa. `product_price_records.import_batch_id` es `on delete set
-- null`, así que borrar el lote primero desengancharía los precios y luego no
-- habría forma de saber cuáles eran suyos. Se borran los precios primero.
--
-- ── SECURITY DEFINER, y por qué es seguro ─────────────────────────────────
--
-- La PRIMERA línea comprueba `is_platform_admin()` y lanza si no lo es: la
-- función NO delega esa comprobación en quien la llama. Sin esa línea,
-- `security definer` sería una puerta para borrar el histórico de precios desde
-- cualquier sesión autenticada.

create or replace function public.apply_price_deletion(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch     public.market_price_deletion_batches%rowtype;
  v_borrados  integer := 0;
  v_omitidos  integer := 0;
  v_filas_imp integer := 0;
  v_lotes_imp integer := 0;
  v_estado    text;
begin
  -- 1. Autorización. Antes que nada y sin excepciones.
  if not public.is_platform_admin() then
    raise exception 'Solo un administrador de plataforma puede borrar precios.'
      using errcode = '42501';
  end if;

  -- 2. Bloqueo del lote. Serializa las confirmaciones concurrentes: doble clic
  --    o dos pestañas se ponen en fila y la segunda encuentra el lote cerrado.
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

  -- 4. Borrar SOLO los precios cuyo identificador quedó guardado en la vista
  --    previa. La lista es cerrada y ya tiene su copia en `original_data`.
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

  -- Lo que siguiera pendiente es un precio que ya no existía al confirmar
  -- —alguien lo borró por otra vía entre la vista previa y ahora—. No es un
  -- error: simplemente no había nada que borrar.
  update public.market_price_deletion_rows
     set status = 'skipped',
         error  = 'El precio ya no existía al confirmar el borrado.'
   where deletion_batch_id = p_batch_id
     and status = 'pending';

  get diagnostics v_omitidos = row_count;

  -- 5. Modo `import`: además, las filas técnicas y el propio lote.
  if v_batch.mode = 'import' and v_batch.source_import_batch_id is not null then
    delete from public.market_import_rows
     where batch_id = v_batch.source_import_batch_id;
    get diagnostics v_filas_imp = row_count;

    delete from public.market_import_batches
     where id = v_batch.source_import_batch_id;
    get diagnostics v_lotes_imp = row_count;
  end if;

  -- 6. Cerrar el lote.
  v_estado := case when v_omitidos > 0 then 'completed_with_errors' else 'completed' end;

  update public.market_price_deletion_batches
     set status       = v_estado,
         deleted_rows = v_borrados,
         failed_rows  = 0,
         confirmed_at = coalesce(confirmed_at, now()),
         completed_at = now(),
         metadata     = metadata || jsonb_build_object(
                          'skipped_rows',        v_omitidos,
                          'import_rows_deleted', v_filas_imp,
                          'import_batch_deleted', v_lotes_imp)
   where id = p_batch_id;

  return jsonb_build_object(
    'deletion_batch_id',    p_batch_id,
    'status',               v_estado,
    'deleted_rows',         v_borrados,
    'skipped_rows',         v_omitidos,
    'import_rows_deleted',  v_filas_imp,
    'import_batch_deleted', v_lotes_imp
  );
end;
$$;

comment on function public.apply_price_deletion(uuid) is
  'Fase 2.5 (035) — borra los precios cuyo id quedó guardado en la vista previa '
  'del lote, en una sola transacción. Comprueba platform_admin internamente y '
  'bloquea el lote para que un doble clic no borre dos veces. En modo import '
  'elimina también las filas y el lote de importación de origen.';

-- ═════════════════════════════════════════════════════════════════════════════
-- 5. Grants
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Se revoca de `anon` EXPRESAMENTE, no solo de `PUBLIC`. Es la lección de 029:
-- el esquema tiene un `alter default privileges … to anon`, y revocar de PUBLIC
-- no lo alcanza. Aquí importa especialmente: esta función BORRA.

revoke all on function public.apply_price_deletion(uuid) from public;
revoke all on function public.apply_price_deletion(uuid) from anon;
grant execute on function public.apply_price_deletion(uuid) to authenticated, service_role;

-- ═════════════════════════════════════════════════════════════════════════════
-- 6. Lo que esta migración NO hace
-- ═════════════════════════════════════════════════════════════════════════════
--
-- · No borra ni modifica un solo precio. Cero DML sobre datos reales: crea las
--   tablas y la función, nada más. El vaciado lo ejecuta la aplicación.
-- · No implementa restauración automática. `original_data` tiene lo necesario
--   para reinsertar, pero devolver un precio a una clave natural que quizá esté
--   ocupada exige decidir qué gana, y eso no lo decide una migración.
-- · No toca `products`, `markets`, proveedores, organizaciones ni RFQs.
-- · No toca la actualización masiva de proveedores (033) ni el importador de
--   precios (030/034).

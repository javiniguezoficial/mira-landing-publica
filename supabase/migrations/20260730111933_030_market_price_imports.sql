-- 030 — Importación masiva de precios de Market Intelligence (Fase 2.5, MVP)
--
-- ═════════════════════════════════════════════════════════════════════════════
-- LO PRIMERO: LA CLAVE NATURAL QUE FALTABA
-- ═════════════════════════════════════════════════════════════════════════════
--
-- `product_price_records` no tenía NINGUNA restricción de unicidad más allá de
-- su clave primaria sintética. Se podía insertar dos veces el mismo precio, del
-- mismo producto, del mismo día, y nada lo impedía. Sin esa clave no hay
-- importación idempotente posible: reimportar el fichero de la semana pasada
-- duplicaría el histórico en silencio.
--
-- ── Comprobado ANTES de crear el índice ─────────────────────────────────────
--
--   608 filas  →  608 claves distintas sobre (product_id, recorded_at,
--                 currency, unit)
--   0 duplicados. 0 filas sobrantes. Máximo de repeticiones: 1.
--
-- El índice se crea, por tanto, sin borrar, fusionar ni tocar un solo dato.
--
-- ── Por qué EXACTAMENTE esas cuatro columnas ────────────────────────────────
--
--   · product_id + recorded_at  — el hecho: qué se cotizó y qué día.
--   · currency                  — el mismo producto puede publicarse en dos
--                                 monedas el mismo día sin ser un duplicado.
--   · unit                      — ídem con €/ton y €/kg: son dos hechos, no uno.
--
-- `country` se evaluó y se DESCARTÓ. El modelo no demuestra que haga falta:
-- agrupando también por país siguen saliendo 0 duplicados, y no existe ni un
-- solo producto+fecha con más de un país (comprobado con
-- `count(distinct country) > 1`, que devuelve 0). Añadirlo relajaría la
-- restricción sin ninguna evidencia que lo justifique.
--
-- Si algún día se publica el mismo producto el mismo día con precio distinto en
-- ES y en EU, habrá que ampliar la clave con `country`. Ese cambio ES posible
-- —ampliar una clave nunca falla sobre datos existentes—, y es preferible
-- empezar restrictivo y relajar que al revés.

create unique index if not exists product_price_records_natural_key
  on public.product_price_records (product_id, recorded_at, currency, unit);

comment on index public.product_price_records_natural_key is
  'Fase 2.5 — clave natural de un precio. Es lo que hace idempotente la '
  'importación masiva: el mismo fichero subido dos veces no duplica nada.';

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. Batches de importación
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Un batch es UNA operación de carga: un fichero, un periodo, una persona.
--
-- ── Por qué se persiste y no se valida en memoria ───────────────────────────
--
-- El importador anterior validaba en el servidor, devolvía el array de filas al
-- navegador y volvía a recibirlo para insertar. Eso significa que el cliente
-- podía MODIFICAR lo validado entre los dos pasos: cambiar un `product_id`, un
-- precio o una fecha, y el servidor lo insertaba tal cual porque confiaba en su
-- propia validación previa.
--
-- Aquí las filas validadas viven en la BASE DE DATOS. La confirmación solo
-- manda un identificador de batch; qué se inserta lo decide el servidor leyendo
-- lo que él mismo validó. El navegador no puede alterar ni un valor.

create table if not exists public.market_import_batches (
  id            uuid        primary key default gen_random_uuid(),

  filename      text        not null,
  -- sha256 del contenido. Detecta la reimportación del MISMO fichero, que es el
  -- error humano más frecuente: subir dos veces el boletín de la semana.
  file_hash     text        not null,
  file_size     integer     not null,

  period_type   text        not null check (period_type in ('week', 'month', 'year')),
  period_from   date        not null,
  period_to     date        not null,
  period_label  text        not null,

  status        text        not null default 'ready'
                            check (status in ('ready', 'invalid', 'completed',
                                              'completed_with_errors', 'cancelled')),

  total_rows      integer   not null default 0,
  valid_rows      integer   not null default 0,
  invalid_rows    integer   not null default 0,
  duplicate_rows  integer   not null default 0,
  imported_rows   integer   not null default 0,

  -- `set null`: si la persona se da de baja, el batch debe conservarse. Lo que
  -- se pierde es la autoría, no la trazabilidad de qué se importó.
  created_by    uuid        references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  validated_at  timestamptz,
  imported_at   timestamptz,

  metadata      jsonb       not null default '{}'::jsonb,

  constraint market_import_batches_period_order check (period_from <= period_to)
);

comment on table public.market_import_batches is
  'Fase 2.5 — una operación de importación masiva de precios: un fichero, un '
  'periodo y una persona. Solo platform_admin.';

-- Listado administrativo: los más recientes primero.
create index if not exists idx_mib_created_at on public.market_import_batches (created_at desc);
-- Detección de reimportación del mismo fichero.
create index if not exists idx_mib_file_hash on public.market_import_batches (file_hash);

-- ═════════════════════════════════════════════════════════════════════════════
-- 2. Filas del batch
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Cada fila del CSV, con su estado y sus errores. Se guardan TODAS —también las
-- inválidas y las duplicadas—, porque son justo las que hay que poder revisar y
-- descargar después.
--
-- `raw_data` conserva la fila original tal cual venía. Es lo que permite
-- reconstruir el CSV de errores sin volver a pedir el fichero.

create table if not exists public.market_import_rows (
  id            uuid        primary key default gen_random_uuid(),
  batch_id      uuid        not null references public.market_import_batches(id) on delete cascade,

  -- Número de línea en el fichero, contando la cabecera como 1. Es lo que la
  -- persona ve en Excel, así que es lo que hay que enseñarle.
  row_number    integer     not null,

  status        text        not null
                            check (status in ('valid', 'invalid', 'duplicate', 'imported')),

  raw_data          jsonb   not null,
  validation_errors jsonb   not null default '[]'::jsonb,

  -- Entidades resueltas. Nulas si la fila no llegó a resolverse.
  resolved_market_id   uuid  references public.markets(id)   on delete set null,
  resolved_product_id  uuid  references public.products(id)  on delete set null,
  resolved_recorded_at date,
  resolved_price       numeric,
  resolved_currency    text,
  resolved_unit        text,
  resolved_country     text,
  resolved_region      text,
  resolved_min_price   numeric,
  resolved_max_price   numeric,
  resolved_avg_price   numeric,
  resolved_volume      numeric,
  resolved_source      text,
  resolved_notes       text,

  -- Se rellena al importar. `set null` para que borrar un precio no destruya el
  -- registro de que aquella fila se importó.
  imported_record_id uuid   references public.product_price_records(id) on delete set null,

  created_at    timestamptz not null default now(),

  constraint market_import_rows_unique_line unique (batch_id, row_number)
);

comment on table public.market_import_rows is
  'Fase 2.5 — cada fila del fichero importado, con su estado y sus errores. Es '
  'la fuente de verdad de qué se inserta: la confirmación no acepta datos del '
  'navegador, solo el identificador del batch.';

-- El acceso real es siempre «las filas de este batch», paginadas por línea.
create index if not exists idx_mir_batch_line on public.market_import_rows (batch_id, row_number);
-- Y filtradas por estado en la previsualización.
create index if not exists idx_mir_batch_status on public.market_import_rows (batch_id, status);

-- ═════════════════════════════════════════════════════════════════════════════
-- 3. Auditoría en `product_price_records`
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Dos columnas nullable. Los 608 registros anteriores quedan con NULL, que es
-- exactamente lo correcto: no vinieron de ninguna importación y no hay nada que
-- inventarles.
--
-- `on delete set null` en las dos: borrar un batch no puede llevarse por delante
-- precios reales. Se pierde la trazabilidad de ese lote, no el dato.

alter table public.product_price_records
  add column if not exists import_batch_id uuid references public.market_import_batches(id) on delete set null;

alter table public.product_price_records
  add column if not exists import_row_id uuid references public.market_import_rows(id) on delete set null;

comment on column public.product_price_records.import_batch_id is
  'Fase 2.5 — lote de importación del que salió este precio. NULL en los '
  'registros anteriores a 030 y en las altas manuales.';

create index if not exists idx_ppr_import_batch
  on public.product_price_records (import_batch_id)
  where import_batch_id is not null;

-- ═════════════════════════════════════════════════════════════════════════════
-- 4. RLS — solo plataforma
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Una sola policy `ALL` por tabla. No hay ningún caso en el que un cliente deba
-- ver un batch: sabría qué ficheros se suben, cómo se llaman y qué contienen.
-- Sin policy para `authenticated` normal, RLS deniega por defecto — que es la
-- postura correcta y no hace falta escribir una policy para conseguirla.

alter table public.market_import_batches enable row level security;
alter table public.market_import_rows    enable row level security;

drop policy if exists admin_all_import_batches on public.market_import_batches;
create policy admin_all_import_batches on public.market_import_batches
  for all using (is_platform_admin()) with check (is_platform_admin());

drop policy if exists admin_all_import_rows on public.market_import_rows;
create policy admin_all_import_rows on public.market_import_rows
  for all using (is_platform_admin()) with check (is_platform_admin());

-- ═════════════════════════════════════════════════════════════════════════════
-- 5. `commit_market_import(uuid)` — la importación, en UNA transacción
-- ═════════════════════════════════════════════════════════════════════════════
--
-- ── Por qué una función y no varias sentencias desde la Server Action ───────
--
-- Insertar los precios, marcar las filas como importadas y cerrar el batch son
-- tres pasos que TIENEN que ocurrir juntos. Desde la aplicación serían tres
-- viajes: si el proceso muere entre el primero y el segundo, quedan precios
-- insertados que el batch dice no haber importado, y la siguiente confirmación
-- los volvería a intentar. Dentro de una función es una sola transacción.
--
-- ── Idempotencia y doble clic ───────────────────────────────────────────────
--
-- El `select … for update` bloquea la fila del batch. Dos peticiones simultáneas
-- —doble clic, dos pestañas— se serializan: la primera importa y deja el estado
-- en `completed`; la segunda despierta, ve que ya no es `ready` y sale con un
-- error claro sin insertar nada.
--
-- Además el INSERT lleva `on conflict do nothing` sobre la clave natural. La
-- validación ya descartó los duplicados, pero entre validar y confirmar pueden
-- pasar minutos y alguien puede haber cargado ese precio por otra vía. Sin esa
-- cláusula, una sola colisión abortaría la transacción entera.
--
-- ── SECURITY DEFINER, y por qué es seguro aquí ──────────────────────────────
--
-- Lo es porque escribe en `product_price_records`, cuya policy de escritura es
-- `admin_all_price_records`. La primera línea del cuerpo comprueba
-- `is_platform_admin()` y lanza si no lo es: la función NO delega esa
-- comprobación en quien la llama. Sin esa línea, `security definer` la
-- convertiría en una puerta trasera para cualquier `authenticated`.

create or replace function public.commit_market_import(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch     public.market_import_batches%rowtype;
  v_insertadas integer := 0;
  v_estado    text;
begin
  -- 1. Autorización. Antes que nada y sin excepciones.
  if not public.is_platform_admin() then
    raise exception 'Solo un administrador de plataforma puede importar precios.'
      using errcode = '42501';
  end if;

  -- 2. Bloqueo del batch. Serializa las confirmaciones concurrentes.
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

  -- 4. Insertar SOLO las filas válidas. Las inválidas y las duplicadas no se
  --    tocan: siguen en la tabla con su estado para poder revisarlas.
  with insertadas as (
    insert into public.product_price_records (
      product_id, price, unit, currency, country, region, recorded_at,
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
    on conflict (product_id, recorded_at, currency, unit) do nothing
    returning id, import_row_id
  )
  update public.market_import_rows r
     set status = 'imported',
         imported_record_id = i.id
    from insertadas i
   where r.id = i.import_row_id;

  get diagnostics v_insertadas = row_count;

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
    'batch_id',      p_batch_id,
    'status',        v_estado,
    'imported_rows', v_insertadas,
    'valid_rows',    v_batch.valid_rows,
    'invalid_rows',  v_batch.invalid_rows,
    'duplicate_rows', v_batch.duplicate_rows
  );
end;
$$;

comment on function public.commit_market_import(uuid) is
  'Fase 2.5 — importa las filas válidas de un batch en una sola transacción. '
  'Comprueba platform_admin internamente y bloquea el batch para que un doble '
  'clic no importe dos veces.';

-- ═════════════════════════════════════════════════════════════════════════════
-- 6. Grants
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Se revoca de `anon` EXPRESAMENTE, no solo de `PUBLIC`.
--
-- Es la lección de la migración 029: el esquema tiene un
-- `alter default privileges … grant execute on functions to anon, authenticated,
-- service_role`, y ese grant a `anon` es DIRECTO. Revocar de `PUBLIC` no lo
-- toca, así que las funciones de 027 y 028 nacieron ejecutables por usuarios
-- anónimos y hubo que corregirlo después.
--
-- Aquí importaría más: esta función ESCRIBE. Aunque su primera línea comprueba
-- `is_platform_admin()` y un `anon` nunca pasaría, dejarle EXECUTE sobre una
-- función que inserta precios no tiene ninguna justificación.

revoke all on function public.commit_market_import(uuid) from public;
revoke all on function public.commit_market_import(uuid) from anon;
grant execute on function public.commit_market_import(uuid) to authenticated, service_role;

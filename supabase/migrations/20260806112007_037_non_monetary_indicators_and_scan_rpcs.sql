-- 037 — Indicadores sin moneda, y lectura COMPLETA de lonjas y facetas
--
-- ═════════════════════════════════════════════════════════════════════════════
-- LOS DOS FALLOS QUE SE CORRIGEN
-- ═════════════════════════════════════════════════════════════════════════════
--
-- ── 1. No todo lo que hay en Market Intelligence es un precio ───────────────
--
-- El catálogo tiene 16 referencias que NO son precios y que por eso llevan
-- tiempo sin poder cargarse:
--
--   · 12 índices FAO —«Food Price Index», «Real Sugar Price»…— configurados en
--     `products.unit = 'unidad'`. Son números adimensionales en base 100.
--   ·  4 indicadores del INE —IPC, IPRI con energía, IPRI sin energía y tasa de
--     paro— configurados en `products.unit = '%'`.
--
-- `product_price_records.currency` es `not null default 'EUR'`, así que para
-- guardar el IPC había que decirle a la base que el 2,5 % está en euros. La
-- consecuencia no es cosmética: la ficha del producto enseña «2,5 €» y las
-- tarjetas de mínimo, máximo y media dicen todas euros sobre un porcentaje.
--
-- La alternativa —un valor centinela tipo 'NONE' o 'N/A'— se descarta: sería
-- una moneda inventada que aparecería en el desplegable de monedas, en los
-- filtros y en las exportaciones, y habría que acordarse de esconderla en cada
-- sitio nuevo. `NULL` ya significa exactamente «no aplica».
--
-- ── 2. Las lonjas y las facetas se leían recortadas ────────────────────────
--
-- PostgREST corta cualquier respuesta en `db-max-rows` (1.000 filas en este
-- proyecto). Las consultas que construían el desplegable de lonjas leían FILAS
-- de precio y deducían los valores distintos en JavaScript, así que a partir de
-- 1.000 precios dejaban de ver el resto de la tabla.
--
-- Medido sobre los datos reales, y coincide EXACTAMENTE con lo que reporta el
-- cliente:
--
--   «Canal Estándar»  2.523 precios   20 lonjas reales
--                     …pero en las 1.000 primeras filas solo aparecen 8.
--
-- No era un `slice(0, 8)` ni un problema de CSS: era el techo de PostgREST. Un
-- `.limit(50000)` en el cliente no lo levanta — el servidor recorta igual.
--
-- La solución es no traer filas: estas funciones devuelven UN valor escalar
-- `jsonb` ya agregado. Una respuesta de una sola fila no puede recortarse, sea
-- cual sea el tamaño de la tabla, y de paso el agregado lo hace PostgreSQL en
-- lugar de viajar 73.000 filas por la red para descartar 72.900.
--
-- ═════════════════════════════════════════════════════════════════════════════
-- ESTADO MEDIDO ANTES DE APLICAR
-- ═════════════════════════════════════════════════════════════════════════════
--
--   product_price_records          73.340 filas
--   currency                       EUR 71.122 · USD 1.844 · GBP 374 · NULL 0
--   unit                           11 valores, TODOS monetarios
--                                  (100 kg, ton, kg, 100 docenas, 100 libras,
--                                   MWh, 100 l, oz, hl, BRT, cabeza)
--   filas con unit '%' / 'Unidades'                          0
--   duplicados bajo la clave natural PROPUESTA               0
--
-- Es decir: ninguna fila existente incumple la restricción que se añade abajo,
-- y la clave natural nueva produce exactamente las mismas 73.340 claves que la
-- actual, porque `coalesce(currency, '')` sobre una columna sin nulos es la
-- propia columna.
--
-- ESTA MIGRACIÓN NO ESCRIBE NI BORRA NI UN SOLO REGISTRO DE PRECIO.

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. `currency` deja de ser obligatoria
-- ═════════════════════════════════════════════════════════════════════════════
--
-- El `default 'EUR'` se retira además del `not null`. Dejarlo sería peor que
-- inútil: una inserción que se olvide de la moneda seguiría recibiendo euros en
-- silencio, que es justo la suposición que esta migración existe para quitar.
-- Sin default, olvidarse produce un error inmediato de la restricción de abajo.

alter table public.product_price_records
  alter column currency drop not null;

alter table public.product_price_records
  alter column currency drop default;

comment on column public.product_price_records.currency is
  'Fase 037 — moneda ISO del valor (EUR, USD, GBP), o NULL cuando la magnitud '
  'no es dinero: porcentajes (unit = ''%'') e índices adimensionales '
  '(unit = ''Unidades''). NULL significa «no aplica», nunca «no se sabe».';

-- ═════════════════════════════════════════════════════════════════════════════
-- 2. La coherencia entre moneda y unidad, garantizada por la base
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Sin esta restricción, «currency nullable» sería una invitación a que la mitad
-- de los precios acabaran sin moneda por descuido. La regla es simétrica y no
-- admite excepciones:
--
--   unidad NO monetaria  →  currency DEBE ser NULL
--   cualquier otra       →  currency DEBE estar informada
--
-- ── Por qué la lista de unidades va escrita aquí ───────────────────────────
--
-- Porque es una allowlist, no una heurística. Una unidad nueva que deba ir sin
-- moneda tendrá que añadirse a esta lista con una migración, y eso es
-- deliberado: que aparezca en la revisión de un cambio de esquema en lugar de
-- colarse desde una constante de TypeScript.
--
-- ── Por qué en minúsculas ──────────────────────────────────────────────────
--
-- El histórico ha usado «Unidades», «unidad» y «unidades» para la misma cosa.
-- La forma canónica que escribe la aplicación es «Unidades», pero un alta
-- manual con otra grafía no debe acabar exigiendo una moneda que no existe.
-- `lower()` es IMMUTABLE, así que puede formar parte de un CHECK.
--
-- Se valida contra las 73.340 filas existentes al crearla. Ninguna la incumple.

alter table public.product_price_records
  add constraint product_price_records_currency_unit_consistency
  check (
    case
      when lower(btrim(unit)) in ('%', 'unidades', 'unidad', 'ud', 'uds')
        then currency is null
      else currency is not null
    end
  );

comment on constraint product_price_records_currency_unit_consistency
  on public.product_price_records is
  'Fase 037 — un porcentaje o un índice NO llevan moneda; cualquier otra unidad '
  'la exige. Impide tanto «2,5 EUR» sobre el IPC como un precio en kg sin divisa.';

-- ═════════════════════════════════════════════════════════════════════════════
-- 3. Clave natural: `coalesce` también sobre la moneda
-- ═════════════════════════════════════════════════════════════════════════════
--
-- En un índice único de PostgreSQL NULL nunca es igual a NULL. Con `currency`
-- ya nullable, dejar la columna a secas en la clave permitiría insertar
-- infinitas filas del mismo índice FAO, el mismo día y la misma lonja — el
-- agujero exacto que la clave natural existe para tapar, reabierto justo en las
-- series que más se van a reimportar.
--
-- `coalesce(currency, '')` lo cierra, con la misma forma que ya se usaba para
-- la lonja desde 034.
--
-- ── Comprobado ANTES de recrear el índice ──────────────────────────────────
--
--   73.340 filas → 73.340 claves distintas sobre
--                  (product_id, recorded_at, coalesce(currency,''), unit,
--                   coalesce(btrim(lonja),''))
--   0 grupos duplicados.
--
-- El índice se recrea sin borrar, fusionar ni tocar un solo registro. Para los
-- datos actuales la clave resultante es IDÉNTICA a la anterior: `coalesce`
-- sobre una columna sin nulos no cambia nada. El cambio solo abre la puerta a
-- las filas futuras sin moneda.

drop index if exists public.product_price_records_natural_key;

create unique index if not exists product_price_records_natural_key
  on public.product_price_records (
    product_id,
    recorded_at,
    (coalesce(currency, '')),
    unit,
    (coalesce(btrim(lonja), ''))
  );

comment on index public.product_price_records_natural_key is
  'Fase 037 — clave natural de un valor de mercado. La moneda entra con '
  'coalesce porque puede faltar (índices y porcentajes), igual que la lonja '
  'desde 034: sin él, NULL <> NULL dejaría entrar duplicados indistinguibles.';

-- El facet de unidades del panel de precios recorre la tabla entera. Con 11
-- valores distintos sobre 73.000 filas, un índice basta para resolverlo sin
-- leer el montón.
create index if not exists idx_ppr_unit
  on public.product_price_records (unit);

-- ═════════════════════════════════════════════════════════════════════════════
-- 4. `commit_market_import` — mismo cuerpo, moneda opcional
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Cambia SOLO el `on conflict`, que debe reproducir la expresión del índice
-- carácter a carácter: si no coincide, PostgreSQL no sabe a qué índice se
-- refiere y la función falla en tiempo de ejecución, no al crearla.
--
-- `resolved_currency` ya era nullable en `market_import_rows`, así que una fila
-- de índice llega aquí con NULL y se inserta con NULL. No hace falta tocar la
-- tabla de filas.
--
-- Todo lo demás es idéntico a 034: misma comprobación de `platform_admin` en la
-- primera línea, mismo `for update` sobre el batch, mismo bloqueo de la segunda
-- confirmación, mismos estados y mismo resumen. La confirmación sigue recibiendo
-- ÚNICAMENTE `p_batch_id`: el navegador no envía ni un dato de la fila.

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

  -- 4. Insertar SOLO las filas válidas.
  with insertadas as (
    insert into public.product_price_records (
      product_id, price, unit, currency, country, region, recorded_at, lonja,
      min_price, max_price, avg_price, volume, metadata,
      import_batch_id, import_row_id
    )
    select r.resolved_product_id,
           r.resolved_price,
           r.resolved_unit,
           -- 037 — sin `coalesce`: un NULL aquí es la respuesta correcta para un
           -- índice o un porcentaje, no un hueco que rellenar con euros.
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
    returning id, import_row_id
  )
  update public.market_import_rows r
     set status = 'imported',
         imported_record_id = i.id
    from insertadas i
   where r.id = i.import_row_id;

  get diagnostics v_insertadas = row_count;

  -- 5. Cerrar el batch.
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
  'Fase 037 — importa las filas válidas de un batch en una sola transacción. '
  'La moneda puede ser NULL (índices y porcentajes). Comprueba platform_admin '
  'internamente y bloquea el batch para que un doble clic no importe dos veces.';

-- ═════════════════════════════════════════════════════════════════════════════
-- 5. Lonjas y facetas COMPLETAS, sin techo de PostgREST
-- ═════════════════════════════════════════════════════════════════════════════
--
-- ── Sobre la seguridad de estas cuatro funciones ───────────────────────────
--
-- Son SECURITY INVOKER —el modo por defecto, escrito de forma explícita para
-- que se vea— así que se ejecutan con los permisos de quien llama y las
-- policies de `product_price_records` se aplican íntegras. Una organización con
-- un mercado deshabilitado (028) NO ve sus lonjas aquí, exactamente igual que
-- no las veía con la consulta directa que sustituyen.
--
-- Eso es lo que las hace seguras y también lo que impide marcarlas SECURITY
-- DEFINER «para que vayan más rápido»: saltarse RLS aquí filtraría el catálogo
-- ajeno en un desplegable.
--
-- `stable` y no `volatile`: solo leen. Permite a PostgreSQL reutilizar el
-- resultado dentro de la misma sentencia.

-- ── 5.1 Lonjas de UN producto ──────────────────────────────────────────────
--
-- Lo que puebla el selector de la ficha de producto. Sustituye a la lectura de
-- hasta 50.000 filas de precio que PostgREST recortaba en 1.000 — el fallo de
-- las «solo 8 primeras lonjas».
--
-- No se ordena aquí: el orden alfabético español lo pone el cliente con
-- `localeCompare('es')`, que sabe de acentos y de ñ sin depender de qué
-- colación tenga instalada la base.

create or replace function public.market_product_lonjas(p_product_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(jsonb_agg(distinct btrim(r.lonja)), '[]'::jsonb)
    from public.product_price_records r
   where r.product_id = p_product_id
     and r.lonja is not null
     and btrim(r.lonja) <> '';
$$;

comment on function public.market_product_lonjas(uuid) is
  'Fase 037 — lonjas DISTINTAS con precios para una referencia, como array '
  'jsonb. Devuelve un escalar a propósito: una respuesta de una sola fila no '
  'la puede recortar el techo de filas de PostgREST.';

-- ── 5.2 Lonjas de TODO el catálogo, por producto ───────────────────────────
--
-- Alimenta el filtro de la portada de Market Intelligence, que necesita saber
-- qué productos tienen precios de cada lonja para poder podar el árbol.
--
-- Un objeto `{ "<product_id>": ["España", "Europa"] }`. Hoy son 1.230 pares
-- producto-lonja: unos pocos kilobytes frente a las 73.340 filas que se leían
-- —y se recortaban— para deducir lo mismo.

create or replace function public.market_catalog_lonjas()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(jsonb_object_agg(t.product_id, t.lonjas), '{}'::jsonb)
    from (
      select r.product_id::text as product_id,
             jsonb_agg(distinct btrim(r.lonja)) as lonjas
        from public.product_price_records r
       where r.lonja is not null
         and btrim(r.lonja) <> ''
       group by r.product_id
    ) t;
$$;

comment on function public.market_catalog_lonjas() is
  'Fase 037 — mapa producto → lonjas con precios, para el filtro de la portada '
  'de Market Intelligence. Escalar jsonb por la misma razón que 5.1.';

-- ── 5.3 Facetas del panel de precios ───────────────────────────────────────
--
-- Los desplegables «Lonja» y «Unidad» del histórico administrativo y de la
-- vista de precios del cliente. Se leían con un `select unit, lonja` sin
-- límite: recortado en 1.000 filas de 73.340, ofrecía un subconjunto arbitrario
-- de los valores reales.

create or replace function public.market_price_facets()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'lonjas', coalesce((
      select jsonb_agg(distinct btrim(r.lonja))
        from public.product_price_records r
       where r.lonja is not null and btrim(r.lonja) <> ''
    ), '[]'::jsonb),
    'units', coalesce((
      select jsonb_agg(distinct btrim(r.unit))
        from public.product_price_records r
       where r.unit is not null and btrim(r.unit) <> ''
    ), '[]'::jsonb)
  );
$$;

comment on function public.market_price_facets() is
  'Fase 037 — valores distintos de lonja y unidad presentes en los precios, '
  'para los filtros del panel. Sustituye a una lectura de tabla recortada.';

-- ── 5.4 Claves naturales ya guardadas, acotadas ────────────────────────────
--
-- La vista previa de la importación necesita saber qué filas del fichero ya
-- existen. Lo hacía leyendo `product_price_records` ENTERA, cosa que además de
-- recortarse en 1.000 filas habría sido inviable con 73.340.
--
-- Se acota por los DOS ejes que el propio importador ya garantiza:
--
--   · los productos que aparecen en el fichero;
--   · el periodo del batch — una fila fuera de él ya se rechaza por fecha, así
--     que sus duplicados no pueden interesar.
--
-- Devuelve tuplas, no claves formadas: la canonización de la unidad («Unidades»
-- ≡ «unidad») vive en TypeScript y no debe duplicarse en SQL, porque dos
-- implementaciones de la misma regla acaban discrepando.

create or replace function public.market_existing_price_keys(
  p_product_ids uuid[],
  p_from date,
  p_to date
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(jsonb_agg(jsonb_build_array(
           r.product_id::text,
           to_char(r.recorded_at, 'YYYY-MM-DD'),
           coalesce(r.currency, ''),
           r.unit,
           coalesce(btrim(r.lonja), '')
         )), '[]'::jsonb)
    from public.product_price_records r
   where r.product_id = any(p_product_ids)
     and r.recorded_at >= p_from
     and r.recorded_at <= p_to;
$$;

comment on function public.market_existing_price_keys(uuid[], date, date) is
  'Fase 037 — claves naturales ya guardadas para los productos y el periodo de '
  'un fichero de importación. Acotada por producto y por fecha para que la '
  'vista previa no dependa de leer la tabla entera.';

-- ═════════════════════════════════════════════════════════════════════════════
-- 6. Grants
-- ═════════════════════════════════════════════════════════════════════════════
--
-- El revoke de `anon` es EXPRESO, no solo de PUBLIC: el esquema tiene un
-- `alter default privileges … to anon`, y revocar de PUBLIC no lo alcanza. Es
-- la lección de 029 y se repite en cada función nueva.
--
-- Las cuatro son de lectura y van a `authenticated`: el selector de lonjas lo
-- usa el área de cliente, y RLS ya decide qué ve cada organización.

revoke all on function public.commit_market_import(uuid) from public;
revoke all on function public.commit_market_import(uuid) from anon;
grant execute on function public.commit_market_import(uuid) to authenticated, service_role;

revoke all on function public.market_product_lonjas(uuid) from public;
revoke all on function public.market_product_lonjas(uuid) from anon;
grant execute on function public.market_product_lonjas(uuid) to authenticated, service_role;

revoke all on function public.market_catalog_lonjas() from public;
revoke all on function public.market_catalog_lonjas() from anon;
grant execute on function public.market_catalog_lonjas() to authenticated, service_role;

revoke all on function public.market_price_facets() from public;
revoke all on function public.market_price_facets() from anon;
grant execute on function public.market_price_facets() to authenticated, service_role;

revoke all on function public.market_existing_price_keys(uuid[], date, date) from public;
revoke all on function public.market_existing_price_keys(uuid[], date, date) from anon;
grant execute on function public.market_existing_price_keys(uuid[], date, date) to authenticated, service_role;

-- ═════════════════════════════════════════════════════════════════════════════
-- 7. Lo que esta migración NO hace
-- ═════════════════════════════════════════════════════════════════════════════
--
-- · No escribe, no borra y no reescribe ningún precio. Cero UPDATE, cero DELETE.
-- · No toca los 1.329 snapshots de `market_price_deletion_rows`.
-- · No convierte porcentajes ni índices a ninguna otra magnitud. Un 2,5 se
--   guarda como 2,5 y se enseña «2,5 %».
-- · No reinterpreta el `%` como una variación calculada: es el valor importado.
-- · No normaliza las unidades del histórico ni `products.unit`. Las 16
--   referencias de índice y porcentaje siguen configuradas como estaban;
--   «unidad» sigue siendo una grafía admitida que canoniza a «Unidades».
-- · No crea una tabla de lonjas ni de fuentes. `source` sigue viviendo en
--   `metadata->>'source'`, que es donde están las 73.340 filas.
-- · No toca policies, ni usuarios, ni roles, ni organizaciones, ni membresías,
--   ni Stripe, ni proveedores, ni la actualización masiva 3.2. El recuento de
--   policies sigue siendo 64.

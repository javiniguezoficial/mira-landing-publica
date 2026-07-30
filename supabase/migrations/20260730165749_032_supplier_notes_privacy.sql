-- 032 — `suppliers.notes` deja de ser legible por usuarios cliente
--
-- Hotfix de privacidad. No forma parte de 3.5: no introduce planes, membresías
-- ni matriz de campos. Cierra una sola cosa que el código ya trataba
-- inequívocamente como interna.
--
-- ═════════════════════════════════════════════════════════════════════════════
-- LA EXPOSICIÓN
-- ═════════════════════════════════════════════════════════════════════════════
--
-- `client_select_active_suppliers` concede SELECT sobre la FILA COMPLETA de
-- cualquier proveedor activo a cualquier usuario autenticado:
--
--   using (auth.uid() is not null and is_active = true)
--
-- RLS filtra filas, no columnas. Y `authenticated` tiene SELECT a nivel de
-- tabla, así que hereda todas las columnas.
--
-- Comprobado en producción suplantando a Ana (owner de Acme, NO administradora):
--
--   select notes from public.suppliers where notes is not null
--   →  169 filas legibles, contenido incluido
--
-- La interfaz y la exportación de cliente ya excluían `notes`, pero eso vive en
-- la aplicación: una petición directa a PostgREST con la clave anónima y una
-- sesión de cliente las devolvía igual.
--
-- ── Por qué `notes` y solo `notes` ──────────────────────────────────────────
--
-- Es el único campo que el código actual trata de forma INEQUÍVOCA como
-- administrativo:
--
--   · el formulario lo rotula «Observaciones internas»;
--   · solo aparece en la ficha de administración;
--   · la exportación lo etiqueta «Notas internas» y lo excluye del cliente.
--
-- El resto de campos —`email`, `phone`, `tax_id`, `produccion_value`,
-- coordenadas— son COMERCIALES y su clasificación está pendiente de la decisión
-- de membresía (3.5). Ocultarlos aquí sería adelantar esa decisión sin
-- aprobación, y además retiraría datos que el cliente ya usa hoy.
--
-- `id`, `is_active`, `created_at` y `updated_at` son técnicos pero NO
-- confidenciales, y la aplicación los necesita: `id` para navegar y seleccionar,
-- `is_active` para el propio filtro de la policy. Se dejan.
--
-- ═════════════════════════════════════════════════════════════════════════════
-- POR QUÉ NO BASTA UN REVOKE, Y POR QUÉ TAMPOCO VALE UNA VISTA A SECAS
-- ═════════════════════════════════════════════════════════════════════════════
--
-- El obstáculo real es que **administración y cliente son el MISMO rol de base
-- de datos**: los dos entran como `authenticated`. Un privilegio de columna se
-- concede por rol, así que `revoke select (notes) … from authenticated` se la
-- quita también a `platform_admin`, que la necesita para la ficha, el
-- formulario de edición y su exportación.
--
-- Una vista `suppliers_client` sin `notes` tampoco resuelve nada por sí sola:
-- mientras la tabla base siga siendo legible, cualquiera consulta la tabla en
-- lugar de la vista. La vista solo sirve acompañada del mismo revoke, y entonces
-- vuelve el problema anterior.
--
-- La única forma de distinguir administración de cliente dentro de PostgreSQL
-- es una función `security definer` que consulte `is_platform_admin()`. De ahí
-- el diseño en tres piezas:
--
--   1. REVOKE de la columna para `anon` y `authenticated`
--        → cierra la lectura directa por PostgREST para TODOS.
--   2. `search_suppliers` deja de devolver `notes`
--        → sigue siendo SECURITY INVOKER y funciona para los dos perfiles.
--   3. `admin_supplier_notes(uuid[])`, SECURITY DEFINER con comprobación interna
--        → devuelve las notas SOLO a `platform_admin`.
--
-- NO se convierte `search_suppliers` en SECURITY DEFINER: eso saltaría la RLS
-- de `suppliers` y sería un problema mucho mayor que el que se está cerrando.

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. Retirar el SELECT de tabla y conceder columna a columna
-- ═════════════════════════════════════════════════════════════════════════════
--
-- ── Por qué NO basta `revoke select (notes)` ────────────────────────────────
--
-- Se intentó primero, y NO surtió efecto: Ana seguía leyendo las 169 notas.
--
-- En PostgreSQL los privilegios de columna solo SUMAN. Si un rol tiene SELECT a
-- nivel de TABLA —y `authenticated` lo tenía—, ya alcanza todas las columnas, y
-- un `revoke` sobre una columna concreta no le resta nada. La única forma es
-- retirar el privilegio de tabla y volver a conceder, columna a columna, las
-- permitidas.
--
-- Efecto secundario y aceptado: `select *` sobre `suppliers` deja de funcionar
-- para `authenticated`, incluida la administración. Es correcto —nadie debería
-- pedir columnas a ciegas— y el código ya listaba columnas explícitas en todas
-- partes.
--
-- Se revoca también de `anon`: no puede llegar a la tabla, porque las policies
-- exigen `auth.uid() is not null`, pero el privilegio estaba concedido y un
-- privilegio que no debería existir se retira aunque hoy no sea alcanzable.
--
-- `postgres` y `service_role` conservan el acceso completo: son los roles de
-- mantenimiento y migración.
--
-- INSERT, UPDATE y DELETE NO se tocan: la administración sigue pudiendo
-- escribir `notes` desde el formulario. Solo se cierra la LECTURA.

revoke select on public.suppliers from authenticated;
revoke select on public.suppliers from anon;

grant select (
  id, name, email, phone, website, tax_id,
  country, region, city, postal_code, address,
  latitude, longitude,
  category, market_id, family, subfamily,
  produccion, produccion_value, produccion_unit, medida,
  supplier_market_id, supplier_category_id, supplier_family_id, supplier_subfamily_id,
  is_active, created_at, updated_at
) on public.suppliers to authenticated;

comment on column public.suppliers.notes is
  'Observaciones internas de administración. NO legible por usuarios cliente '
  '(migración 032): el privilegio de columna está revocado para authenticated y '
  'anon. La administración las obtiene por admin_supplier_notes(uuid[]).';

-- ═════════════════════════════════════════════════════════════════════════════
-- 2. `search_suppliers` deja de seleccionar `notes`
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Es OBLIGATORIO: la función es SECURITY INVOKER, así que se ejecuta con los
-- privilegios de quien la llama. Si siguiera seleccionando `notes`, después del
-- revoke fallaría con «permission denied for column notes» para TODO el mundo,
-- incluida la administración, y el listado entero dejaría de funcionar.
--
-- El resto de la función es IDÉNTICO a la migración 031: mismos filtros, misma
-- búsqueda secundaria multicampo, misma allowlist de ordenación, mismo
-- desempate por id, mismo `total_count`. Lo único que cambia es que `notes`
-- desaparece del `returns table` y del `select`.
--
-- Ningún consumidor lo pierde: el listado de cliente y el de administración no
-- muestran las notas, y la exportación de administración las obtiene ahora por
-- la función del punto 3.

drop function if exists public.search_suppliers(
  text, uuid, text, text, text, text, text, text, text, boolean,
  integer, integer, text, uuid, uuid, uuid, uuid, numeric, numeric, text, text
);

create or replace function public.search_suppliers(
  p_search                text    default null,
  p_market_id             uuid    default null,
  p_region                text    default null,
  p_city                  text    default null,
  p_family                text    default null,
  p_subfamily             text    default null,
  p_category              text    default null,
  p_produccion            text    default null,
  p_medida                text    default null,
  p_is_active             boolean default null,
  p_limit                 integer default 200,
  p_offset                integer default 0,
  p_country               text    default null,
  p_supplier_market_id    uuid    default null,
  p_supplier_category_id  uuid    default null,
  p_supplier_family_id    uuid    default null,
  p_supplier_subfamily_id uuid    default null,
  p_produccion_min        numeric default null,
  p_produccion_max        numeric default null,
  p_secondary_search      text    default null,
  p_sort                  text    default null
)
returns table (
  id uuid, name text, email text, phone text, website text, tax_id text,
  country text, region text, city text, postal_code text, address text,
  latitude numeric, longitude numeric, category text, market_id uuid,
  family text, subfamily text, produccion text, medida text,
  produccion_value numeric, produccion_unit text, is_active boolean,
  created_at timestamptz, updated_at timestamptz, market_name text,
  supplier_market_id uuid, supplier_category_id uuid, supplier_family_id uuid,
  supplier_subfamily_id uuid, supplier_market_name text,
  supplier_category_name text, supplier_family_name text,
  supplier_subfamily_name text, total_count bigint
)
language sql
stable
set search_path to 'public', 'extensions'
as $function$
  with parametros as (
    select
      case
        when p_secondary_search is null or btrim(p_secondary_search) = '' then null
        else '%' || replace(replace(replace(
               unaccent(lower(btrim(p_secondary_search))),
               '\', '\\'), '%', '\%'), '_', '\_') || '%'
      end as termino
  )
  select
    s.id, s.name, s.email, s.phone, s.website, s.tax_id, s.country,
    s.region, s.city, s.postal_code, s.address, s.latitude, s.longitude,
    s.category, s.market_id, s.family, s.subfamily, s.produccion, s.medida,
    s.produccion_value, s.produccion_unit,
    s.is_active, s.created_at, s.updated_at,
    m.name as market_name,
    s.supplier_market_id,
    s.supplier_category_id,
    s.supplier_family_id,
    s.supplier_subfamily_id,
    sm.name  as supplier_market_name,
    sc.name  as supplier_category_name,
    sf.name  as supplier_family_name,
    ssf.name as supplier_subfamily_name,
    count(*) over() as total_count
  from public.suppliers s
  cross join parametros p
  left join public.markets              m   on m.id   = s.market_id
  left join public.supplier_markets     sm  on sm.id  = s.supplier_market_id
  left join public.supplier_categories  sc  on sc.id  = s.supplier_category_id
  left join public.supplier_families    sf  on sf.id  = s.supplier_family_id
  left join public.supplier_subfamilies ssf on ssf.id = s.supplier_subfamily_id
  where
    (p_is_active   is null or s.is_active = p_is_active)
    and (p_market_id  is null or s.market_id = p_market_id)
    and (p_country    is null or s.country = p_country)
    and (p_supplier_market_id    is null or s.supplier_market_id = p_supplier_market_id)
    and (p_supplier_category_id  is null or s.supplier_category_id = p_supplier_category_id)
    and (p_supplier_family_id    is null or s.supplier_family_id = p_supplier_family_id)
    and (p_supplier_subfamily_id is null or s.supplier_subfamily_id = p_supplier_subfamily_id)
    and (p_produccion_min is null or (s.produccion_value is not null and s.produccion_value >= p_produccion_min))
    and (p_produccion_max is null or (s.produccion_value is not null and s.produccion_value <= p_produccion_max))
    and (p_search     is null or unaccent(lower(s.name))       like '%' || unaccent(lower(p_search))     || '%')
    and (p_region     is null or unaccent(lower(s.region))     like '%' || unaccent(lower(p_region))     || '%')
    and (p_city       is null or unaccent(lower(s.city))       like '%' || unaccent(lower(p_city))       || '%')
    and (p_family     is null or unaccent(lower(s.family))     like '%' || unaccent(lower(p_family))     || '%')
    and (p_subfamily  is null or unaccent(lower(s.subfamily))  like '%' || unaccent(lower(p_subfamily))  || '%')
    and (p_category   is null or unaccent(lower(s.category))   like '%' || unaccent(lower(p_category))   || '%')
    and (p_produccion is null or unaccent(lower(s.produccion)) like '%' || unaccent(lower(p_produccion)) || '%')
    and (p_medida     is null or unaccent(lower(s.medida))     like '%' || unaccent(lower(p_medida))     || '%')
    and (
      p.termino is null
      or unaccent(lower(coalesce(s.name, '')))    like p.termino escape '\'
      or unaccent(lower(coalesce(s.city, '')))    like p.termino escape '\'
      or unaccent(lower(coalesce(s.region, '')))  like p.termino escape '\'
      or unaccent(lower(coalesce(s.country, ''))) like p.termino escape '\'
      or unaccent(lower(coalesce(s.tax_id, '')))  like p.termino escape '\'
      or unaccent(lower(coalesce(s.email, '')))   like p.termino escape '\'
      or unaccent(lower(coalesce(s.phone, '')))   like p.termino escape '\'
    )
  order by
    case when p_sort = 'name_desc'       then unaccent(lower(s.name)) end desc,
    case when p_sort = 'country_asc'     then unaccent(lower(s.country)) end asc,
    case when p_sort = 'city_asc'        then unaccent(lower(s.city)) end asc nulls last,
    case when p_sort = 'region_asc'      then unaccent(lower(s.region)) end asc nulls last,
    case when p_sort = 'created_desc'    then s.created_at end desc,
    case when p_sort = 'created_asc'     then s.created_at end asc,
    case when p_sort = 'produccion_desc' then s.produccion_value end desc nulls last,
    case when p_sort = 'produccion_asc'  then s.produccion_value end asc nulls last,
    unaccent(lower(s.name)) asc,
    s.id asc
  limit greatest(coalesce(p_limit, 200), 0)
  offset greatest(coalesce(p_offset, 0), 0);
$function$;

comment on function public.search_suppliers is
  'Fase 3.1 — listado de proveedores con filtros, búsqueda secundaria '
  'multicampo y ordenación por allowlist. SECURITY INVOKER: respeta la RLS de '
  'suppliers. Desde 032 NO devuelve notes, que es un campo administrativo.';

revoke all on function public.search_suppliers(
  text, uuid, text, text, text, text, text, text, text, boolean,
  integer, integer, text, uuid, uuid, uuid, uuid, numeric, numeric, text, text
) from public;
revoke all on function public.search_suppliers(
  text, uuid, text, text, text, text, text, text, text, boolean,
  integer, integer, text, uuid, uuid, uuid, uuid, numeric, numeric, text, text
) from anon;
grant execute on function public.search_suppliers(
  text, uuid, text, text, text, text, text, text, text, boolean,
  integer, integer, text, uuid, uuid, uuid, uuid, numeric, numeric, text, text
) to authenticated, service_role;

-- ═════════════════════════════════════════════════════════════════════════════
-- 3. `admin_supplier_notes(uuid[])` — la vía de administración
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Devuelve las notas de los proveedores indicados, SOLO si quien llama es
-- `platform_admin`.
--
-- ── Por qué SECURITY DEFINER es correcto aquí ───────────────────────────────
--
-- Porque es la única forma de que un rol al que se le ha retirado el privilegio
-- de columna pueda leerla bajo una condición. Y es seguro porque:
--
--   · la PRIMERA línea comprueba `is_platform_admin()` y devuelve vacío si no
--     lo es. La función NO delega esa comprobación en quien la llama;
--   · solo devuelve `id` y `notes`, nada más. No es una puerta a la tabla;
--   · `search_path` explícito;
--   · acepta un array acotado, no una consulta libre.
--
-- Devolver el conjunto vacío en lugar de lanzar es deliberado: la usa la
-- exportación, que debe seguir generando el fichero aunque quien exporte no sea
-- administrador — simplemente sin la columna de notas.

create or replace function public.admin_supplier_notes(p_ids uuid[])
returns table (id uuid, notes text)
language sql
stable
security definer
set search_path = public
as $function$
  select s.id, s.notes
  from public.suppliers s
  where public.is_platform_admin()
    and s.id = any(coalesce(p_ids, array[]::uuid[]));
$function$;

comment on function public.admin_supplier_notes(uuid[]) is
  'Fase 3 (032) — notas internas de proveedores. Solo devuelve filas si quien '
  'llama es platform_admin; para cualquier otro perfil el resultado es vacío.';

revoke all on function public.admin_supplier_notes(uuid[]) from public;
revoke all on function public.admin_supplier_notes(uuid[]) from anon;
grant execute on function public.admin_supplier_notes(uuid[]) to authenticated, service_role;

-- ═════════════════════════════════════════════════════════════════════════════
-- 4. Lo que esta migración NO hace
-- ═════════════════════════════════════════════════════════════════════════════
--
-- · No modifica ninguna policy: `admin_all_suppliers` y
--   `client_select_active_suppliers` quedan exactamente igual. El recuento de
--   policies sigue siendo 60.
-- · No cambia ninguna columna, ningún tipo y ningún dato. Cero DML.
-- · No toca `email`, `phone`, `tax_id`, `produccion_value` ni las coordenadas:
--   son campos comerciales y su clasificación corresponde a 3.5.
-- · No introduce planes ni membresías.
-- · No convierte `search_suppliers` en SECURITY DEFINER.

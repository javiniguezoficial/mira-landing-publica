-- 031 — Ordenación y búsqueda secundaria en el listado de proveedores
--
-- Fase 3.1.
--
-- ═════════════════════════════════════════════════════════════════════════════
-- QUÉ FALTABA
-- ═════════════════════════════════════════════════════════════════════════════
--
-- `search_suppliers` traía dos limitaciones que impedían 3.1:
--
--   1. `order by s.name` HARDCODEADO. No había forma de ordenar por otra cosa
--      sin traerse las 12.288 filas al servidor de Next y ordenarlas allí, que
--      es exactamente lo que no se puede hacer.
--   2. `p_search` solo miraba `s.name`. Una «búsqueda en los resultados» que
--      solo mirase el nombre no serviría para acotar por localidad o país.
--
-- ── Cómo se despliega sin ventana de rotura ─────────────────────────────────
--
-- Los dos parámetros nuevos van AL FINAL y con `default null`. Como supabase-js
-- invoca por argumentos NOMBRADOS, el código anterior —que pasa 19— sigue
-- llamando a esta función sin cambios mientras el despliegue no haya llegado.
-- No hay instante en el que la aplicación llame a una firma inexistente.
--
-- Hay que hacer `drop` primero porque añadir parámetros crea una sobrecarga
-- distinta, y con las dos vivas una llamada de 19 argumentos sería ambigua.
--
-- ── Qué NO cambia ───────────────────────────────────────────────────────────
--
-- Ni un filtro previo, ni el `total_count`, ni las columnas devueltas, ni
-- `security invoker` —sigue respetando la RLS de `suppliers`—, ni el
-- `search_path`. Sin `p_sort` ni `p_secondary_search`, el comportamiento es
-- idéntico al de la migración 016.
--
-- No se toca ninguna policy, ninguna tabla y ningún dato. Policies: siguen 60.

drop function if exists public.search_suppliers(
  text, uuid, text, text, text, text, text, text, text, boolean,
  integer, integer, text, uuid, uuid, uuid, uuid, numeric, numeric
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
  -- ── Nuevos en 031 ────────────────────────────────────────────────────────
  p_secondary_search      text    default null,
  p_sort                  text    default null
)
returns table (
  id uuid, name text, email text, phone text, website text, tax_id text,
  country text, region text, city text, postal_code text, address text,
  latitude numeric, longitude numeric, category text, market_id uuid,
  family text, subfamily text, produccion text, medida text,
  produccion_value numeric, produccion_unit text, notes text, is_active boolean,
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
      -- ── Escapado de los comodines de LIKE ─────────────────────────────────
      --
      -- El término llega como PARÁMETRO, así que no hay inyección SQL posible.
      -- Lo que sí hay que evitar es que un `%` o un `_` escritos por la persona
      -- se interpreten como comodines: buscar «S_A» debe buscar esa cadena, no
      -- «S» + cualquier carácter + «A». Se escapan con `\`, y el LIKE declara
      -- ese carácter de escape más abajo.
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
    s.notes, s.is_active, s.created_at, s.updated_at,
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
    -- ── Filtros previos: IDÉNTICOS a la migración 016 ─────────────────────
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
    -- ── 3.1 · Búsqueda SECUNDARIA, sobre el conjunto ya filtrado ──────────
    --
    -- Se aplica DESPUÉS de todo lo anterior, en el mismo WHERE, así que actúa
    -- sobre el subconjunto que producen los filtros. Recorre varios campos con
    -- un solo término: es lo que espera quien escribe «Lleida» sin pensar en si
    -- eso es una provincia o una localidad.
    --
    -- `tax_id`, `email` y `phone` están HOY vacíos en las 12.288 filas. Se
    -- incluyen igualmente porque son los campos que el negocio quiere buscar y
    -- el día que se pueblen funcionará sin otra migración; buscarlos cuando
    -- están a NULL no cuesta nada.
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
  -- ── 3.1 · Ordenación ───────────────────────────────────────────────────
  --
  -- ALLOWLIST en SQL, no solo en TypeScript. `p_sort` es TEXTO, y lo único que
  -- se hace con él es compararlo contra estas constantes: nunca se concatena a
  -- un `order by`, así que no puede inyectarse un nombre de columna.
  --
  -- El DESEMPATE por `s.id` va en todos los casos y es lo que hace estable la
  -- paginación: con 391 nombres repetidos —uno de ellos 42 veces—, ordenar solo
  -- por nombre deja a Postgres elegir el orden dentro del grupo, y una fila
  -- podría aparecer en la página 2 y otra vez en la 3.
  --
  -- `nulls last` en localidad, provincia y producción: solo el 39 % tiene
  -- ciudad y el 34 % producción, y quien ordena por esos campos quiere ver
  -- primero los que sí la tienen.
  order by
    case when p_sort = 'name_desc'       then unaccent(lower(s.name)) end desc,
    case when p_sort = 'country_asc'     then unaccent(lower(s.country)) end asc,
    case when p_sort = 'city_asc'        then unaccent(lower(s.city)) end asc nulls last,
    case when p_sort = 'region_asc'      then unaccent(lower(s.region)) end asc nulls last,
    case when p_sort = 'created_desc'    then s.created_at end desc,
    case when p_sort = 'created_asc'     then s.created_at end asc,
    case when p_sort = 'produccion_desc' then s.produccion_value end desc nulls last,
    case when p_sort = 'produccion_asc'  then s.produccion_value end asc nulls last,
    -- `name_asc` es el default y también el criterio secundario de todas las
    -- demás: dentro de un mismo país o una misma fecha, alfabético.
    unaccent(lower(s.name)) asc,
    s.id asc
  limit greatest(coalesce(p_limit, 200), 0)
  offset greatest(coalesce(p_offset, 0), 0);
$function$;

comment on function public.search_suppliers is
  'Fase 3.1 — listado de proveedores con filtros, búsqueda secundaria '
  'multicampo y ordenación por allowlist. SECURITY INVOKER: respeta la RLS de '
  'suppliers. El desempate por id hace estable la paginación.';

-- Mismos grants que tenía la función anterior. `anon` NO recibe EXECUTE: se
-- revoca expresamente además de a PUBLIC, por lo aprendido en la migración 029
-- (el esquema concede EXECUTE a anon por default privileges, y revocar de
-- PUBLIC no lo retira).
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
-- Índices de apoyo
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Solo dos, y se justifican:
--
--   · `country, name` sirve al filtro por país —que es el más usado— combinado
--     con el orden alfabético por defecto.
--   · `created_at desc, id` sirve a «más recientes», que sin índice obliga a
--     ordenar las 12.288 filas enteras.
--
-- NO se indexa `city` ni `region`: solo el 39 % las tiene informadas y ordenar
-- por ellas es un caso minoritario. Tampoco se crean índices trigram para la
-- búsqueda: con 12.288 filas el escaneo secuencial es de milisegundos, y un
-- índice GIN aquí sería coste de escritura sin lectura que lo aproveche.

create index if not exists idx_suppliers_country_name
  on public.suppliers (country, name);

create index if not exists idx_suppliers_created_at
  on public.suppliers (created_at desc, id);

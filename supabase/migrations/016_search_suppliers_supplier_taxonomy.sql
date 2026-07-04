-- ============================================================
-- 016_search_suppliers_supplier_taxonomy
-- Extiende search_suppliers() con la taxonomía propia de proveedores (P2)
-- y con p_country (sustituye el workaround de P1 que filtraba país en JS).
--
-- Por qué DROP + CREATE (y no CREATE OR REPLACE):
--   Se AÑADEN columnas al RETURNS TABLE (supplier_*_id / supplier_*_name).
--   Postgres no permite cambiar el tipo de retorno con CREATE OR REPLACE, así
--   que hay que DROP + CREATE. Ambas van en la misma migración (transacción
--   atómica) → no hay ventana en la que la función no exista.
--
-- Compatibilidad hacia atrás:
--   · Se mantienen TODOS los parámetros legacy (p_market_id, p_category,
--     p_family, p_subfamily) y las columnas legacy del retorno.
--   · Los parámetros nuevos van al final, todos con DEFAULT NULL, así que el
--     código actualmente desplegado (que llama con los 12 args antiguos por
--     nombre) sigue funcionando tras aplicar la migración.
--   · SECURITY INVOKER + unaccent + total_count + limit/offset se mantienen.
--
-- NO toca tablas, datos ni policies. Solo redefine la función y sus GRANTs.
-- ============================================================

DROP FUNCTION IF EXISTS public.search_suppliers(
  text, uuid, text, text, text, text, text, text, text, boolean, integer, integer
);

CREATE FUNCTION public.search_suppliers(
  p_search               text    default null,
  p_market_id            uuid    default null,   -- legacy (Pricing)
  p_region               text    default null,
  p_city                 text    default null,
  p_family               text    default null,   -- legacy (texto libre)
  p_subfamily            text    default null,   -- legacy (texto libre)
  p_category             text    default null,   -- legacy (texto libre)
  p_produccion           text    default null,
  p_medida               text    default null,
  p_is_active            boolean default null,
  p_limit                integer default 200,
  p_offset               integer default 0,
  -- Nuevos (P2.4)
  p_country              text    default null,
  p_supplier_market_id   uuid    default null,
  p_supplier_category_id uuid    default null,
  p_supplier_family_id   uuid    default null,
  p_supplier_subfamily_id uuid   default null
)
returns table (
  id          uuid,
  name        text,
  email       text,
  phone       text,
  website     text,
  tax_id      text,
  country     text,
  region      text,
  city        text,
  postal_code text,
  address     text,
  latitude    numeric,
  longitude   numeric,
  category    text,
  market_id   uuid,
  family      text,
  subfamily   text,
  produccion  text,
  medida      text,
  notes       text,
  is_active   boolean,
  created_at  timestamptz,
  updated_at  timestamptz,
  market_name text,
  -- Taxonomía propia de proveedores
  supplier_market_id      uuid,
  supplier_category_id    uuid,
  supplier_family_id      uuid,
  supplier_subfamily_id   uuid,
  supplier_market_name    text,
  supplier_category_name  text,
  supplier_family_name    text,
  supplier_subfamily_name text,
  total_count bigint
)
language sql
stable
security invoker
set search_path = public, extensions
as $$
  select
    s.id, s.name, s.email, s.phone, s.website, s.tax_id, s.country,
    s.region, s.city, s.postal_code, s.address, s.latitude, s.longitude,
    s.category, s.market_id, s.family, s.subfamily, s.produccion, s.medida,
    s.notes, s.is_active, s.created_at, s.updated_at,
    m.name as market_name,
    s.supplier_market_id,
    s.supplier_category_id,
    s.supplier_family_id,
    s.supplier_subfamily_id,
    sm.name as supplier_market_name,
    sc.name as supplier_category_name,
    sf.name as supplier_family_name,
    ssf.name as supplier_subfamily_name,
    count(*) over() as total_count
  from public.suppliers s
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
    and (p_search     is null or unaccent(lower(s.name))       like '%' || unaccent(lower(p_search))     || '%')
    and (p_region     is null or unaccent(lower(s.region))     like '%' || unaccent(lower(p_region))     || '%')
    and (p_city       is null or unaccent(lower(s.city))       like '%' || unaccent(lower(p_city))       || '%')
    and (p_family     is null or unaccent(lower(s.family))     like '%' || unaccent(lower(p_family))     || '%')
    and (p_subfamily  is null or unaccent(lower(s.subfamily))  like '%' || unaccent(lower(p_subfamily))  || '%')
    and (p_category   is null or unaccent(lower(s.category))   like '%' || unaccent(lower(p_category))   || '%')
    and (p_produccion is null or unaccent(lower(s.produccion)) like '%' || unaccent(lower(p_produccion)) || '%')
    and (p_medida     is null or unaccent(lower(s.medida))     like '%' || unaccent(lower(p_medida))     || '%')
  order by s.name
  limit greatest(coalesce(p_limit, 200), 0)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

-- Solo usuarios autenticados pueden ejecutarla (admin y cliente); RLS filtra filas.
revoke all on function public.search_suppliers(
  text, uuid, text, text, text, text, text, text, text, boolean, integer, integer,
  text, uuid, uuid, uuid, uuid
) from public, anon;

grant execute on function public.search_suppliers(
  text, uuid, text, text, text, text, text, text, text, boolean, integer, integer,
  text, uuid, uuid, uuid, uuid
) to authenticated;

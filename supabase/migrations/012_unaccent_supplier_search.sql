-- ─────────────────────────────────────────────────────────────────────────────
-- 012_unaccent_supplier_search
-- Búsqueda de proveedores tolerante a acentos Y mayúsculas/minúsculas.
--
-- Migración ADITIVA y NO destructiva:
--   · Añade la extensión `unaccent` (en el esquema `extensions`).
--   · Añade una función RPC `public.search_suppliers(...)`.
--   · NO modifica tablas, columnas, datos ni políticas RLS existentes.
--
-- La función es SECURITY INVOKER: se ejecuta con el rol y el contexto RLS del
-- usuario que la llama, por lo que respeta intactas las políticas existentes de
-- `public.suppliers` (admin ve todo; cliente solo proveedores activos).
--
-- `unaccent(text)` es STABLE, lo cual es válido dentro de la cláusula WHERE de
-- una función (no se usa en columnas generadas ni índices, que exigirían
-- IMMUTABLE). Se normalizan AMBOS lados de la comparación: la columna y el
-- término buscado → coincidencia real sin acentos en base de datos.
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists unaccent with schema extensions;

create or replace function public.search_suppliers(
  p_search     text    default null,
  p_market_id  uuid    default null,
  p_region     text    default null,
  p_city       text    default null,
  p_family     text    default null,
  p_subfamily  text    default null,
  p_category   text    default null,
  p_produccion text    default null,
  p_medida     text    default null,
  p_is_active  boolean default null,
  p_limit      integer default 200,
  p_offset     integer default 0
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
    count(*) over() as total_count
  from public.suppliers s
  left join public.markets m on m.id = s.market_id
  where
    (p_is_active   is null or s.is_active = p_is_active)
    and (p_market_id  is null or s.market_id = p_market_id)
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
  text, uuid, text, text, text, text, text, text, text, boolean, integer, integer
) from public, anon;

grant execute on function public.search_suppliers(
  text, uuid, text, text, text, text, text, text, text, boolean, integer, integer
) to authenticated;

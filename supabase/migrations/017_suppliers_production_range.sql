-- ============================================================
-- 017_suppliers_production_range
-- Producción numérica normalizada para filtrar por rango (tipo Booking).
--
-- ADITIVA. No borra el campo legacy `produccion` (texto libre). Añade:
--   · suppliers.produccion_value numeric  (valor numérico normalizado)
--   · suppliers.produccion_unit  text     (unidad detectada: kg / TN)
-- Backfill best-effort desde `produccion` (si no se puede parsear → null).
-- Índice sobre produccion_value para el filtro de rango.
-- Extiende search_suppliers con p_produccion_min / p_produccion_max y devuelve
-- produccion_value / produccion_unit.
--
-- NO toca RLS/policies, RFQs, precios, auth ni datos legacy.
-- ============================================================

-- 1. Columnas nuevas
ALTER TABLE public.suppliers
  ADD COLUMN produccion_value numeric,
  ADD COLUMN produccion_unit  text;

-- 2. Helpers temporales de parseo (se eliminan al final de la migración)
CREATE OR REPLACE FUNCTION public.parse_produccion_value(p text)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  tok  text;
  norm text;
BEGIN
  IF p IS NULL THEN RETURN NULL; END IF;
  -- primer token numérico (dígitos, puntos y comas)
  tok := substring(p FROM '[0-9][0-9.,]*');
  IF tok IS NULL THEN RETURN NULL; END IF;

  IF tok ~ ',' THEN
    -- coma decimal (formato ES): quita puntos de millar, coma → punto
    norm := replace(replace(tok, '.', ''), ',', '.');
  ELSIF tok ~ '^[0-9]{1,3}(\.[0-9]{3})+$' THEN
    -- puntos como separador de millar (5.000, 12.000)
    norm := replace(tok, '.', '');
  ELSE
    -- entero simple o decimal con punto (5000, 5.5)
    norm := tok;
  END IF;

  RETURN norm::numeric;
EXCEPTION WHEN others THEN
  RETURN NULL;   -- valor ambiguo/no parseable → null, no rompe
END;
$$;

CREATE OR REPLACE FUNCTION public.parse_produccion_unit(p text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p IS NULL THEN NULL
    WHEN lower(p) ~ 'tonelad' OR lower(p) ~ '(^|[^a-z])(tn|ton)([^a-z]|$)' THEN 'TN'
    WHEN lower(p) ~ '(^|[^a-z])kg([^a-z]|$)' OR lower(p) ~ 'kilo' THEN 'kg'
    ELSE NULL
  END;
$$;

-- 3. Backfill best-effort (solo donde hay texto)
UPDATE public.suppliers
SET produccion_value = public.parse_produccion_value(produccion),
    produccion_unit  = public.parse_produccion_unit(produccion)
WHERE produccion IS NOT NULL AND btrim(produccion) <> '';

-- 4. Eliminar helpers temporales (la app parsea en JS en importación)
DROP FUNCTION public.parse_produccion_value(text);
DROP FUNCTION public.parse_produccion_unit(text);

-- 5. Índice para el filtro de rango
CREATE INDEX idx_suppliers_produccion_value ON public.suppliers (produccion_value);

-- 6. search_suppliers: añade p_produccion_min / p_produccion_max y devuelve
--    produccion_value / produccion_unit. DROP + CREATE porque cambia la firma
--    y el tipo de retorno (mismo motivo que en 016). Atómico en la migración.
DROP FUNCTION IF EXISTS public.search_suppliers(
  text, uuid, text, text, text, text, text, text, text, boolean, integer, integer,
  text, uuid, uuid, uuid, uuid
);

CREATE FUNCTION public.search_suppliers(
  p_search               text    default null,
  p_market_id            uuid    default null,
  p_region               text    default null,
  p_city                 text    default null,
  p_family               text    default null,
  p_subfamily            text    default null,
  p_category             text    default null,
  p_produccion           text    default null,
  p_medida               text    default null,
  p_is_active            boolean default null,
  p_limit                integer default 200,
  p_offset               integer default 0,
  p_country              text    default null,
  p_supplier_market_id   uuid    default null,
  p_supplier_category_id uuid    default null,
  p_supplier_family_id   uuid    default null,
  p_supplier_subfamily_id uuid   default null,
  p_produccion_min       numeric default null,
  p_produccion_max       numeric default null
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
  produccion_value numeric,
  produccion_unit  text,
  notes       text,
  is_active   boolean,
  created_at  timestamptz,
  updated_at  timestamptz,
  market_name text,
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
    s.produccion_value, s.produccion_unit,
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
  order by s.name
  limit greatest(coalesce(p_limit, 200), 0)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.search_suppliers(
  text, uuid, text, text, text, text, text, text, text, boolean, integer, integer,
  text, uuid, uuid, uuid, uuid, numeric, numeric
) from public, anon;

grant execute on function public.search_suppliers(
  text, uuid, text, text, text, text, text, text, text, boolean, integer, integer,
  text, uuid, uuid, uuid, uuid, numeric, numeric
) to authenticated;

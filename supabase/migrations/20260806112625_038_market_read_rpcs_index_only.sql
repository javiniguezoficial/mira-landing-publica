-- 038 — Las lecturas de lonjas y facetas, por índice
--
-- ═════════════════════════════════════════════════════════════════════════════
-- QUÉ SE CORRIGE
-- ═════════════════════════════════════════════════════════════════════════════
--
-- 037 sustituyó tres lecturas de tabla —que PostgREST recortaba en 1.000 filas
-- y por eso solo enseñaban 8 de las 20 lonjas de «Canal Estándar»— por
-- funciones que agregan en SQL. El resultado pasó a ser CORRECTO, pero lento:
-- `jsonb_agg(distinct btrim(x))` obliga a recorrer el montón y ordenar las
-- 73.340 filas enteras.
--
-- Medido sobre los datos reales, antes de este cambio:
--
--   market_price_facets()      915 ms   ← en CADA carga de /admin/precios
--                                         y de /app/market-intelligent/precios
--   market_catalog_lonjas()    549 ms   ← en cada carga de la portada de MI
--
-- Casi un segundo de espera por pantalla no es aceptable, y encima crece con la
-- tabla: es la misma clase de problema que se acaba de arreglar, con otra cara.
--
-- ── El cambio ──────────────────────────────────────────────────────────────
--
-- Se separan las dos operaciones que estaban mezcladas:
--
--   1. `distinct` sobre la COLUMNA CRUDA, que sí puede resolver el índice;
--   2. `btrim` y la agregación, ya sobre las pocas filas que sobreviven —116
--      lonjas, 11 unidades, 1.230 pares producto-lonja.
--
-- El `btrim` dentro del `distinct` era lo que impedía usar el índice: una
-- expresión sobre la columna no casa con un índice sobre la columna.
--
-- Después del cambio, con los mismos datos:
--
--   market_price_facets()       30 ms   (Index Only Scan sobre idx_ppr_lonja
--                                        e idx_ppr_unit)
--   market_catalog_lonjas()     41 ms   (Index Only Scan sobre
--                                        idx_ppr_product_lonja_recorded)
--
-- ── Lo que NO cambia ───────────────────────────────────────────────────────
--
-- El RESULTADO es idéntico: las mismas 116 lonjas, las mismas 11 unidades y el
-- mismo mapa de 1.230 pares. Esto es una reescritura de plan de ejecución, no
-- un cambio de semántica.
--
-- Siguen siendo SECURITY INVOKER, así que las policies se aplican igual: una
-- organización con un mercado deshabilitado (028) no ve sus lonjas. Los grants
-- se repiten al final por la misma razón que en 034 y 037: `create or replace`
-- los conserva, pero dejarlos escritos es barato y hace que el estado deseado
-- viva en la migración en lugar de depender de que nadie los haya tocado.
--
-- `market_product_lonjas` NO se toca: ya resolvía por
-- `idx_ppr_product_lonja_recorded` acotada a un producto (19 ms medidos).
-- `market_existing_price_keys` tampoco: está acotada por producto y por fecha.
--
-- Esta migración no lee, no escribe y no borra ni un solo registro de precio.
-- Solo redefine dos funciones.

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. Facetas del panel de precios
-- ═════════════════════════════════════════════════════════════════════════════

create or replace function public.market_price_facets()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'lonjas', coalesce((
      select jsonb_agg(t.v)
        from (
          select distinct btrim(s.lonja) as v
            from (
              select distinct r.lonja
                from public.product_price_records r
               where r.lonja is not null
            ) s
           where btrim(s.lonja) <> ''
        ) t
    ), '[]'::jsonb),
    'units', coalesce((
      select jsonb_agg(t.v)
        from (
          select distinct btrim(s.unit) as v
            from (
              select distinct r.unit
                from public.product_price_records r
               where r.unit is not null
            ) s
           where btrim(s.unit) <> ''
        ) t
    ), '[]'::jsonb)
  );
$$;

comment on function public.market_price_facets() is
  'Fase 038 — valores distintos de lonja y unidad presentes en los precios. '
  'El distinct va sobre la columna cruda para que lo resuelva el índice; el '
  'btrim se aplica después, sobre las pocas filas que quedan. Mismo resultado '
  'que en 037, 30 veces más rápido.';

-- ═════════════════════════════════════════════════════════════════════════════
-- 2. Mapa producto → lonjas
-- ═════════════════════════════════════════════════════════════════════════════

create or replace function public.market_catalog_lonjas()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(jsonb_object_agg(t.product_id, t.lonjas), '{}'::jsonb)
    from (
      select s.product_id::text as product_id,
             jsonb_agg(distinct btrim(s.lonja)) as lonjas
        from (
          select distinct r.product_id, r.lonja
            from public.product_price_records r
           where r.lonja is not null
        ) s
       where btrim(s.lonja) <> ''
       group by s.product_id
    ) t;
$$;

comment on function public.market_catalog_lonjas() is
  'Fase 038 — mapa producto → lonjas con precios, para el filtro de la portada '
  'de Market Intelligence. Misma reescritura que market_price_facets: el '
  'distinct sobre columnas crudas lo resuelve idx_ppr_product_lonja_recorded.';

-- ═════════════════════════════════════════════════════════════════════════════
-- 3. Grants
-- ═════════════════════════════════════════════════════════════════════════════
--
-- El revoke de `anon` es EXPRESO, no solo de PUBLIC: el esquema tiene un
-- `alter default privileges … to anon` y revocar de PUBLIC no lo alcanza (029).

revoke all on function public.market_price_facets() from public;
revoke all on function public.market_price_facets() from anon;
grant execute on function public.market_price_facets() to authenticated, service_role;

revoke all on function public.market_catalog_lonjas() from public;
revoke all on function public.market_catalog_lonjas() from anon;
grant execute on function public.market_catalog_lonjas() to authenticated, service_role;

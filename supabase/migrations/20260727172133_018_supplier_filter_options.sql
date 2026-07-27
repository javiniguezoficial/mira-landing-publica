-- ═══════════════════════════════════════════════════════════════════════════
-- 018_supplier_filter_options
--
-- ⚠️ ESTADO: NO APLICADA en producción todavía (a fecha 2026-07-27).
--    Última versión en el historial remoto: 20260704144304 / 017_suppliers_production_range.
--    Ver `docs/DATABASE_OVERVIEW.md` → "Historial de migraciones y reconciliación".
--
-- Propósito
--   Devolver los valores distintos de país y provincia que alimentan los
--   <select> de filtro de proveedores (Administración y Cliente).
--
--   Antes, la aplicación descargaba hasta 5.000 filas de `suppliers` y
--   deduplicaba en JavaScript. Con 12.288 proveedores eso ocultaba valores
--   reales: de los 112 países distintos existentes solo aparecían 38. Además
--   la consulta no llevaba ORDER BY, así que qué 5.000 filas llegaban dependía
--   del orden físico de la tabla y podía cambiar tras cualquier UPDATE,
--   VACUUM o reimportación.
--
--   Esta función devuelve ~206 filas (112 países + 94 provincias) en lugar de
--   12.288, y es exacta por construcción.
--
-- Seguridad
--   · SECURITY INVOKER → se ejecuta con el rol y el contexto RLS de quien
--     llama, de modo que respeta intactas las policies de `public.suppliers`:
--       - `admin_all_suppliers`            → platform_admin ve todo.
--       - `client_select_active_suppliers` → autenticado ve solo is_active.
--     Un cliente que llamase con p_active_only := false NO vería inactivos:
--     la RLS sigue siendo el límite real. El parámetro solo puede restringir
--     más, nunca ampliar.
--   · search_path fijado → previene secuestro de resolución de nombres.
--   · EXECUTE revocado a PUBLIC y anon; concedido solo a authenticated.
--
-- ADITIVA y NO destructiva: no crea tablas, no toca datos, no modifica
-- policies, RLS, roles ni ninguna función existente (incluida search_suppliers).
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.get_supplier_filter_options(
  p_active_only boolean default true
)
returns table (facet text, value text)
language sql
stable
security invoker
set search_path = public
as $$
  -- Los alias internos son `k`/`v` a propósito: evitan cualquier ambigüedad
  -- con los nombres de columna de salida declarados en RETURNS TABLE
  -- (`facet`, `value`). El mapeo a la salida es posicional.
  select f.k, f.v
  from (
    select distinct
           'country'::text as k,
           btrim(s.country) as v
      from public.suppliers s
     where (not coalesce(p_active_only, true) or s.is_active)
       and s.country is not null
       and btrim(s.country) <> ''

    union all

    select distinct
           'region'::text as k,
           btrim(s.region) as v
      from public.suppliers s
     where (not coalesce(p_active_only, true) or s.is_active)
       and s.region is not null
       and btrim(s.region) <> ''
  ) f
  order by f.k, f.v;
$$;

comment on function public.get_supplier_filter_options(boolean) is
  'Valores distintos de país y provincia para los selects de filtro de proveedores. '
  'SECURITY INVOKER: respeta la RLS de public.suppliers. '
  'p_active_only = true (por defecto) limita a proveedores activos; false solo tiene '
  'efecto real para platform_admin, porque la RLS de cliente ya restringe a activos. '
  'Sustituye a la lectura de hasta 5.000 filas que ocultaba valores reales.';

-- Solo usuarios autenticados pueden ejecutarla; la RLS filtra las filas.
revoke all on function public.get_supplier_filter_options(boolean) from public, anon;
grant execute on function public.get_supplier_filter_options(boolean) to authenticated;

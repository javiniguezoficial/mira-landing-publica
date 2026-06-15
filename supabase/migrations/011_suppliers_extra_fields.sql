-- ─────────────────────────────────────────────────────────────────────────────
-- 011_suppliers_extra_fields
-- Campos adicionales de Proveedor (suppliers) para carga real.
--
-- Migración ADITIVA. Todas las columnas son nullable, por lo que los
-- proveedores existentes siguen siendo válidos sin cambios.
-- No modifica RLS ni datos existentes.
--
-- Notas de UI (no afectan al esquema):
--   · city   se muestra como "Localidad"
--   · region se muestra como "Provincia"
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.suppliers
  add column postal_code text,                                          -- código postal
  add column produccion  text,                                          -- producción / capacidad
  add column medida      text,                                          -- unidad de medida principal
  add column market_id   uuid references public.markets(id) on delete set null,  -- enlace al mercado real
  add column family      text,                                          -- familia (taxonomía flexible)
  add column subfamily   text;                                          -- subfamilia (taxonomía flexible)

-- ── Índice para el enlace al mercado ──────────────────────────────────────────
create index suppliers_market_id_idx on public.suppliers(market_id);

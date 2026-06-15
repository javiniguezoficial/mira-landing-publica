-- ============================================================
-- 010_products_extra_fields
-- Campos adicionales de Referencia (products) para carga real.
--
-- Migración ADITIVA. Todas las columnas son nullable, por lo que
-- las referencias existentes siguen siendo válidas sin cambios.
-- No modifica RLS, índices únicos ni datos existentes.
-- La columna `description` ya existe (002) y no se toca.
-- ============================================================

ALTER TABLE products
  ADD COLUMN lonja    text,   -- lonja / mercado de referencia del precio
  ADD COLUMN variedad text,   -- variedad de la referencia
  ADD COLUMN calibre  text,   -- calibre / tamaño
  ADD COLUMN incoterm text,   -- incoterm aplicable (EXW, FOB, CIF…)
  ADD COLUMN tipo     text;   -- tipo / clasificación libre

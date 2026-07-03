-- ============================================================
-- 015_supplier_taxonomy
-- Taxonomía propia de proveedores, separada de Pricing.
--
-- Jerarquía nueva (independiente de markets/market_categories):
--   supplier_markets → supplier_categories → supplier_families → supplier_subfamilies
--
-- Migración ADITIVA. Replica el patrón ya usado en 002 (markets/categories/
-- products) y 009 (strategic_markets):
--   · Tablas nuevas con RLS propia.
--   · 4 columnas FK nullable en `suppliers` (on delete set null).
--   · No modifica ninguna tabla, columna, dato ni policy existente.
--   · `market_id` (Pricing), `category`, `family`, `subfamily` (texto) de
--     `suppliers` quedan intactos como legacy — no se tocan ni se backfillean.
-- ============================================================

-- ── Tablas ───────────────────────────────────────────────────

CREATE TABLE supplier_markets (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  slug        text        NOT NULL,
  description text,
  sort_order  int         NOT NULL DEFAULT 0,
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_markets_slug_key UNIQUE (slug)
);

CREATE TABLE supplier_categories (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_market_id  uuid        NOT NULL REFERENCES supplier_markets(id) ON DELETE RESTRICT,
  name                text        NOT NULL,
  slug                text        NOT NULL,
  sort_order          int         NOT NULL DEFAULT 0,
  is_active           boolean     NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_categories_market_slug_key UNIQUE (supplier_market_id, slug)
);

CREATE TABLE supplier_families (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_category_id  uuid        NOT NULL REFERENCES supplier_categories(id) ON DELETE RESTRICT,
  name                  text        NOT NULL,
  slug                  text        NOT NULL,
  sort_order            int         NOT NULL DEFAULT 0,
  is_active             boolean     NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_families_category_slug_key UNIQUE (supplier_category_id, slug)
);

CREATE TABLE supplier_subfamilies (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_family_id  uuid        NOT NULL REFERENCES supplier_families(id) ON DELETE RESTRICT,
  name                text        NOT NULL,
  slug                text        NOT NULL,
  sort_order          int         NOT NULL DEFAULT 0,
  is_active           boolean     NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT supplier_subfamilies_family_slug_key UNIQUE (supplier_family_id, slug)
);

-- ── FKs nullable en suppliers (no rompen proveedores existentes) ─

ALTER TABLE suppliers
  ADD COLUMN supplier_market_id uuid
    REFERENCES supplier_markets(id) ON DELETE SET NULL,
  ADD COLUMN supplier_category_id uuid
    REFERENCES supplier_categories(id) ON DELETE SET NULL,
  ADD COLUMN supplier_family_id uuid
    REFERENCES supplier_families(id) ON DELETE SET NULL,
  ADD COLUMN supplier_subfamily_id uuid
    REFERENCES supplier_subfamilies(id) ON DELETE SET NULL;

-- ── Triggers updated_at (reutiliza función existente) ─────────

CREATE TRIGGER set_updated_at_supplier_markets
  BEFORE UPDATE ON supplier_markets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at_supplier_categories
  BEFORE UPDATE ON supplier_categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at_supplier_families
  BEFORE UPDATE ON supplier_families
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at_supplier_subfamilies
  BEFORE UPDATE ON supplier_subfamilies
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Índices ──────────────────────────────────────────────────

-- supplier_markets
CREATE INDEX idx_supplier_markets_slug
  ON supplier_markets (slug);
CREATE INDEX idx_supplier_markets_active_order
  ON supplier_markets (is_active, sort_order);

-- supplier_categories
CREATE INDEX idx_supplier_categories_market_id
  ON supplier_categories (supplier_market_id);
CREATE INDEX idx_supplier_categories_market_slug
  ON supplier_categories (supplier_market_id, slug);
CREATE INDEX idx_supplier_categories_active
  ON supplier_categories (is_active);

-- supplier_families
CREATE INDEX idx_supplier_families_category_id
  ON supplier_families (supplier_category_id);
CREATE INDEX idx_supplier_families_category_slug
  ON supplier_families (supplier_category_id, slug);
CREATE INDEX idx_supplier_families_active
  ON supplier_families (is_active);

-- supplier_subfamilies
CREATE INDEX idx_supplier_subfamilies_family_id
  ON supplier_subfamilies (supplier_family_id);
CREATE INDEX idx_supplier_subfamilies_family_slug
  ON supplier_subfamilies (supplier_family_id, slug);
CREATE INDEX idx_supplier_subfamilies_active
  ON supplier_subfamilies (is_active);

-- suppliers: nuevas FKs
CREATE INDEX idx_suppliers_supplier_market_id
  ON suppliers (supplier_market_id);
CREATE INDEX idx_suppliers_supplier_category_id
  ON suppliers (supplier_category_id);
CREATE INDEX idx_suppliers_supplier_family_id
  ON suppliers (supplier_family_id);
CREATE INDEX idx_suppliers_supplier_subfamily_id
  ON suppliers (supplier_subfamily_id);

-- ── RLS (solo tablas nuevas) ───────────────────────────────────

ALTER TABLE supplier_markets     ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_categories  ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_families    ENABLE ROW LEVEL SECURITY;
ALTER TABLE supplier_subfamilies ENABLE ROW LEVEL SECURITY;

-- platform_admin: acceso total con WITH CHECK
CREATE POLICY "admin_all_supplier_markets" ON supplier_markets
  FOR ALL
  USING      (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY "admin_all_supplier_categories" ON supplier_categories
  FOR ALL
  USING      (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY "admin_all_supplier_families" ON supplier_families
  FOR ALL
  USING      (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY "admin_all_supplier_subfamilies" ON supplier_subfamilies
  FOR ALL
  USING      (is_platform_admin())
  WITH CHECK (is_platform_admin());

-- clientes autenticados: solo lectura de activos, respetando la cadena
-- superior activa en cada nivel (mismo patrón que client_read_products en 002)

CREATE POLICY "client_read_supplier_markets" ON supplier_markets
  FOR SELECT
  USING (auth.uid() IS NOT NULL AND is_active = true);

CREATE POLICY "client_read_supplier_categories" ON supplier_categories
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND is_active = true
    AND EXISTS (
      SELECT 1 FROM supplier_markets sm
      WHERE sm.id = supplier_categories.supplier_market_id
        AND sm.is_active = true
    )
  );

CREATE POLICY "client_read_supplier_families" ON supplier_families
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND is_active = true
    AND EXISTS (
      SELECT 1 FROM supplier_categories sc
      JOIN supplier_markets sm ON sm.id = sc.supplier_market_id
      WHERE sc.id = supplier_families.supplier_category_id
        AND sc.is_active = true
        AND sm.is_active = true
    )
  );

CREATE POLICY "client_read_supplier_subfamilies" ON supplier_subfamilies
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND is_active = true
    AND EXISTS (
      SELECT 1 FROM supplier_families sf
      JOIN supplier_categories sc ON sc.id = sf.supplier_category_id
      JOIN supplier_markets sm ON sm.id = sc.supplier_market_id
      WHERE sf.id = supplier_subfamilies.supplier_family_id
        AND sf.is_active = true
        AND sc.is_active = true
        AND sm.is_active = true
    )
  );

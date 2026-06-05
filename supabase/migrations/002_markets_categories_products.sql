-- ============================================================
-- 002_markets_categories_products
-- ============================================================

-- ── Tablas ───────────────────────────────────────────────────

CREATE TABLE market_categories (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  slug        text        NOT NULL,
  description text,
  icon        text,
  sort_order  int         NOT NULL DEFAULT 0,
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT market_categories_slug_key UNIQUE (slug)
);

CREATE TABLE markets (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id   uuid        NOT NULL REFERENCES market_categories(id) ON DELETE RESTRICT,
  name          text        NOT NULL,
  slug          text        NOT NULL,
  description   text,
  country_scope text        NOT NULL DEFAULT 'ES',
  is_active     boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT markets_category_slug_key UNIQUE (category_id, slug)
);

CREATE TABLE products (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id   uuid        NOT NULL REFERENCES markets(id) ON DELETE RESTRICT,
  name        text        NOT NULL,
  slug        text        NOT NULL,
  unit        text        NOT NULL DEFAULT 'kg',
  description text,
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT products_market_slug_key UNIQUE (market_id, slug)
);

-- ── Triggers updated_at ──────────────────────────────────────

CREATE TRIGGER set_updated_at_market_categories
  BEFORE UPDATE ON market_categories
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at_markets
  BEFORE UPDATE ON markets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER set_updated_at_products
  BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Índices ──────────────────────────────────────────────────

CREATE INDEX idx_market_categories_slug
  ON market_categories (slug);

CREATE INDEX idx_market_categories_active_order
  ON market_categories (is_active, sort_order);

CREATE INDEX idx_markets_category_id
  ON markets (category_id);

CREATE INDEX idx_markets_category_slug
  ON markets (category_id, slug);

CREATE INDEX idx_markets_active
  ON markets (is_active);

CREATE INDEX idx_products_market_id
  ON products (market_id);

CREATE INDEX idx_products_market_slug
  ON products (market_id, slug);

CREATE INDEX idx_products_active
  ON products (is_active);

-- ── RLS ──────────────────────────────────────────────────────

ALTER TABLE market_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE markets            ENABLE ROW LEVEL SECURITY;
ALTER TABLE products           ENABLE ROW LEVEL SECURITY;

-- platform_admin: acceso total con WITH CHECK
CREATE POLICY "admin_all_categories" ON market_categories
  FOR ALL
  USING      (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY "admin_all_markets" ON markets
  FOR ALL
  USING      (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY "admin_all_products" ON products
  FOR ALL
  USING      (is_platform_admin())
  WITH CHECK (is_platform_admin());

-- clientes autenticados: solo lectura de activos con cadena completa
CREATE POLICY "client_read_categories" ON market_categories
  FOR SELECT
  USING (auth.uid() IS NOT NULL AND is_active = true);

CREATE POLICY "client_read_markets" ON markets
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND is_active = true
    AND EXISTS (
      SELECT 1 FROM market_categories mc
      WHERE mc.id = markets.category_id
        AND mc.is_active = true
    )
  );

CREATE POLICY "client_read_products" ON products
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND is_active = true
    AND EXISTS (
      SELECT 1 FROM markets m
      JOIN market_categories mc ON mc.id = m.category_id
      WHERE m.id = products.market_id
        AND m.is_active = true
        AND mc.is_active = true
    )
  );

-- ── Seed ─────────────────────────────────────────────────────

INSERT INTO market_categories (name, slug, description, icon, sort_order) VALUES
  ('Avícola',   'avicola',   'Mercados de aves y derivados',                    '🐔', 1),
  ('Porcino',   'porcino',   'Mercados de porcino y derivados',                 '🐷', 2),
  ('Bovino',    'bovino',    'Mercados de bovino y lácteos',                    '🐄', 3),
  ('Cereales',  'cereales',  'Mercados de cereales y materias primas agrícolas', '🌾', 4),
  ('Quesos',    'quesos',    'Mercados de quesos y derivados lácteos',          '🧀', 5),
  ('Plástico',  'plastico',  'Mercados de plásticos industriales',              '🏭', 6),
  ('Energías',  'energias',  'Mercados de energía y combustibles',              '⚡', 7);

WITH cats AS (SELECT id, slug FROM market_categories)
INSERT INTO markets (category_id, name, slug, description, country_scope) VALUES
  ((SELECT id FROM cats WHERE slug='avicola'),   'Pollo España',           'pollo-espana',      'Mercado de pollo vivo y canal en España',        'ES'),
  ((SELECT id FROM cats WHERE slug='porcino'),   'Porcino España',         'porcino-espana',    'Mercado de porcino canal y despojos en España',  'ES'),
  ((SELECT id FROM cats WHERE slug='bovino'),    'Bovino España',          'bovino-espana',     'Mercado de ternera y vacuno en España',          'ES'),
  ((SELECT id FROM cats WHERE slug='cereales'),  'Cereales España',        'cereales-espana',   'Mercado de cereales y oleaginosas en España',    'ES'),
  ((SELECT id FROM cats WHERE slug='quesos'),    'Quesos España',          'quesos-espana',     'Mercado de quesos nacionales e importados',      'ES'),
  ((SELECT id FROM cats WHERE slug='plastico'),  'Plásticos Industriales', 'plasticos-ind',     'Mercado de plásticos y polímeros industriales',  'EU'),
  ((SELECT id FROM cats WHERE slug='energias'),  'Energía Eléctrica',      'energia-electrica', 'Mercado mayorista de electricidad (OMIE)',       'ES');

WITH mkts AS (SELECT id, slug FROM markets)
INSERT INTO products (market_id, name, slug, unit, description) VALUES
  ((SELECT id FROM mkts WHERE slug='pollo-espana'),      'Pollo vivo',        'pollo-vivo',       'kg',  'Pollo vivo en granja, precio de lonja'),
  ((SELECT id FROM mkts WHERE slug='pollo-espana'),      'Pechuga de pollo',  'pechuga-pollo',    'kg',  'Pechuga de pollo fileteada, precio mayorista'),
  ((SELECT id FROM mkts WHERE slug='porcino-espana'),    'Cerdo canal',       'cerdo-canal',      'kg',  'Cerdo canal caliente, precio de lonja'),
  ((SELECT id FROM mkts WHERE slug='bovino-espana'),     'Ternera canal',     'ternera-canal',    'kg',  'Ternera canal, categoría extra'),
  ((SELECT id FROM mkts WHERE slug='cereales-espana'),   'Trigo blando',      'trigo-blando',     'ton', 'Trigo blando panificable, precio MFAO'),
  ((SELECT id FROM mkts WHERE slug='cereales-espana'),   'Maíz amarillo',     'maiz-amarillo',    'ton', 'Maíz amarillo, precio de origen'),
  ((SELECT id FROM mkts WHERE slug='bovino-espana'),     'Leche cruda',       'leche-cruda',      'L',   'Leche cruda de vaca, precio en origen'),
  ((SELECT id FROM mkts WHERE slug='plasticos-ind'),     'Plástico PET',      'plastico-pet',     'ton', 'PET grado alimentario, precio europeo'),
  ((SELECT id FROM mkts WHERE slug='energia-electrica'), 'Electricidad OMIE', 'electricidad-omie','MWh', 'Precio spot mercado diario OMIE');

-- ── Tabla ─────────────────────────────────────────────────────────────────────

CREATE TABLE product_price_records (
  id          uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  uuid          NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  source_id   uuid          NULL,
  price       numeric(12,4) NOT NULL,
  unit        text          NOT NULL,
  currency    text          NOT NULL DEFAULT 'EUR',
  country     text          NOT NULL DEFAULT 'ES',
  region      text          NULL,
  recorded_at date          NOT NULL,
  min_price   numeric(12,4) NULL,
  max_price   numeric(12,4) NULL,
  avg_price   numeric(12,4) NULL,
  volume      numeric(16,4) NULL,
  metadata    jsonb         NULL,
  created_at  timestamptz   NOT NULL DEFAULT now(),
  updated_at  timestamptz   NOT NULL DEFAULT now()
);

-- ── Trigger updated_at ────────────────────────────────────────────────────────

CREATE TRIGGER set_updated_at_product_price_records
  BEFORE UPDATE ON product_price_records
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Índices ───────────────────────────────────────────────────────────────────

CREATE INDEX idx_ppr_product_id
  ON product_price_records (product_id);

CREATE INDEX idx_ppr_product_recorded
  ON product_price_records (product_id, recorded_at DESC);

CREATE INDEX idx_ppr_recorded_at
  ON product_price_records (recorded_at DESC);

CREATE INDEX idx_ppr_country
  ON product_price_records (country);

CREATE INDEX idx_ppr_product_country_recorded
  ON product_price_records (product_id, country, recorded_at DESC);

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE product_price_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_all_price_records" ON product_price_records
  FOR ALL
  USING      (is_platform_admin())
  WITH CHECK (is_platform_admin());

CREATE POLICY "client_read_price_records" ON product_price_records
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM products p
      JOIN markets m            ON m.id  = p.market_id
      JOIN market_categories mc ON mc.id = m.category_id
      WHERE p.id         = product_price_records.product_id
        AND p.is_active  = true
        AND m.is_active  = true
        AND mc.is_active = true
    )
  );

-- ── Seed ─────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_pollo_vivo    uuid;
  v_pechuga       uuid;
  v_trigo         uuid;
  v_maiz          uuid;
  v_pet           uuid;
  v_elec          uuid;
BEGIN
  SELECT p.id INTO v_pollo_vivo
    FROM products p JOIN markets m ON m.id = p.market_id
    WHERE m.slug = 'pollo-espana' AND p.slug = 'pollo-vivo';

  SELECT p.id INTO v_pechuga
    FROM products p JOIN markets m ON m.id = p.market_id
    WHERE m.slug = 'pollo-espana' AND p.slug = 'pechuga-pollo';

  SELECT p.id INTO v_trigo
    FROM products p JOIN markets m ON m.id = p.market_id
    WHERE m.slug = 'cereales-espana' AND p.slug = 'trigo-blando';

  SELECT p.id INTO v_maiz
    FROM products p JOIN markets m ON m.id = p.market_id
    WHERE m.slug = 'cereales-espana' AND p.slug = 'maiz-amarillo';

  SELECT p.id INTO v_pet
    FROM products p JOIN markets m ON m.id = p.market_id
    WHERE m.slug = 'plasticos-ind' AND p.slug = 'plastico-pet';

  SELECT p.id INTO v_elec
    FROM products p JOIN markets m ON m.id = p.market_id
    WHERE m.slug = 'energia-electrica' AND p.slug = 'electricidad-omie';

  IF v_pollo_vivo IS NOT NULL THEN
    INSERT INTO product_price_records
      (product_id, price, min_price, max_price, avg_price, unit, currency, country, recorded_at)
    SELECT
      v_pollo_vivo,
      ROUND((1.20 + (random()*0.20 - 0.10))::numeric, 4),
      ROUND((1.10 + (random()*0.10))::numeric, 4),
      ROUND((1.25 + (random()*0.10))::numeric, 4),
      ROUND((1.20 + (random()*0.10 - 0.05))::numeric, 4),
      'kg', 'EUR', 'ES', (current_date - i)::date
    FROM generate_series(0, 89) s(i);
  END IF;

  IF v_pechuga IS NOT NULL THEN
    INSERT INTO product_price_records
      (product_id, price, min_price, max_price, avg_price, unit, currency, country, recorded_at)
    SELECT
      v_pechuga,
      ROUND((3.80 + (random()*0.40 - 0.20))::numeric, 4),
      ROUND((3.60 + (random()*0.15))::numeric, 4),
      ROUND((4.00 + (random()*0.15))::numeric, 4),
      ROUND((3.80 + (random()*0.20 - 0.10))::numeric, 4),
      'kg', 'EUR', 'ES', (current_date - i)::date
    FROM generate_series(0, 89) s(i);
  END IF;

  IF v_trigo IS NOT NULL THEN
    INSERT INTO product_price_records
      (product_id, price, min_price, max_price, avg_price, unit, currency, country, recorded_at)
    SELECT
      v_trigo,
      ROUND((230.00 + (random()*20.0 - 10.0))::numeric, 4),
      ROUND((220.00 + (random()*8.0))::numeric, 4),
      ROUND((240.00 + (random()*8.0))::numeric, 4),
      ROUND((230.00 + (random()*10.0 - 5.0))::numeric, 4),
      'ton', 'EUR', 'ES', (current_date - i)::date
    FROM generate_series(0, 89) s(i);
  END IF;

  IF v_maiz IS NOT NULL THEN
    INSERT INTO product_price_records
      (product_id, price, min_price, max_price, avg_price, unit, currency, country, recorded_at)
    SELECT
      v_maiz,
      ROUND((200.00 + (random()*18.0 - 9.0))::numeric, 4),
      ROUND((192.00 + (random()*6.0))::numeric, 4),
      ROUND((210.00 + (random()*6.0))::numeric, 4),
      ROUND((200.00 + (random()*8.0 - 4.0))::numeric, 4),
      'ton', 'EUR', 'ES', (current_date - i)::date
    FROM generate_series(0, 89) s(i);
  END IF;

  IF v_pet IS NOT NULL THEN
    INSERT INTO product_price_records
      (product_id, price, min_price, max_price, avg_price, unit, currency, country, recorded_at)
    SELECT
      v_pet,
      ROUND((1350.00 + (random()*100.0 - 50.0))::numeric, 4),
      ROUND((1300.00 + (random()*30.0))::numeric, 4),
      ROUND((1400.00 + (random()*30.0))::numeric, 4),
      ROUND((1350.00 + (random()*50.0 - 25.0))::numeric, 4),
      'ton', 'EUR', 'EU', (current_date - i)::date
    FROM generate_series(0, 89) s(i);
  END IF;

  IF v_elec IS NOT NULL THEN
    INSERT INTO product_price_records
      (product_id, price, min_price, max_price, avg_price, unit, currency, country, recorded_at)
    SELECT
      v_elec,
      ROUND((85.00 + (random()*30.0 - 15.0))::numeric, 4),
      ROUND((70.00 + (random()*12.0))::numeric, 4),
      ROUND((100.00 + (random()*12.0))::numeric, 4),
      ROUND((85.00 + (random()*15.0 - 7.5))::numeric, 4),
      'MWh', 'EUR', 'ES', (current_date - i)::date
    FROM generate_series(0, 89) s(i);
  END IF;
END;
$$;

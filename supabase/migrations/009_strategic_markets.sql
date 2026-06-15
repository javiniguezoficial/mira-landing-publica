-- ============================================================
-- 009_strategic_markets
-- Nivel superior de la jerarquía de segmentación (4º nivel):
--   Mercado estratégico → Categoría → Mercado → Referencia
--
-- Migración ADITIVA. No modifica tablas ni policies existentes.
-- Solo crea la tabla nueva, añade una FK nullable en market_categories
-- y define RLS ÚNICAMENTE para la tabla nueva, replicando el patrón
-- ya usado en market_categories (002).
-- ============================================================

-- ── Tabla nueva ──────────────────────────────────────────────

CREATE TABLE strategic_markets (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text        NOT NULL,
  slug        text        NOT NULL,
  description text,
  icon        text,
  sort_order  int         NOT NULL DEFAULT 0,
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT strategic_markets_slug_key UNIQUE (slug)
);

-- ── FK nullable en market_categories (no rompe categorías existentes) ─

ALTER TABLE market_categories
  ADD COLUMN strategic_market_id uuid
    REFERENCES strategic_markets(id) ON DELETE SET NULL;

-- ── Trigger updated_at (reutiliza función existente) ─────────

CREATE TRIGGER set_updated_at_strategic_markets
  BEFORE UPDATE ON strategic_markets
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── Índices ──────────────────────────────────────────────────

CREATE INDEX idx_strategic_markets_slug
  ON strategic_markets (slug);

CREATE INDEX idx_strategic_markets_active_order
  ON strategic_markets (is_active, sort_order);

CREATE INDEX idx_market_categories_strategic_market_id
  ON market_categories (strategic_market_id);

-- ── RLS (solo tabla nueva) ───────────────────────────────────

ALTER TABLE strategic_markets ENABLE ROW LEVEL SECURITY;

-- platform_admin: acceso total con WITH CHECK
CREATE POLICY "admin_all_strategic_markets" ON strategic_markets
  FOR ALL
  USING      (is_platform_admin())
  WITH CHECK (is_platform_admin());

-- clientes autenticados: solo lectura de activos
CREATE POLICY "client_read_strategic_markets" ON strategic_markets
  FOR SELECT
  USING (auth.uid() IS NOT NULL AND is_active = true);

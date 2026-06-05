import { createClient } from '@/lib/supabase/server'

export interface PricePoint {
  recorded_at: string
  price: number
  min_price: number | null
  max_price: number | null
  avg_price: number | null
}

export interface ProductPriceStats {
  current: number
  unit: string
  currency: string
  avg30: number
  min30: number
  max30: number
  change30: number        // % cambio vs hace 30 días
  history: PricePoint[]  // últimos 90 días ordenados ASC
}

export interface ProductDetail {
  id: string
  name: string
  slug: string
  unit: string
  description: string | null
  market: { id: string; name: string; slug: string; country_scope: string }
  category: { id: string; name: string; slug: string; icon: string | null }
}

// ── Resolución de producto por market.slug + product.slug ────────────────────

export async function getProductDetail(
  marketSlug: string,
  productSlug: string,
): Promise<ProductDetail | null> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('products')
    .select(`
      id, name, slug, unit, description,
      market:markets(
        id, name, slug, country_scope,
        category:market_categories(id, name, slug, icon)
      )
    `)
    .eq('slug', productSlug)
    .eq('is_active', true)
    .single()

  if (!data) return null

  // Verificar que el market slug coincide y está activo
  const market = Array.isArray(data.market) ? data.market[0] : data.market
  if (!market || market.slug !== marketSlug) return null

  const category = Array.isArray(market.category) ? market.category[0] : market.category
  if (!category) return null

  return {
    id:          data.id,
    name:        data.name,
    slug:        data.slug,
    unit:        data.unit,
    description: data.description,
    market: {
      id:            market.id,
      name:          market.name,
      slug:          market.slug,
      country_scope: market.country_scope,
    },
    category: {
      id:   category.id,
      name: category.name,
      slug: category.slug,
      icon: category.icon,
    },
  }
}

// ── Stats de precio ───────────────────────────────────────────────────────────

export async function getProductPriceStats(
  productId: string,
): Promise<ProductPriceStats | null> {
  const supabase = await createClient()

  // Últimos 90 días, ordenados ASC para el gráfico
  const { data, error } = await supabase
    .from('product_price_records')
    .select('recorded_at, price, min_price, max_price, avg_price, unit, currency')
    .eq('product_id', productId)
    .gte('recorded_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10))
    .order('recorded_at', { ascending: true })

  if (error || !data || data.length === 0) return null

  // Convertir numeric strings → number
  const rows = data.map(r => ({
    recorded_at: r.recorded_at,
    price:     parseFloat(r.price as unknown as string),
    min_price: r.min_price != null ? parseFloat(r.min_price as unknown as string) : null,
    max_price: r.max_price != null ? parseFloat(r.max_price as unknown as string) : null,
    avg_price: r.avg_price != null ? parseFloat(r.avg_price as unknown as string) : null,
    unit:     (r as unknown as { unit: string }).unit,
    currency: (r as unknown as { currency: string }).currency,
  }))

  const last  = rows[rows.length - 1]
  const first = rows[0]

  // Stats 30 días
  const rows30 = rows.slice(-30)
  const avg30  = rows30.reduce((s, r) => s + r.price, 0) / rows30.length
  const min30  = Math.min(...rows30.map(r => r.min_price ?? r.price))
  const max30  = Math.max(...rows30.map(r => r.max_price ?? r.price))

  // Cambio respecto al primer día disponible
  const change30 = first.price > 0
    ? ((last.price - first.price) / first.price) * 100
    : 0

  return {
    current:  last.price,
    unit:     (last as unknown as { unit: string }).unit ?? '',
    currency: (last as unknown as { currency: string }).currency ?? 'EUR',
    avg30:    Math.round(avg30 * 10000) / 10000,
    min30,
    max30,
    change30: Math.round(change30 * 100) / 100,
    history:  rows,
  }
}

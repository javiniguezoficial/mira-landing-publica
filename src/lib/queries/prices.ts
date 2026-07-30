import { createClient } from '@/lib/supabase/server'

export interface PricePoint {
  recorded_at: string
  price: number
  min_price: number | null
  max_price: number | null
  avg_price: number | null
}

/**
 * Estadísticas de un producto SOBRE EL PERIODO PEDIDO (2.3).
 *
 * Los nombres eran `avg30` / `min30` / `max30` / `change30` cuando la ventana
 * era siempre de 90 días y las estadísticas se calculaban sobre las últimas 30
 * filas. Con el periodo ya variable, esos nombres mentían: en `ALL` no había
 * nada de «30» en el cálculo. Se renombran para que la etiqueta de la interfaz
 * y el dato digan lo mismo.
 */
export interface ProductPriceStats {
  current: number
  unit: string
  currency: string
  /** Media de todos los registros del periodo. */
  avgPeriod: number
  minPeriod: number
  maxPeriod: number
  /** % de variación entre el primer y el último registro del periodo. */
  changePeriod: number
  /** Serie completa del periodo, ascendente por `recorded_at`. */
  history: PricePoint[]
}

export interface ProductDetail {
  id: string
  name: string
  slug: string
  unit: string
  description: string | null
  /** 2.4 — lonja de referencia. Texto libre en `products`; puede faltar. */
  lonja: string | null
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
      id, name, slug, unit, description, lonja,
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
    lonja:       (data as unknown as { lonja: string | null }).lonja ?? null,
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

/**
 * Serie y estadísticas de un producto para el periodo pedido (2.3).
 *
 * `from` es la fecha inicial `YYYY-MM-DD` que devuelve `marketPeriodStartDate`,
 * o `null` para todo el histórico. Antes había aquí una ventana fija de 90 días
 * calculada con `toISOString()`, que además convertía a UTC y podía desplazar
 * el límite un día en horario español.
 *
 * El recorte lo hace PostgreSQL con `recorded_at >= from`, apoyado en el índice
 * `idx_ppr_product_recorded (product_id, recorded_at DESC)` que ya existía. No
 * se trae el histórico completo para filtrarlo en el servidor de Next ni, mucho
 * menos, en el navegador.
 */
export async function getProductPriceStats(
  productId: string,
  from: string | null = null,
): Promise<ProductPriceStats | null> {
  const supabase = await createClient()

  let query = supabase
    .from('product_price_records')
    .select('recorded_at, price, min_price, max_price, avg_price, unit, currency')
    .eq('product_id', productId)

  // `ALL` (from = null) no añade filtro: se pide el histórico entero.
  if (from) query = query.gte('recorded_at', from)

  const { data, error } = await query.order('recorded_at', { ascending: true })

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

  // Estadísticas sobre TODO el periodo, no sobre un recorte de 30 filas: la
  // ventana ya la eligió quien mira, y volver a recortarla aquí produciría un
  // «mínimo» que no es el mínimo de lo que se está viendo en el gráfico.
  const avgPeriod = rows.reduce((s, r) => s + r.price, 0) / rows.length
  const minPeriod = Math.min(...rows.map(r => r.min_price ?? r.price))
  const maxPeriod = Math.max(...rows.map(r => r.max_price ?? r.price))

  // Variación entre el primer y el último registro del periodo.
  const changePeriod = first.price > 0
    ? ((last.price - first.price) / first.price) * 100
    : 0

  return {
    current:  last.price,
    unit:     (last as unknown as { unit: string }).unit ?? '',
    currency: (last as unknown as { currency: string }).currency ?? 'EUR',
    avgPeriod: Math.round(avgPeriod * 10000) / 10000,
    minPeriod,
    maxPeriod,
    changePeriod: Math.round(changePeriod * 100) / 100,
    history:  rows,
  }
}

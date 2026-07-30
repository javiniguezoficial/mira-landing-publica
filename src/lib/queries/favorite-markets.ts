import { createClient } from '@/lib/supabase/server'
import { getMarketAccessContext } from '@/lib/queries/market-access'
import { visibleFavoriteMarketIds } from '@/lib/markets/access'
import { marketPeriodStartDate, type MarketPeriod } from '@/lib/markets/period'

export interface FavoriteMarketCard {
  id: string
  name: string
  slug: string
  countryScope: string
  categoryName: string
  /** Producto del mercado con el dato más reciente, para poder enlazar al detalle. */
  productSlug: string | null
  productName: string | null
  lastPrice: number | null
  currency: string | null
  unit: string | null
  lastDate: string | null
  /** Variación % entre el primer y el último dato del periodo. `null` si no se puede calcular. */
  change: number | null
}

/**
 * Periodo del bloque de favoritos del Dashboard.
 *
 * FIJO y documentado, a propósito. El Dashboard es un vistazo, no una
 * herramienta de análisis: meter ahí un selector de periodo duplicaría el
 * control que ya vive en Market Intelligence y obligaría a mantener dos estados
 * sincronizados sin aportar nada. Quien quiera cambiar la ventana entra en
 * Market Intelligence, que es donde está el selector completo.
 */
export const DASHBOARD_FAVORITES_PERIOD: MarketPeriod = 'Y'

/** Cuántas tarjetas caben sin convertir el Dashboard en un listado. */
export const DASHBOARD_FAVORITES_LIMIT = 6

/**
 * Mercados favoritos de quien hace la petición, con su último precio (2.1).
 *
 * ── Cómo evita el N+1 ───────────────────────────────────────────────────────
 *
 * El camino ingenuo sería: leer los favoritos, y por cada uno consultar sus
 * productos y por cada producto su último precio. Con 6 favoritos eso son 13
 * consultas y crece con los datos.
 *
 * Aquí son TRES consultas fijas, sea cual sea el número de favoritos:
 *
 *   1. el contexto de acceso (módulo + deshabilitados + favoritos), que ya
 *      estaba resuelto en una sola carga;
 *   2. los mercados favoritos visibles, con sus productos embebidos;
 *   3. los registros de precio de esos productos, en un único `in (…)`.
 *
 * La agregación —último precio por mercado y variación del periodo— se hace en
 * memoria sobre un conjunto ya acotado por mercado y por fecha.
 *
 * ── Favoritos de mercados deshabilitados ────────────────────────────────────
 *
 * Se filtran con `visibleFavoriteMarketIds`, que NO los borra: la fila sigue en
 * `user_market_favorites` y el mercado reaparece intacto si la plataforma lo
 * rehabilita. RLS lo garantiza además por su cuenta —`client_read_markets` ya
 * no devolvería ese mercado—, así que el filtro de aquí es la explicación, no
 * la defensa.
 */
export async function getFavoriteMarketCards(
  limit: number = DASHBOARD_FAVORITES_LIMIT,
): Promise<FavoriteMarketCard[]> {
  const access = await getMarketAccessContext()

  // Sin módulo no hay nada que enseñar; el Dashboard ya muestra el aviso de 1.4.
  if (!access.moduleEnabled) return []

  const visibles = visibleFavoriteMarketIds([...access.favoriteMarketIds], access)
  if (visibles.length === 0) return []

  const supabase = await createClient()

  const { data: markets } = await supabase
    .from('markets')
    .select(`
      id, name, slug, country_scope,
      category:market_categories!inner(id, name),
      products(id, name, slug, unit, is_active)
    `)
    .in('id', visibles)
    .eq('is_active', true)
    .order('name')
    .limit(limit)

  const rows = (markets ?? []) as unknown as Array<Record<string, unknown>>
  if (rows.length === 0) return []

  // Todos los productos de todos los mercados favoritos, de una vez.
  const productIds: string[] = []
  const productOwner = new Map<string, { marketId: string; name: string; slug: string; unit: string }>()

  for (const market of rows) {
    const products = (market.products ?? []) as Array<Record<string, unknown>>
    for (const p of products) {
      if (p.is_active === false) continue
      const id = p.id as string
      productIds.push(id)
      productOwner.set(id, {
        marketId: market.id as string,
        name: p.name as string,
        slug: p.slug as string,
        unit: p.unit as string,
      })
    }
  }

  const from = marketPeriodStartDate(DASHBOARD_FAVORITES_PERIOD)

  // Una sola consulta para TODOS los productos de TODOS los favoritos.
  let priceRows: Array<Record<string, unknown>> = []
  if (productIds.length > 0) {
    let query = supabase
      .from('product_price_records')
      .select('product_id, price, currency, unit, recorded_at')
      .in('product_id', productIds)
    if (from) query = query.gte('recorded_at', from)

    const { data } = await query.order('recorded_at', { ascending: true })
    priceRows = (data ?? []) as Array<Record<string, unknown>>
  }

  // Primer y último dato por MERCADO, en una pasada. Las filas vienen ordenadas
  // ascendentes, así que el primero que se ve es el más antiguo y el último que
  // se ve es el más reciente.
  interface Agg {
    firstPrice: number
    lastPrice: number
    lastDate: string
    currency: string
    unit: string
    productId: string
  }
  const byMarket = new Map<string, Agg>()

  for (const row of priceRows) {
    const owner = productOwner.get(row.product_id as string)
    if (!owner) continue

    const price = parseFloat(row.price as string)
    if (!Number.isFinite(price)) continue

    const existing = byMarket.get(owner.marketId)
    if (!existing) {
      byMarket.set(owner.marketId, {
        firstPrice: price,
        lastPrice: price,
        lastDate: row.recorded_at as string,
        currency: row.currency as string,
        unit: row.unit as string,
        productId: row.product_id as string,
      })
      continue
    }

    existing.lastPrice = price
    existing.lastDate = row.recorded_at as string
    existing.currency = row.currency as string
    existing.unit = row.unit as string
    existing.productId = row.product_id as string
  }

  return rows.map((market) => {
    const marketId = market.id as string
    const category = (Array.isArray(market.category) ? market.category[0] : market.category) as
      | { name: string }
      | undefined
    const agg = byMarket.get(marketId)
    const owner = agg ? productOwner.get(agg.productId) : undefined

    const change =
      agg && agg.firstPrice > 0
        ? Math.round(((agg.lastPrice - agg.firstPrice) / agg.firstPrice) * 10000) / 100
        : null

    return {
      id: marketId,
      name: market.name as string,
      slug: market.slug as string,
      countryScope: market.country_scope as string,
      categoryName: category?.name ?? '—',
      productSlug: owner?.slug ?? null,
      productName: owner?.name ?? null,
      lastPrice: agg?.lastPrice ?? null,
      currency: agg?.currency ?? null,
      unit: agg?.unit ?? null,
      lastDate: agg?.lastDate ?? null,
      change,
    }
  })
}

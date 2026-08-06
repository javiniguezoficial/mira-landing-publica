'use server'

import { requirePlatformAdmin } from '@/lib/auth/guards'
import { createClient } from '@/lib/supabase/server'
import { fetchAllRows } from '@/lib/supabase/fetch-all'
import { getPriceFacetValues } from '@/lib/queries/lonjas'
import { isNonMonetaryUnit } from '@/lib/utils'

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface PriceRecord {
  id: string
  product_id: string
  source_id: string | null
  price: number
  unit: string
  currency: string
  country: string
  region: string | null
  recorded_at: string
  min_price: number | null
  max_price: number | null
  avg_price: number | null
  volume: number | null
  metadata: Record<string, unknown> | null
  created_at: string
  updated_at: string
}

export interface PriceFormData {
  price: number
  unit: string
  currency: string
  country: string
  region?: string
  recorded_at: string
  min_price?: number | null
  max_price?: number | null
  avg_price?: number | null
  volume?: number | null
}


// ── Listar precios de un producto ─────────────────────────────────────────────

export async function getPricesByProduct(
  productId: string,
  limit = 100,
  offset = 0,
): Promise<{ records: PriceRecord[]; total: number }> {
  const { supabase } = await requirePlatformAdmin()

  const { data, error, count } = await supabase
    .from('product_price_records')
    .select('*', { count: 'exact' })
    .eq('product_id', productId)
    .order('recorded_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) throw new Error(error.message)

  // Convertir numeric strings a number
  const records = (data ?? []).map(r => ({
    ...r,
    price:     parseFloat(r.price),
    min_price: r.min_price != null ? parseFloat(r.min_price) : null,
    max_price: r.max_price != null ? parseFloat(r.max_price) : null,
    avg_price: r.avg_price != null ? parseFloat(r.avg_price) : null,
    volume:    r.volume    != null ? parseFloat(r.volume)    : null,
  })) as PriceRecord[]

  return { records, total: count ?? 0 }
}

// ── Obtener un registro ───────────────────────────────────────────────────────

export async function getPriceRecordById(id: string): Promise<PriceRecord | null> {
  const { supabase } = await requirePlatformAdmin()
  const { data } = await supabase
    .from('product_price_records').select('*').eq('id', id).single()
  if (!data) return null
  return {
    ...data,
    price:     parseFloat(data.price),
    min_price: data.min_price != null ? parseFloat(data.min_price) : null,
    max_price: data.max_price != null ? parseFloat(data.max_price) : null,
    avg_price: data.avg_price != null ? parseFloat(data.avg_price) : null,
    volume:    data.volume    != null ? parseFloat(data.volume)    : null,
  } as PriceRecord
}

// ── Crear ─────────────────────────────────────────────────────────────────────

export async function createPriceRecord(
  productId: string,
  form: PriceFormData,
): Promise<{ id: string }> {
  const { supabase } = await requirePlatformAdmin()
  const { data, error } = await supabase
    .from('product_price_records')
    .insert({
      product_id:  productId,
      price:       form.price,
      unit:        form.unit.trim(),
      // 037 — un porcentaje o un índice no llevan moneda. La restricción de la
      // base lo exige; aquí se cumple en lugar de esperar a que reviente.
      currency:    isNonMonetaryUnit(form.unit) ? null : form.currency.trim(),
      country:     form.country.trim(),
      region:      form.region?.trim() || null,
      recorded_at: form.recorded_at,
      min_price:   form.min_price ?? null,
      max_price:   form.max_price ?? null,
      avg_price:   form.avg_price ?? null,
      volume:      form.volume    ?? null,
    })
    .select('id').single()
  if (error) throw new Error(error.message)
  return { id: data.id }
}

// ── Editar ────────────────────────────────────────────────────────────────────

export async function updatePriceRecord(
  id: string,
  form: PriceFormData,
): Promise<void> {
  const { supabase } = await requirePlatformAdmin()
  const { error } = await supabase
    .from('product_price_records')
    .update({
      price:       form.price,
      unit:        form.unit.trim(),
      // 037 — un porcentaje o un índice no llevan moneda. La restricción de la
      // base lo exige; aquí se cumple en lugar de esperar a que reviente.
      currency:    isNonMonetaryUnit(form.unit) ? null : form.currency.trim(),
      country:     form.country.trim(),
      region:      form.region?.trim() || null,
      recorded_at: form.recorded_at,
      min_price:   form.min_price ?? null,
      max_price:   form.max_price ?? null,
      avg_price:   form.avg_price ?? null,
      volume:      form.volume    ?? null,
      updated_at:  new Date().toISOString(),
    })
    .eq('id', id)
  if (error) throw new Error(error.message)
}

// ── Eliminar ──────────────────────────────────────────────────────────────────

export async function deletePriceRecord(id: string): Promise<void> {
  const { supabase } = await requirePlatformAdmin()
  const { error } = await supabase
    .from('product_price_records').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ═══════════════════════════════════════════════════════════════════════════════
// PRECIOS GLOBAL — jerarquía Pricing, alta manual y listado filtrado (P2.6/PR1/PR2)
// ═══════════════════════════════════════════════════════════════════════════════

// ── Jerarquía Pricing (activa) para selects encadenados ────────────────────────
// Arrays planos con referencia al padre → el encadenado se hace en cliente y
// "Todos" muestra todos los hijos del ancestro seleccionado. Usa createClient
// (no requireAdmin) + is_active: sirve tanto para admin como para cliente (RLS
// de strategic_markets/market_categories/markets/products filtra por cadena
// activa en el área cliente).
// Valores distintos existentes de los atributos de producto → alimentan los
// selects de filtro (lonja/variedad/calibre/incoterm/tipo/unidad) sin migración.
export interface PricingFacets {
  lonjas: string[]
  variedades: string[]
  calibres: string[]
  incoterms: string[]
  tipos: string[]
  units: string[]
}

export interface PricingHierarchy {
  strategicMarkets: { id: string; name: string }[]
  categories: { id: string; name: string; strategic_market_id: string | null }[]
  markets: { id: string; name: string; category_id: string }[]
  products: { id: string; name: string; unit: string; market_id: string }[]
  facets: PricingFacets
}

interface RawPricingProduct {
  id: string; name: string; unit: string; market_id: string
  lonja: string | null; variedad: string | null; calibre: string | null; incoterm: string | null; tipo: string | null
}

export async function getPricingTree(): Promise<PricingHierarchy> {
  const supabase = await createClient()
  const [sm, cat, mk, productos, facetValues] = await Promise.all([
    supabase.from('strategic_markets').select('id, name').eq('is_active', true).order('sort_order').order('name'),
    supabase.from('market_categories').select('id, name, strategic_market_id').eq('is_active', true).order('sort_order').order('name'),
    supabase.from('markets').select('id, name, category_id').eq('is_active', true).order('name'),
    // 037 — PAGINADO. Hay 973 productos activos y PostgREST recorta en 1.000
    // sin avisar: el desplegable de referencias estaba a 27 altas de empezar a
    // perder productos en silencio.
    fetchAllRows<RawPricingProduct>(
      () =>
        supabase
          .from('products')
          .select('id, name, unit, market_id, lonja, variedad, calibre, incoterm, tipo')
          .eq('is_active', true)
          .order('name'),
      { label: 'pricing-tree/products' },
    ),
    // 037 — las facetas de lonja y unidad se calculan en SQL.
    //
    // unit vive también en products, pero con otro significado (precio/medida
    // del producto, p.ej. "€/kg"). El filtro real se aplica sobre
    // product_price_records.unit (p.ej. "kg", "ton"), así que el facet de
    // unidades debe salir de esa tabla — y la lonja igual, desde que cada precio
    // lleva la suya (034).
    //
    // Se hacía con un `select unit, lonja` sin límite sobre 73.340 filas, que
    // PostgREST recortaba en 1.000: los desplegables ofrecían un subconjunto
    // arbitrario de los valores que existen de verdad.
    getPriceFacetValues(),
  ])

  const rawProducts = productos.rows

  // Valores únicos, sin nulos/vacíos, ordenados (para los selects de filtro).
  const uniq = (vals: (string | null | undefined)[]): string[] =>
    Array.from(new Set(vals.map((v) => v?.trim()).filter((v): v is string => !!v)))
      .sort((a, b) => a.localeCompare(b, 'es'))

  const facets: PricingFacets = {
    lonjas:     facetValues.lonjas,
    variedades: uniq(rawProducts.map((p) => p.variedad)),
    calibres:   uniq(rawProducts.map((p) => p.calibre)),
    incoterms:  uniq(rawProducts.map((p) => p.incoterm)),
    tipos:      uniq(rawProducts.map((p) => p.tipo)),
    units:      facetValues.units,
  }

  return {
    strategicMarkets: (sm.data ?? []) as PricingHierarchy['strategicMarkets'],
    categories: (cat.data ?? []) as PricingHierarchy['categories'],
    markets: (mk.data ?? []) as PricingHierarchy['markets'],
    // Payload liviano al cliente: solo lo que usan los selects encadenados.
    products: rawProducts.map((p) => ({ id: p.id, name: p.name, unit: p.unit, market_id: p.market_id })),
    facets,
  }
}

// ── Listado global de precios con filtros server-side ──────────────────────────
// createClient (no requireAdmin): admin ve todo (policy admin_all) y cliente solo
// precios de cadena activa (policy client_read). Filtra por jerarquía Pricing vía
// embeds !inner, rango de fechas, país y moneda. Paginado con count exact.
export interface PriceListFilters {
  strategic_market_id?: string
  category_id?: string
  market_id?: string
  product_id?: string
  // Atributos de producto (viven en products, se filtran vía embed !inner)
  lonja?: string
  variedad?: string
  calibre?: string
  incoterm?: string
  tipo?: string
  // Atributos del registro de precio (product_price_records)
  region?: string
  unit?: string
  date_from?: string
  date_to?: string
  country?: string
  currency?: string
  limit?: number
  offset?: number
}

export interface PriceListRow {
  id: string
  price: number
  unit: string
  /** 037 — `null` en indicadores no monetarios (`%`, `Unidades`). */
  currency: string | null
  country: string
  region: string | null
  recorded_at: string
  /**
   * 034 — lonja DEL REGISTRO, no la de la ficha del producto.
   *
   * La tabla enseñaba `product.lonja`, que es el valor por defecto de la
   * referencia y no tiene por qué coincidir con la plaza de esta fila: desde
   * que una referencia cotiza en varias, mirar la del producto significaba
   * enseñar «España» en las 20 filas de un boletín europeo.
   */
  lonja: string | null
  /**
   * 037 — fuente del dato, tal y como se guardó al importar.
   *
   * Vive en `metadata->>'source'`. NO se deduce del nombre del fichero ni de
   * `source_id`, que sigue siendo una columna huérfana sin FK y con 0 filas
   * usándola. Las 73.340 filas actuales tienen la fuente informada («MAPA»,
   * «Comisión Europea», «Lonja de Barcelona»…); una fila sin ella se enseña
   * como «—», nunca rellenada con una suposición.
   */
  source: string | null
  min_price: number | null
  max_price: number | null
  avg_price: number | null
  volume: number | null
  product: { id: string; name: string; slug: string; lonja: string | null; variedad: string | null; calibre: string | null; incoterm: string | null; tipo: string | null } | null
  market: { id: string; name: string } | null
  category: { id: string; name: string } | null
  strategic: { id: string; name: string } | null
}

export interface PriceListPage {
  rows: PriceListRow[]
  total: number
  hasMore: boolean
}

// Embed de jerarquía Pricing reutilizado por listPriceRecordsFiltered y
// getPriceInsights: los filtros por punto (product.lonja, product.market.category_id…)
// requieren que la relación esté presente en el select con !inner, aunque el
// caller no necesite mostrar todos esos campos.
const PRODUCT_HIERARCHY_SELECT = `product:products!inner(
        id, name, slug, lonja, variedad, calibre, incoterm, tipo, market_id,
        market:markets!inner(
          id, name, category_id,
          category:market_categories!inner(
            id, name, strategic_market_id,
            strategic_market:strategic_markets(id, name)
          )
        )
      )`

// Aplica los filtros de PriceListFilters sobre un query builder de
// product_price_records ya seleccionado con PRODUCT_HIERARCHY_SELECT.
// Compartido por listPriceRecordsFiltered y getPriceInsights para no duplicar
// la lógica de filtrado server-side.
function applyPriceListFilters<Q>(query: Q, filters: PriceListFilters): Q {
  let q: any = query // eslint-disable-line @typescript-eslint/no-explicit-any
  if (filters.product_id)          q = q.eq('product_id', filters.product_id)
  if (filters.market_id)           q = q.eq('product.market_id', filters.market_id)
  if (filters.category_id)         q = q.eq('product.market.category_id', filters.category_id)
  if (filters.strategic_market_id) q = q.eq('product.market.category.strategic_market_id', filters.strategic_market_id)
  // 034 — la lonja se filtra sobre el REGISTRO, no sobre el producto. Antes
  // `product.lonja` devolvía todos los precios de un producto cuya ficha decía
  // esa lonja, incluidos los de otras plazas, y se dejaba fuera cualquier precio
  // de esa plaza cuyo producto estuviera fichado en otra.
  if (filters.lonja)               q = q.eq('lonja', filters.lonja)
  if (filters.variedad)            q = q.eq('product.variedad', filters.variedad)
  if (filters.calibre)             q = q.eq('product.calibre', filters.calibre)
  if (filters.incoterm)            q = q.eq('product.incoterm', filters.incoterm)
  if (filters.tipo)                q = q.eq('product.tipo', filters.tipo)
  if (filters.country)             q = q.eq('country', filters.country)
  if (filters.currency)            q = q.eq('currency', filters.currency)
  if (filters.unit)                q = q.eq('unit', filters.unit)
  if (filters.region)              q = q.ilike('region', `%${filters.region}%`)
  if (filters.date_from)           q = q.gte('recorded_at', filters.date_from)
  if (filters.date_to)             q = q.lte('recorded_at', filters.date_to)
  return q as Q
}

export async function listPriceRecordsFiltered(filters: PriceListFilters = {}): Promise<PriceListPage> {
  const supabase = await createClient()
  const limit = Math.min(filters.limit ?? 50, 500)
  const offset = filters.offset ?? 0

  let query = supabase
    .from('product_price_records')
    // 037 — `lonja` y `metadata` entran en el select porque la tabla las
    // enseña como columnas propias. Son dos campos más de las 50 filas de la
    // página, no una consulta adicional: sigue habiendo un solo viaje, sin N+1.
    .select(`
      id, price, unit, currency, country, region, recorded_at, lonja, metadata,
      min_price, max_price, avg_price, volume,
      ${PRODUCT_HIERARCHY_SELECT}
    `, { count: 'exact' })
    .order('recorded_at', { ascending: false })

  query = applyPriceListFilters(query, filters)
  query = query.range(offset, offset + limit - 1)

  const { data, error, count } = await query
  if (error || !data) return { rows: [], total: 0, hasMore: false }

  const rows: PriceListRow[] = (data as Array<Record<string, any>>).map((r) => {
    const product = Array.isArray(r.product) ? r.product[0] : r.product
    const market = product && (Array.isArray(product.market) ? product.market[0] : product.market)
    const category = market && (Array.isArray(market.category) ? market.category[0] : market.category)
    const strategic = category && (Array.isArray(category.strategic_market) ? category.strategic_market[0] : category.strategic_market)
    const metadata = (r.metadata ?? null) as Record<string, unknown> | null
    const source = typeof metadata?.source === 'string' ? metadata.source.trim() : ''
    return {
      id: r.id,
      price: parseFloat(r.price),
      unit: r.unit,
      currency: r.currency ?? null,
      country: r.country,
      region: r.region ?? null,
      recorded_at: r.recorded_at,
      lonja: typeof r.lonja === 'string' && r.lonja.trim() ? r.lonja.trim() : null,
      source: source || null,
      min_price: r.min_price != null ? parseFloat(r.min_price) : null,
      max_price: r.max_price != null ? parseFloat(r.max_price) : null,
      avg_price: r.avg_price != null ? parseFloat(r.avg_price) : null,
      volume:    r.volume    != null ? parseFloat(r.volume)    : null,
      product: product ? { id: product.id, name: product.name, slug: product.slug, lonja: product.lonja ?? null, variedad: product.variedad ?? null, calibre: product.calibre ?? null, incoterm: product.incoterm ?? null, tipo: product.tipo ?? null } : null,
      market: market ? { id: market.id, name: market.name } : null,
      category: category ? { id: category.id, name: category.name } : null,
      strategic: strategic ? { id: strategic.id, name: strategic.name } : null,
    }
  })

  const total = count ?? 0
  return { rows, total, hasMore: total > offset + limit }
}

// ── Resumen + serie temporal para vista cliente/admin (PR3.2) ──────────────────
// Cota de filas usadas para calcular resumen/gráfico: evita traer toda la tabla
// si los filtros son muy amplios. Se ordena por recorded_at DESC y se toma la
// "cabeza" (los más recientes) para que "última fecha" y la tendencia mostrada
// sean siempre exactas y relevantes aunque el total supere la cota.
const PRICE_INSIGHTS_CAP = 2000

export interface PriceSeriesPoint {
  date: string
  avgPrice: number
}

export interface PriceInsights {
  count: number                // total exacto que cumple los filtros (no limitado por la cota)
  min: number | null
  max: number | null
  avg: number | null
  lastDate: string | null
  unit: string | null          // null → varias unidades distintas en la muestra
  /**
   * Moneda de la muestra, o `null`.
   *
   * 037 — `null` ya NO significa solo «hay varias». También significa «esta
   * magnitud no lleva moneda» (un índice, un porcentaje). Para distinguirlo hay
   * que mirar `mixedCurrency`: sin él, una serie del IPC se anunciaba como
   * «varias monedas» y el gráfico se negaba a dibujarla.
   */
  currency: string | null
  /** true → la muestra mezcla monedas distintas y no son comparables. */
  mixedCurrency: boolean
  /** true → la muestra mezcla unidades distintas y no son comparables. */
  mixedUnit: boolean
  capped: boolean              // true si count > sampleSize (resumen sobre una muestra reciente, no el total)
  sampleSize: number
  series: PriceSeriesPoint[]   // agregado por fecha (promedio del día), orden ascendente
}

const EMPTY_INSIGHTS: Omit<PriceInsights, 'count' | 'capped'> = {
  min: null, max: null, avg: null, lastDate: null, unit: null, currency: null,
  mixedCurrency: false, mixedUnit: false, sampleSize: 0, series: [],
}

export async function getPriceInsights(filters: PriceListFilters = {}): Promise<PriceInsights> {
  const supabase = await createClient()

  // Select liviano (sin min/max/avg/volume/country/region/nombres): solo lo
  // necesario para el resumen y el gráfico. El embed de jerarquía se mantiene
  // porque los filtros por punto (product.lonja, product.market_id…) lo requieren.
  let query = supabase
    .from('product_price_records')
    .select(`
      price, recorded_at, unit, currency,
      ${PRODUCT_HIERARCHY_SELECT}
    `, { count: 'exact' })
    .order('recorded_at', { ascending: false })

  query = applyPriceListFilters(query, filters)
  query = query.range(0, PRICE_INSIGHTS_CAP - 1)

  const { data, error, count } = await query
  const total = count ?? 0
  if (error || !data || data.length === 0) return { count: total, capped: false, ...EMPTY_INSIGHTS }

  const rows = (data as Array<Record<string, any>>).map((r) => ({
    price: parseFloat(r.price),
    recorded_at: r.recorded_at as string,
    unit: r.unit as string,
    currency: (r.currency as string | null) ?? null,
  }))

  const prices = rows.map((r) => r.price)
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  const avg = prices.reduce((s, p) => s + p, 0) / prices.length

  const units = new Set(rows.map((r) => r.unit))
  const currencies = new Set(rows.map((r) => r.currency))

  // Agrupado por fecha (promedio del día) para el gráfico de evolución.
  const byDate = new Map<string, { sum: number; n: number }>()
  for (const r of rows) {
    const acc = byDate.get(r.recorded_at) ?? { sum: 0, n: 0 }
    acc.sum += r.price
    acc.n += 1
    byDate.set(r.recorded_at, acc)
  }
  const series: PriceSeriesPoint[] = Array.from(byDate.entries())
    .map(([date, { sum, n }]) => ({ date, avgPrice: Math.round((sum / n) * 10000) / 10000 }))
    .sort((a, b) => a.date.localeCompare(b.date))

  return {
    count: total,
    min,
    max,
    avg: Math.round(avg * 10000) / 10000,
    lastDate: rows[0].recorded_at, // primer elemento: viene ordenado por recorded_at DESC
    unit: units.size === 1 ? rows[0].unit : null,
    // Con una sola moneda se devuelve esa moneda, que puede ser `null` de forma
    // legítima: toda la muestra es un índice o un porcentaje.
    currency: currencies.size === 1 ? rows[0].currency : null,
    mixedCurrency: currencies.size > 1,
    mixedUnit: units.size > 1,
    capped: total > rows.length,
    sampleSize: rows.length,
    series,
  }
}

// ── Alta manual global de precio (patrón { error }, no throw) ──────────────────
export interface ManualPriceFormData {
  recorded_at: string
  price: number
  unit: string
  currency?: string
  country?: string
  region?: string
  min_price?: number | null
  max_price?: number | null
  avg_price?: number | null
  source_name?: string   // → metadata.source_name
  notes?: string         // → metadata.notes
}

export async function createPriceManual(
  productId: string,
  form: ManualPriceFormData,
): Promise<{ id: string } | { error: string }> {
  const { supabase } = await requirePlatformAdmin()

  if (!productId) return { error: 'Debes seleccionar una referencia / producto' }
  if (!form.recorded_at) return { error: 'La fecha es obligatoria' }
  if (form.price == null || Number.isNaN(form.price)) return { error: 'El precio es obligatorio y debe ser numérico' }
  if (form.price < 0) return { error: 'El precio no puede ser negativo' }
  if (!form.unit?.trim()) return { error: 'La unidad es obligatoria' }

  // ── Moneda (037) ─────────────────────────────────────────────────────────
  //
  // Antes se forzaba `form.currency || 'EUR'`. Con las 16 referencias de índice
  // y porcentaje del catálogo eso guardaba «2,5 EUR» sobre el IPC, y desde esta
  // fase la restricción de la base lo rechaza directamente con un error de
  // PostgreSQL que no dice nada útil. Se decide aquí y se explica en castellano.
  const unidad = form.unit.trim()
  const monedaEscrita = form.currency?.trim() || ''
  let currency: string | null

  if (isNonMonetaryUnit(unidad)) {
    if (monedaEscrita) {
      return {
        error: `La unidad «${unidad}» no lleva moneda: un índice o un porcentaje no está en ${monedaEscrita}. Deja el campo de moneda vacío.`,
      }
    }
    currency = null
  } else {
    if (!monedaEscrita) return { error: `La moneda es obligatoria para la unidad «${unidad}»` }
    currency = monedaEscrita
  }

  const metadata: Record<string, unknown> = {}
  if (form.source_name?.trim()) metadata.source_name = form.source_name.trim()
  if (form.notes?.trim()) metadata.notes = form.notes.trim()

  // 034 — un alta manual sin lonja quedaría fuera del filtro de Market
  // Intelligence, que ahora agrupa por `product_price_records.lonja`. Se hereda
  // la de la ficha del producto, que es el valor por defecto de la referencia.
  // Si el producto tampoco la tiene, se guarda NULL: el índice único la trata
  // como cadena vacía, así que la clave natural sigue protegiendo.
  const { data: producto } = await supabase
    .from('products')
    .select('lonja')
    .eq('id', productId)
    .maybeSingle()

  const lonja = (producto?.lonja ?? '').trim() || null

  const { data, error } = await supabase
    .from('product_price_records')
    .insert({
      product_id:  productId,
      price:       form.price,
      unit:        unidad,
      currency,
      country:     form.country?.trim() || 'ES',
      region:      form.region?.trim() || null,
      recorded_at: form.recorded_at,
      lonja,
      min_price:   form.min_price ?? null,
      max_price:   form.max_price ?? null,
      avg_price:   form.avg_price ?? null,
      metadata:    Object.keys(metadata).length ? metadata : null,
    })
    .select('id')
    .single()

  if (error) return { error: error.message }
  return { id: data.id }
}

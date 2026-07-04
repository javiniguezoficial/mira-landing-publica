'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

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

// ── Guard ─────────────────────────────────────────────────────────────────────

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'platform_admin') redirect('/app/dashboard')
  return supabase
}

// ── Listar precios de un producto ─────────────────────────────────────────────

export async function getPricesByProduct(
  productId: string,
  limit = 100,
  offset = 0,
): Promise<{ records: PriceRecord[]; total: number }> {
  const supabase = await requireAdmin()

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
  const supabase = await requireAdmin()
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
  const supabase = await requireAdmin()
  const { data, error } = await supabase
    .from('product_price_records')
    .insert({
      product_id:  productId,
      price:       form.price,
      unit:        form.unit.trim(),
      currency:    form.currency.trim(),
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
  const supabase = await requireAdmin()
  const { error } = await supabase
    .from('product_price_records')
    .update({
      price:       form.price,
      unit:        form.unit.trim(),
      currency:    form.currency.trim(),
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
  const supabase = await requireAdmin()
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

export async function getPricingTree(): Promise<PricingHierarchy> {
  const supabase = await createClient()
  const [sm, cat, mk, pr, ppr] = await Promise.all([
    supabase.from('strategic_markets').select('id, name').eq('is_active', true).order('sort_order').order('name'),
    supabase.from('market_categories').select('id, name, strategic_market_id').eq('is_active', true).order('sort_order').order('name'),
    supabase.from('markets').select('id, name, category_id').eq('is_active', true).order('name'),
    supabase.from('products').select('id, name, unit, market_id, lonja, variedad, calibre, incoterm, tipo').eq('is_active', true).order('name'),
    // unit vive también en products, pero con otro significado (precio/medida del
    // producto, p.ej. "€/kg"). El filtro real se aplica sobre product_price_records.unit
    // (p.ej. "kg", "ton"), así que el facet de unidades debe salir de esta tabla.
    supabase.from('product_price_records').select('unit'),
  ])

  const rawProducts = (pr.data ?? []) as Array<{
    id: string; name: string; unit: string; market_id: string
    lonja: string | null; variedad: string | null; calibre: string | null; incoterm: string | null; tipo: string | null
  }>

  // Valores únicos, sin nulos/vacíos, ordenados (para los selects de filtro).
  const uniq = (vals: (string | null | undefined)[]): string[] =>
    Array.from(new Set(vals.map((v) => v?.trim()).filter((v): v is string => !!v)))
      .sort((a, b) => a.localeCompare(b, 'es'))

  const facets: PricingFacets = {
    lonjas:     uniq(rawProducts.map((p) => p.lonja)),
    variedades: uniq(rawProducts.map((p) => p.variedad)),
    calibres:   uniq(rawProducts.map((p) => p.calibre)),
    incoterms:  uniq(rawProducts.map((p) => p.incoterm)),
    tipos:      uniq(rawProducts.map((p) => p.tipo)),
    units:      uniq(((ppr.data ?? []) as Array<{ unit: string | null }>).map((r) => r.unit)),
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
  currency: string
  country: string
  region: string | null
  recorded_at: string
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

export async function listPriceRecordsFiltered(filters: PriceListFilters = {}): Promise<PriceListPage> {
  const supabase = await createClient()
  const limit = Math.min(filters.limit ?? 50, 500)
  const offset = filters.offset ?? 0

  let query = supabase
    .from('product_price_records')
    .select(`
      id, price, unit, currency, country, region, recorded_at, min_price, max_price, avg_price, volume,
      product:products!inner(
        id, name, slug, lonja, variedad, calibre, incoterm, tipo, market_id,
        market:markets!inner(
          id, name, category_id,
          category:market_categories!inner(
            id, name, strategic_market_id,
            strategic_market:strategic_markets(id, name)
          )
        )
      )
    `, { count: 'exact' })
    .order('recorded_at', { ascending: false })

  if (filters.product_id)          query = query.eq('product_id', filters.product_id)
  if (filters.market_id)           query = query.eq('product.market_id', filters.market_id)
  if (filters.category_id)         query = query.eq('product.market.category_id', filters.category_id)
  if (filters.strategic_market_id) query = query.eq('product.market.category.strategic_market_id', filters.strategic_market_id)
  if (filters.lonja)               query = query.eq('product.lonja', filters.lonja)
  if (filters.variedad)            query = query.eq('product.variedad', filters.variedad)
  if (filters.calibre)             query = query.eq('product.calibre', filters.calibre)
  if (filters.incoterm)            query = query.eq('product.incoterm', filters.incoterm)
  if (filters.tipo)                query = query.eq('product.tipo', filters.tipo)
  if (filters.country)             query = query.eq('country', filters.country)
  if (filters.currency)            query = query.eq('currency', filters.currency)
  if (filters.unit)                query = query.eq('unit', filters.unit)
  if (filters.region)              query = query.ilike('region', `%${filters.region}%`)
  if (filters.date_from)           query = query.gte('recorded_at', filters.date_from)
  if (filters.date_to)             query = query.lte('recorded_at', filters.date_to)

  query = query.range(offset, offset + limit - 1)

  const { data, error, count } = await query
  if (error || !data) return { rows: [], total: 0, hasMore: false }

  const rows: PriceListRow[] = (data as Array<Record<string, any>>).map((r) => {
    const product = Array.isArray(r.product) ? r.product[0] : r.product
    const market = product && (Array.isArray(product.market) ? product.market[0] : product.market)
    const category = market && (Array.isArray(market.category) ? market.category[0] : market.category)
    const strategic = category && (Array.isArray(category.strategic_market) ? category.strategic_market[0] : category.strategic_market)
    return {
      id: r.id,
      price: parseFloat(r.price),
      unit: r.unit,
      currency: r.currency,
      country: r.country,
      region: r.region ?? null,
      recorded_at: r.recorded_at,
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
  const supabase = await requireAdmin()

  if (!productId) return { error: 'Debes seleccionar una referencia / producto' }
  if (!form.recorded_at) return { error: 'La fecha es obligatoria' }
  if (form.price == null || Number.isNaN(form.price)) return { error: 'El precio es obligatorio y debe ser numérico' }
  if (form.price < 0) return { error: 'El precio no puede ser negativo' }
  if (!form.unit?.trim()) return { error: 'La unidad es obligatoria' }

  const metadata: Record<string, unknown> = {}
  if (form.source_name?.trim()) metadata.source_name = form.source_name.trim()
  if (form.notes?.trim()) metadata.notes = form.notes.trim()

  const { data, error } = await supabase
    .from('product_price_records')
    .insert({
      product_id:  productId,
      price:       form.price,
      unit:        form.unit.trim(),
      currency:    form.currency?.trim() || 'EUR',
      country:     form.country?.trim() || 'ES',
      region:      form.region?.trim() || null,
      recorded_at: form.recorded_at,
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

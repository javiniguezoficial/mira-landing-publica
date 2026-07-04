'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

// ── Tipos ─────────────────────────────────────────────────────────────────────

export interface Supplier {
  id: string
  name: string
  email: string | null
  phone: string | null
  website: string | null
  tax_id: string | null
  country: string
  region: string | null
  city: string | null
  postal_code: string | null
  address: string | null
  latitude: number | null
  longitude: number | null
  category: string | null      // legacy — texto libre, no ligado a Pricing
  market_id: string | null     // legacy — enlace a markets (Pricing)
  family: string | null        // legacy — texto libre
  subfamily: string | null     // legacy — texto libre
  produccion: string | null       // legacy — texto libre
  produccion_value: number | null // normalizado (P3) para filtro de rango
  produccion_unit: string | null  // unidad detectada (kg / TN)
  medida: string | null
  notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  market?: { id: string; name: string } | null   // legacy (Pricing)
  // Taxonomía propia de proveedores (P2), independiente de Pricing.
  // Opcionales: listSuppliersFiltered() usa la RPC search_suppliers, que
  // todavía no selecciona estas columnas (se añadirá en P2.4) — solo
  // getSupplier() (ficha individual) las trae siempre informadas.
  supplier_market_id?: string | null
  supplier_category_id?: string | null
  supplier_family_id?: string | null
  supplier_subfamily_id?: string | null
  supplier_market?: { id: string; name: string } | null
  supplier_category?: { id: string; name: string } | null
  supplier_family?: { id: string; name: string } | null
  supplier_subfamily?: { id: string; name: string } | null
}

export interface SupplierFormData {
  name: string
  email?: string
  phone?: string
  website?: string
  tax_id?: string
  country?: string
  region?: string
  city?: string
  postal_code?: string
  address?: string
  latitude?: number | null
  longitude?: number | null
  category?: string          // legacy
  market_id?: string | null  // legacy (Pricing) — no confundir con supplier_market_id
  family?: string             // legacy
  subfamily?: string          // legacy
  produccion?: string          // legacy texto libre
  produccion_value?: number | null
  produccion_unit?: string
  medida?: string
  notes?: string
  is_active?: boolean
  // Taxonomía propia de proveedores (P2)
  supplier_market_id?: string | null
  supplier_category_id?: string | null
  supplier_family_id?: string | null
  supplier_subfamily_id?: string | null
}

export type SupplierActionResult = { id: string } | { error: string }
export type SupplierVoidResult = { error: string } | void

// ── Validación ────────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const URL_RE   = /^https?:\/\/.+/

// Devuelve el mensaje de error como valor (no throw) — en producción Next.js
// redacta el mensaje de cualquier Error lanzado desde un Server Action.
function validateSupplierData(data: SupplierFormData): string | null {
  if (!data.name?.trim()) return 'El nombre del proveedor es obligatorio'

  if (data.email?.trim() && !EMAIL_RE.test(data.email.trim())) {
    return 'El email no tiene un formato válido'
  }

  if (data.website?.trim() && !URL_RE.test(data.website.trim())) {
    return 'La web debe empezar por http:// o https://'
  }

  if (data.latitude != null && isNaN(Number(data.latitude))) {
    return 'La latitud debe ser un número'
  }

  if (data.longitude != null && isNaN(Number(data.longitude))) {
    return 'La longitud debe ser un número'
  }

  return null
}

// Valida que category_id pertenezca a market_id, family_id a category_id, y
// subfamily_id a family_id. Si un nivel padre está vacío, sus hijos se
// devuelven como null (nunca se guarda un hijo sin su padre). No usa
// `market_id` de Pricing para nada de esto — es una jerarquía independiente.
async function resolveSupplierTaxonomy(
  supabase: Awaited<ReturnType<typeof createClient>>,
  data: SupplierFormData,
): Promise<
  | { supplier_market_id: string | null; supplier_category_id: string | null; supplier_family_id: string | null; supplier_subfamily_id: string | null }
  | { error: string }
> {
  const marketId = data.supplier_market_id || null
  let categoryId = data.supplier_category_id || null
  let familyId = data.supplier_family_id || null
  let subfamilyId = data.supplier_subfamily_id || null

  if (!marketId) {
    // Sin mercado, ningún hijo puede quedar asignado.
    return { supplier_market_id: null, supplier_category_id: null, supplier_family_id: null, supplier_subfamily_id: null }
  }

  if (categoryId) {
    const { data: cat } = await supabase
      .from('supplier_categories').select('supplier_market_id').eq('id', categoryId).single()
    if (!cat || cat.supplier_market_id !== marketId) {
      return { error: 'La categoría seleccionada no pertenece al mercado indicado' }
    }
  } else {
    familyId = null
    subfamilyId = null
  }

  if (familyId) {
    const { data: fam } = await supabase
      .from('supplier_families').select('supplier_category_id').eq('id', familyId).single()
    if (!fam || fam.supplier_category_id !== categoryId) {
      return { error: 'La familia seleccionada no pertenece a la categoría indicada' }
    }
  } else {
    subfamilyId = null
  }

  if (subfamilyId) {
    const { data: sub } = await supabase
      .from('supplier_subfamilies').select('supplier_family_id').eq('id', subfamilyId).single()
    if (!sub || sub.supplier_family_id !== familyId) {
      return { error: 'La subfamilia seleccionada no pertenece a la familia indicada' }
    }
  }

  return { supplier_market_id: marketId, supplier_category_id: categoryId, supplier_family_id: familyId, supplier_subfamily_id: subfamilyId }
}

// ── Guard: solo platform_admin ────────────────────────────────────────────────

async function requireAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'platform_admin') throw new Error('No tienes permiso de administrador')
  return user
}

// ── Admin: crear proveedor ────────────────────────────────────────────────────

export async function createSupplier(data: SupplierFormData): Promise<SupplierActionResult> {
  const basicError = validateSupplierData(data)
  if (basicError) return { error: basicError }

  const supabase = await createClient()
  await requireAdmin(supabase)

  const taxonomy = await resolveSupplierTaxonomy(supabase, data)
  if ('error' in taxonomy) return taxonomy

  const { data: row, error } = await supabase
    .from('suppliers')
    .insert({
      name:        data.name.trim(),
      email:       data.email?.trim() || null,
      phone:       data.phone?.trim() || null,
      website:     data.website?.trim() || null,
      tax_id:      data.tax_id?.trim() || null,
      country:     data.country?.trim() || 'ES',
      region:      data.region?.trim() || null,
      city:        data.city?.trim() || null,
      postal_code: data.postal_code?.trim() || null,
      address:     data.address?.trim() || null,
      latitude:    data.latitude ?? null,
      longitude:   data.longitude ?? null,
      category:    data.category?.trim() || null,
      market_id:   data.market_id || null,
      family:      data.family?.trim() || null,
      subfamily:   data.subfamily?.trim() || null,
      produccion:  data.produccion?.trim() || null,
      produccion_value: data.produccion_value ?? null,
      produccion_unit:  data.produccion_unit?.trim() || null,
      medida:      data.medida?.trim() || null,
      notes:       data.notes?.trim() || null,
      is_active:   data.is_active ?? true,
      ...taxonomy,
    })
    .select('id')
    .single()

  if (error) return { error: error.message }
  return { id: row.id }
}

// ── Admin: actualizar proveedor ───────────────────────────────────────────────

export async function updateSupplier(id: string, data: SupplierFormData): Promise<SupplierVoidResult> {
  const basicError = validateSupplierData(data)
  if (basicError) return { error: basicError }

  const supabase = await createClient()
  await requireAdmin(supabase)

  const taxonomy = await resolveSupplierTaxonomy(supabase, data)
  if ('error' in taxonomy) return taxonomy

  const { error } = await supabase
    .from('suppliers')
    .update({
      name:        data.name.trim(),
      email:       data.email?.trim() || null,
      phone:       data.phone?.trim() || null,
      website:     data.website?.trim() || null,
      tax_id:      data.tax_id?.trim() || null,
      country:     data.country?.trim() || 'ES',
      region:      data.region?.trim() || null,
      city:        data.city?.trim() || null,
      postal_code: data.postal_code?.trim() || null,
      address:     data.address?.trim() || null,
      latitude:    data.latitude ?? null,
      longitude:   data.longitude ?? null,
      category:    data.category?.trim() || null,
      market_id:   data.market_id || null,
      family:      data.family?.trim() || null,
      subfamily:   data.subfamily?.trim() || null,
      produccion:  data.produccion?.trim() || null,
      produccion_value: data.produccion_value ?? null,
      produccion_unit:  data.produccion_unit?.trim() || null,
      medida:      data.medida?.trim() || null,
      notes:       data.notes?.trim() || null,
      is_active:   data.is_active ?? true,
      ...taxonomy,
    })
    .eq('id', id)

  if (error) return { error: error.message }
}

// ── Admin: activar/desactivar ─────────────────────────────────────────────────

export async function toggleSupplierActive(id: string, is_active: boolean): Promise<void> {
  const supabase = await createClient()
  await requireAdmin(supabase)

  const { error } = await supabase
    .from('suppliers')
    .update({ is_active })
    .eq('id', id)

  if (error) throw new Error(error.message)
}

// ── Admin: eliminar proveedor ──────────────────────────────────────────────────
// Borrado real. La única FK entrante (rfq_responses.supplier_id) es ON DELETE
// SET NULL, así que no borra RFQs ni respuestas: el snapshot del proveedor en
// la respuesta se conserva y solo se anula el enlace. Si una futura FK bloquea
// el borrado (23503), se devuelve un mensaje amigable en vez de romper.
export async function deleteSupplier(id: string): Promise<SupplierVoidResult> {
  const supabase = await createClient()
  await requireAdmin(supabase)

  const { error } = await supabase.from('suppliers').delete().eq('id', id)

  if (error) {
    if (error.code === '23503') {
      return { error: 'No se puede eliminar porque tiene datos asociados. Puedes dejarlo inactivo.' }
    }
    return { error: error.message }
  }
}

// ── Queries ───────────────────────────────────────────────────────────────────

// Columnas explícitas + join a markets — evita select('*') y trae market.name
// Usada SOLO por getSupplier() (ficha individual) — listSuppliersFiltered()
// usa la RPC search_suppliers, que no se toca en esta fase.
const SUPPLIER_SELECT =
  'id, name, email, phone, website, tax_id, country, region, city, postal_code, ' +
  'address, latitude, longitude, category, market_id, family, subfamily, ' +
  'produccion, produccion_value, produccion_unit, medida, notes, is_active, created_at, updated_at, ' +
  'market:markets(id, name), ' +
  'supplier_market_id, supplier_category_id, supplier_family_id, supplier_subfamily_id, ' +
  'supplier_market:supplier_markets(id, name), ' +
  'supplier_category:supplier_categories(id, name), ' +
  'supplier_family:supplier_families(id, name), ' +
  'supplier_subfamily:supplier_subfamilies(id, name)'

export interface SupplierFilters {
  search?: string
  market_id?: string       // legacy (Pricing)
  family?: string          // legacy (texto libre)
  subfamily?: string       // legacy (texto libre)
  region?: string
  city?: string
  category?: string        // legacy (texto libre)
  produccion?: string      // legacy (texto libre, ilike)
  produccion_min?: number  // filtro rango sobre produccion_value (P3)
  produccion_max?: number
  medida?: string
  country?: string
  // Taxonomía propia de proveedores (P2.4)
  supplier_market_id?: string
  supplier_category_id?: string
  supplier_family_id?: string
  supplier_subfamily_id?: string
  is_active?: boolean
  limit?: number
  offset?: number
}

export interface SuppliersPage {
  suppliers: Supplier[]
  total: number
  hasMore: boolean
}

// Búsqueda server-side vía la función RPC `search_suppliers` (migraciones
// 012 → 016). Normaliza con unaccent(lower(...)) → filtros case/accent-
// insensitive. Es SECURITY INVOKER, respeta la RLS de `suppliers`. Devuelve
// `total_count` (count(*) OVER()) para paginación. Desde 016 filtra por país
// y por la taxonomía propia de proveedores dentro de la propia función (ya no
// hay workaround de país en JS).
export async function listSuppliersFiltered(filters: SupplierFilters = {}): Promise<SuppliersPage> {
  const supabase = await createClient()
  const limit = Math.min(filters.limit ?? 200, 1000)
  const offset = filters.offset ?? 0

  const { data, error } = await supabase.rpc('search_suppliers', {
    p_search:     filters.search?.trim() || null,
    p_market_id:  filters.market_id || null,
    p_region:     filters.region?.trim() || null,
    p_city:       filters.city?.trim() || null,
    p_family:     filters.family?.trim() || null,
    p_subfamily:  filters.subfamily?.trim() || null,
    p_category:   filters.category?.trim() || null,
    p_produccion: filters.produccion?.trim() || null,
    p_medida:     filters.medida?.trim() || null,
    p_is_active:  filters.is_active ?? null,
    p_limit:      limit,
    p_offset:     offset,
    p_country:    filters.country?.trim() || null,
    p_supplier_market_id:    filters.supplier_market_id || null,
    p_supplier_category_id:  filters.supplier_category_id || null,
    p_supplier_family_id:    filters.supplier_family_id || null,
    p_supplier_subfamily_id: filters.supplier_subfamily_id || null,
    p_produccion_min:        filters.produccion_min ?? null,
    p_produccion_max:        filters.produccion_max ?? null,
  })

  if (error || !data) return { suppliers: [], total: 0, hasMore: false }

  const rows = data as Array<Record<string, unknown>>
  const total = rows.length > 0 ? Number(rows[0].total_count) : 0

  const suppliers: Supplier[] = rows.map((r) => ({
    id:          r.id as string,
    name:        r.name as string,
    email:       (r.email as string | null) ?? null,
    phone:       (r.phone as string | null) ?? null,
    website:     (r.website as string | null) ?? null,
    tax_id:      (r.tax_id as string | null) ?? null,
    country:     r.country as string,
    region:      (r.region as string | null) ?? null,
    city:        (r.city as string | null) ?? null,
    postal_code: (r.postal_code as string | null) ?? null,
    address:     (r.address as string | null) ?? null,
    latitude:    (r.latitude as number | null) ?? null,
    longitude:   (r.longitude as number | null) ?? null,
    category:    (r.category as string | null) ?? null,
    market_id:   (r.market_id as string | null) ?? null,
    family:      (r.family as string | null) ?? null,
    subfamily:   (r.subfamily as string | null) ?? null,
    produccion:  (r.produccion as string | null) ?? null,
    produccion_value: r.produccion_value != null ? Number(r.produccion_value) : null,
    produccion_unit:  (r.produccion_unit as string | null) ?? null,
    medida:      (r.medida as string | null) ?? null,
    notes:       (r.notes as string | null) ?? null,
    is_active:   r.is_active as boolean,
    created_at:  r.created_at as string,
    updated_at:  r.updated_at as string,
    market:      r.market_id ? { id: r.market_id as string, name: r.market_name as string } : null,
    supplier_market_id:    (r.supplier_market_id as string | null) ?? null,
    supplier_category_id:  (r.supplier_category_id as string | null) ?? null,
    supplier_family_id:    (r.supplier_family_id as string | null) ?? null,
    supplier_subfamily_id: (r.supplier_subfamily_id as string | null) ?? null,
    supplier_market:    r.supplier_market_id ? { id: r.supplier_market_id as string, name: r.supplier_market_name as string } : null,
    supplier_category:  r.supplier_category_id ? { id: r.supplier_category_id as string, name: r.supplier_category_name as string } : null,
    supplier_family:    r.supplier_family_id ? { id: r.supplier_family_id as string, name: r.supplier_family_name as string } : null,
    supplier_subfamily: r.supplier_subfamily_id ? { id: r.supplier_subfamily_id as string, name: r.supplier_subfamily_name as string } : null,
  }))

  return { suppliers, total, hasMore: total > offset + limit }
}

export async function listSuppliers(onlyActive?: boolean): Promise<Supplier[]> {
  const { suppliers } = await listSuppliersFiltered({
    is_active: onlyActive ? true : undefined,
    limit: 1000,
  })
  return suppliers
}

export async function getSupplier(id: string): Promise<Supplier | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('suppliers')
    .select(SUPPLIER_SELECT)
    .eq('id', id)
    .single()

  if (error || !data) return null
  return data as unknown as Supplier
}

// ── Opciones de filtro (País / Provincia) ─────────────────────────────────────

export interface SupplierFilterOptions {
  countries: string[]
  regions: string[]
}

// Valores reales distintos de país/provincia para poblar los <select> de
// filtros. Consulta ligera (solo 2 columnas, tope 5000 filas) — mucho más
// barata que listar proveedores completos, pero sigue leyendo N filas para
// deduplicar en JS porque Postgres no expone `DISTINCT` vía PostgREST select
// directo. Para volumen muy grande, mover a una función RPC dedicada
// (SELECT DISTINCT) en una fase posterior.
export async function getSupplierFilterOptions(onlyActive = true): Promise<SupplierFilterOptions> {
  const supabase = await createClient()

  let query = supabase.from('suppliers').select('country, region').limit(5000)
  if (onlyActive) query = query.eq('is_active', true)

  const { data, error } = await query
  if (error || !data) return { countries: [], regions: [] }

  const countries = Array.from(new Set(data.map((r) => r.country).filter(Boolean))).sort()
  const regions = Array.from(new Set(data.map((r) => r.region).filter(Boolean))) as string[]
  regions.sort()

  return { countries, regions }
}

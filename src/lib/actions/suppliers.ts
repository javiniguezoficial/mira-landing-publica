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
  category: string | null
  market_id: string | null
  family: string | null
  subfamily: string | null
  produccion: string | null
  medida: string | null
  notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string
  market?: { id: string; name: string } | null
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
  category?: string
  market_id?: string | null
  family?: string
  subfamily?: string
  produccion?: string
  medida?: string
  notes?: string
  is_active?: boolean
}

// ── Validación ────────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const URL_RE   = /^https?:\/\/.+/

function validateSupplierData(data: SupplierFormData) {
  if (!data.name?.trim()) throw new Error('El nombre del proveedor es obligatorio')

  if (data.email?.trim() && !EMAIL_RE.test(data.email.trim())) {
    throw new Error('El email no tiene un formato válido')
  }

  if (data.website?.trim() && !URL_RE.test(data.website.trim())) {
    throw new Error('La web debe empezar por http:// o https://')
  }

  if (data.latitude != null && isNaN(Number(data.latitude))) {
    throw new Error('La latitud debe ser un número')
  }

  if (data.longitude != null && isNaN(Number(data.longitude))) {
    throw new Error('La longitud debe ser un número')
  }
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

export async function createSupplier(data: SupplierFormData): Promise<{ id: string }> {
  validateSupplierData(data)

  const supabase = await createClient()
  await requireAdmin(supabase)

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
      medida:      data.medida?.trim() || null,
      notes:       data.notes?.trim() || null,
      is_active:   data.is_active ?? true,
    })
    .select('id')
    .single()

  if (error) throw new Error(error.message)
  return { id: row.id }
}

// ── Admin: actualizar proveedor ───────────────────────────────────────────────

export async function updateSupplier(id: string, data: SupplierFormData): Promise<void> {
  validateSupplierData(data)

  const supabase = await createClient()
  await requireAdmin(supabase)

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
      medida:      data.medida?.trim() || null,
      notes:       data.notes?.trim() || null,
      is_active:   data.is_active ?? true,
    })
    .eq('id', id)

  if (error) throw new Error(error.message)
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

// ── Queries ───────────────────────────────────────────────────────────────────

// Columnas explícitas + join a markets — evita select('*') y trae market.name
const SUPPLIER_SELECT =
  'id, name, email, phone, website, tax_id, country, region, city, postal_code, ' +
  'address, latitude, longitude, category, market_id, family, subfamily, ' +
  'produccion, medida, notes, is_active, created_at, updated_at, ' +
  'market:markets(id, name)'

export interface SupplierFilters {
  search?: string
  market_id?: string
  family?: string
  subfamily?: string
  region?: string
  city?: string
  category?: string
  produccion?: string
  medida?: string
  is_active?: boolean
  limit?: number
  offset?: number
}

export interface SuppliersPage {
  suppliers: Supplier[]
  total: number
  hasMore: boolean
}

// Búsqueda server-side vía la función RPC `search_suppliers` (migración 012).
// La RPC normaliza con unaccent(lower(...)) en columna e input → filtros
// case-insensitive Y sin acentos. Es SECURITY INVOKER, así que respeta la RLS
// existente de `suppliers`. Devuelve `total_count` (count(*) OVER()) para la
// paginación, manteniendo limit/offset.
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
    medida:      (r.medida as string | null) ?? null,
    notes:       (r.notes as string | null) ?? null,
    is_active:   r.is_active as boolean,
    created_at:  r.created_at as string,
    updated_at:  r.updated_at as string,
    market:      r.market_id ? { id: r.market_id as string, name: r.market_name as string } : null,
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

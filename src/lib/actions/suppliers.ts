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

export async function listSuppliersFiltered(filters: SupplierFilters = {}): Promise<SuppliersPage> {
  const supabase = await createClient()
  const limit = Math.min(filters.limit ?? 200, 1000)
  const offset = filters.offset ?? 0

  let query = supabase
    .from('suppliers')
    .select(SUPPLIER_SELECT, { count: 'exact' })
    .order('name')

  if (filters.is_active !== undefined) query = query.eq('is_active', filters.is_active)
  if (filters.search?.trim())          query = query.ilike('name', `%${filters.search.trim()}%`)
  if (filters.market_id)               query = query.eq('market_id', filters.market_id)
  if (filters.family)                  query = query.eq('family', filters.family)
  if (filters.subfamily)               query = query.eq('subfamily', filters.subfamily)
  if (filters.region)                  query = query.eq('region', filters.region)
  if (filters.city)                    query = query.eq('city', filters.city)
  if (filters.category)                query = query.eq('category', filters.category)
  if (filters.medida)                  query = query.eq('medida', filters.medida)
  if (filters.produccion?.trim())      query = query.ilike('produccion', `%${filters.produccion.trim()}%`)

  query = query.range(offset, offset + limit - 1)

  const { data, error, count } = await query
  if (error) return { suppliers: [], total: 0, hasMore: false }
  return {
    suppliers: (data ?? []) as unknown as Supplier[],
    total: count ?? 0,
    hasMore: (count ?? 0) > offset + limit,
  }
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

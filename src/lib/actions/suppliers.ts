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
  address: string | null
  latitude: number | null
  longitude: number | null
  category: string | null
  notes: string | null
  is_active: boolean
  created_at: string
  updated_at: string
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
  address?: string
  latitude?: number | null
  longitude?: number | null
  category?: string
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
      name:      data.name.trim(),
      email:     data.email?.trim() || null,
      phone:     data.phone?.trim() || null,
      website:   data.website?.trim() || null,
      tax_id:    data.tax_id?.trim() || null,
      country:   data.country?.trim() || 'ES',
      region:    data.region?.trim() || null,
      city:      data.city?.trim() || null,
      address:   data.address?.trim() || null,
      latitude:  data.latitude ?? null,
      longitude: data.longitude ?? null,
      category:  data.category?.trim() || null,
      notes:     data.notes?.trim() || null,
      is_active: data.is_active ?? true,
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
      name:      data.name.trim(),
      email:     data.email?.trim() || null,
      phone:     data.phone?.trim() || null,
      website:   data.website?.trim() || null,
      tax_id:    data.tax_id?.trim() || null,
      country:   data.country?.trim() || 'ES',
      region:    data.region?.trim() || null,
      city:      data.city?.trim() || null,
      address:   data.address?.trim() || null,
      latitude:  data.latitude ?? null,
      longitude: data.longitude ?? null,
      category:  data.category?.trim() || null,
      notes:     data.notes?.trim() || null,
      is_active: data.is_active ?? true,
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

export async function listSuppliers(onlyActive?: boolean): Promise<Supplier[]> {
  const supabase = await createClient()

  let query = supabase
    .from('suppliers')
    .select('*')
    .order('name')

  if (onlyActive) query = query.eq('is_active', true)

  const { data, error } = await query
  if (error) return []
  return (data ?? []) as Supplier[]
}

export async function getSupplier(id: string): Promise<Supplier | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('suppliers')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !data) return null
  return data as Supplier
}

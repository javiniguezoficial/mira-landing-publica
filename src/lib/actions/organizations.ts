'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

// ── Tipos ────────────────────────────────────────────────────────────────────

export type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'cancelled' | 'expired'
export type OrgType = 'fisica' | 'juridica'

export interface Organization {
  id: string
  name: string
  type: OrgType | null
  cif_nif: string | null
  sector: string | null
  annual_revenue_range: string | null
  employee_count_range: string | null
  city: string | null
  country: string
  phone: string | null
  email: string | null
  website: string | null
  plan_id: string | null
  subscription_status: SubscriptionStatus
  subscription_start: string | null
  subscription_end: string | null
  created_at: string
  updated_at: string
  plan?: { id: string; name: string; slug: string } | null
}

export interface OrgFormData {
  name: string
  type?: OrgType
  cif_nif?: string
  sector?: string
  annual_revenue_range?: string
  employee_count_range?: string
  city?: string
  country?: string
  phone?: string
  email?: string
  website?: string
  plan_id?: string
  subscription_status?: SubscriptionStatus
}

// ── Guard: solo platform_admin ────────────────────────────────────────────────

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'platform_admin') redirect('/app/dashboard')
  return supabase
}

// ── Listado ───────────────────────────────────────────────────────────────────

export async function getOrganizations(): Promise<Organization[]> {
  const supabase = await requireAdmin()

  const { data, error } = await supabase
    .from('organizations')
    .select(`
      *,
      plan:plans(id, name, slug)
    `)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as Organization[]
}

// ── Detalle ───────────────────────────────────────────────────────────────────

export async function getOrganizationById(id: string): Promise<Organization | null> {
  const supabase = await requireAdmin()

  const { data, error } = await supabase
    .from('organizations')
    .select(`
      *,
      plan:plans(id, name, slug)
    `)
    .eq('id', id)
    .single()

  if (error) return null
  return data as Organization
}

// ── Obtener planes disponibles ────────────────────────────────────────────────

export async function getPlans() {
  const supabase = await requireAdmin()

  const { data } = await supabase
    .from('plans')
    .select('id, name, slug')
    .eq('is_active', true)
    .order('price_monthly', { ascending: true })

  return data ?? []
}

// ── Crear organización ────────────────────────────────────────────────────────

export async function createOrganization(formData: OrgFormData): Promise<{ id: string }> {
  const supabase = await requireAdmin()

  // Si no se selecciona plan, usar Starter por defecto
  let planId = formData.plan_id || null
  if (!planId) {
    const { data: starter } = await supabase
      .from('plans')
      .select('id')
      .eq('slug', 'starter')
      .single()
    planId = starter?.id ?? null
  }

  const { data, error } = await supabase
    .from('organizations')
    .insert({
      name: formData.name.trim(),
      type: formData.type ?? null,
      cif_nif: formData.cif_nif?.trim() || null,
      sector: formData.sector?.trim() || null,
      annual_revenue_range: formData.annual_revenue_range || null,
      employee_count_range: formData.employee_count_range || null,
      city: formData.city?.trim() || null,
      country: formData.country?.trim() || 'ES',
      phone: formData.phone?.trim() || null,
      email: formData.email?.trim() || null,
      website: formData.website?.trim() || null,
      plan_id: planId,
      subscription_status: formData.subscription_status ?? 'trial',
    })
    .select('id')
    .single()

  if (error) throw new Error(error.message)
  return { id: data.id }
}

// ── Editar organización ───────────────────────────────────────────────────────

export async function updateOrganization(id: string, formData: OrgFormData): Promise<void> {
  const supabase = await requireAdmin()

  const { error } = await supabase
    .from('organizations')
    .update({
      name: formData.name.trim(),
      type: formData.type ?? null,
      cif_nif: formData.cif_nif?.trim() || null,
      sector: formData.sector?.trim() || null,
      annual_revenue_range: formData.annual_revenue_range || null,
      employee_count_range: formData.employee_count_range || null,
      city: formData.city?.trim() || null,
      country: formData.country?.trim() || 'ES',
      phone: formData.phone?.trim() || null,
      email: formData.email?.trim() || null,
      website: formData.website?.trim() || null,
      plan_id: formData.plan_id || null,
      subscription_status: formData.subscription_status ?? 'trial',
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) throw new Error(error.message)
}

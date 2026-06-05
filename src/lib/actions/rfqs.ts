'use server'

import { createClient } from '@/lib/supabase/server'
import { getActiveOrg } from '@/lib/queries/user-org'
import { redirect } from 'next/navigation'

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type RfqStatus = 'draft' | 'open' | 'closed' | 'awarded' | 'cancelled'

export interface Rfq {
  id: string
  organization_id: string
  created_by: string
  product_id: string
  quantity: number
  unit: string
  deadline: string
  country: string
  region: string | null
  notes: string | null
  conditions: string | null
  status: RfqStatus
  created_at: string
  updated_at: string
  product?: {
    id: string
    name: string
    slug: string
    unit: string
    market: { id: string; name: string; slug: string } | null
  } | null
  organization?: { id: string; name: string } | null
}

export interface RfqFormData {
  product_id: string
  quantity: number
  unit: string
  deadline: string
  country: string
  region?: string
  notes?: string
  conditions?: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function today(): string {
  return new Date().toISOString().split('T')[0]
}

async function resolveActiveProductOrThrow(
  supabase: Awaited<ReturnType<typeof createClient>>,
  product_id: string
) {
  const { data, error } = await supabase
    .from('products')
    .select('id, name, unit, is_active, market:markets(id, is_active, category:market_categories(id, is_active))')
    .eq('id', product_id)
    .single()

  if (error || !data) throw new Error('Producto no encontrado')

  const market = Array.isArray(data.market) ? data.market[0] : data.market
  const category = market && (Array.isArray((market as any).category) ? (market as any).category[0] : (market as any).category)

  if (!data.is_active) throw new Error('El producto no está activo')
  if (!market?.is_active) throw new Error('El mercado del producto no está activo')
  if (!category?.is_active) throw new Error('La categoría del mercado no está activa')

  return data
}

function validateFormData(data: RfqFormData) {
  if (!data.product_id) throw new Error('Debes seleccionar un producto')
  if (!data.quantity || data.quantity <= 0) throw new Error('La cantidad debe ser mayor que 0')
  if (!data.unit?.trim()) throw new Error('La unidad es obligatoria')
  if (!data.deadline) throw new Error('La fecha límite es obligatoria')
  if (data.deadline < today()) throw new Error('La fecha límite no puede ser anterior a hoy')
  if (!data.country?.trim()) throw new Error('El país es obligatorio')
}

// ── Cliente: crear borrador ───────────────────────────────────────────────────

export async function createDraftRfq(formData: RfqFormData): Promise<{ id: string }> {
  validateFormData(formData)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const orgResult = await getActiveOrg()
  if (orgResult.status !== 'ok') throw new Error('No tienes organización activa')
  const orgId = orgResult.org.id

  await resolveActiveProductOrThrow(supabase, formData.product_id)

  const { data, error } = await supabase
    .from('rfqs')
    .insert({
      organization_id: orgId,
      created_by: user.id,
      product_id: formData.product_id,
      quantity: formData.quantity,
      unit: formData.unit.trim(),
      deadline: formData.deadline,
      country: formData.country.trim(),
      region: formData.region?.trim() || null,
      notes: formData.notes?.trim() || null,
      conditions: formData.conditions?.trim() || null,
      status: 'draft',
    })
    .select('id')
    .single()

  if (error) throw new Error(error.message)
  return { id: data.id }
}

// ── Cliente: actualizar borrador (solo campos de contenido) ──────────────────

export async function updateDraftRfq(rfqId: string, formData: RfqFormData): Promise<void> {
  validateFormData(formData)

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Verificar que la RFQ pertenece al usuario y está en draft
  const { data: existing, error: fetchErr } = await supabase
    .from('rfqs')
    .select('id, organization_id, created_by, status')
    .eq('id', rfqId)
    .single()

  if (fetchErr || !existing) throw new Error('RFQ no encontrada')
  if (existing.created_by !== user.id) throw new Error('No tienes permiso para editar esta RFQ')
  if (existing.status !== 'draft') throw new Error('Solo se pueden editar RFQs en borrador')

  // Validar producto activo si se cambia
  await resolveActiveProductOrThrow(supabase, formData.product_id)

  // Actualizar solo campos de contenido — organization_id y created_by no se tocan
  const { error } = await supabase
    .from('rfqs')
    .update({
      product_id: formData.product_id,
      quantity: formData.quantity,
      unit: formData.unit.trim(),
      deadline: formData.deadline,
      country: formData.country.trim(),
      region: formData.region?.trim() || null,
      notes: formData.notes?.trim() || null,
      conditions: formData.conditions?.trim() || null,
    })
    .eq('id', rfqId)
    .eq('created_by', user.id)
    .eq('status', 'draft')

  if (error) throw new Error(error.message)
}

// ── Cliente: publicar (draft → open) ─────────────────────────────────────────

export async function publishRfq(rfqId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: existing, error: fetchErr } = await supabase
    .from('rfqs')
    .select('id, created_by, status')
    .eq('id', rfqId)
    .single()

  if (fetchErr || !existing) throw new Error('RFQ no encontrada')
  if (existing.created_by !== user.id) throw new Error('No tienes permiso sobre esta RFQ')
  if (existing.status !== 'draft') throw new Error('Solo se pueden publicar RFQs en borrador')

  const { error } = await supabase
    .from('rfqs')
    .update({ status: 'open' })
    .eq('id', rfqId)
    .eq('created_by', user.id)
    .eq('status', 'draft')

  if (error) throw new Error(error.message)
}

// ── Cliente: cancelar (draft → cancelled) ────────────────────────────────────

export async function cancelRfq(rfqId: string): Promise<void> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: existing, error: fetchErr } = await supabase
    .from('rfqs')
    .select('id, created_by, status')
    .eq('id', rfqId)
    .single()

  if (fetchErr || !existing) throw new Error('RFQ no encontrada')
  if (existing.created_by !== user.id) throw new Error('No tienes permiso sobre esta RFQ')
  if (existing.status !== 'draft') throw new Error('Solo se pueden cancelar RFQs en borrador')

  const { error } = await supabase
    .from('rfqs')
    .update({ status: 'cancelled' })
    .eq('id', rfqId)
    .eq('created_by', user.id)
    .eq('status', 'draft')

  if (error) throw new Error(error.message)
}

// ── Admin: cambiar cualquier estado ──────────────────────────────────────────

const VALID_ADMIN_STATUSES: RfqStatus[] = ['draft', 'open', 'closed', 'awarded', 'cancelled']

export async function adminUpdateRfqStatus(rfqId: string, status: RfqStatus): Promise<void> {
  if (!VALID_ADMIN_STATUSES.includes(status)) throw new Error('Estado no válido')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Guard: solo platform_admin
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'platform_admin') throw new Error('No tienes permiso de administrador')

  const { error } = await supabase
    .from('rfqs')
    .update({ status })
    .eq('id', rfqId)

  if (error) throw new Error(error.message)
}

// ── Queries ───────────────────────────────────────────────────────────────────

export async function listMyRfqs(): Promise<Rfq[]> {
  const supabase = await createClient()
  const orgResult = await getActiveOrg()
  if (orgResult.status !== 'ok') return []

  const { data, error } = await supabase
    .from('rfqs')
    .select(`
      id, organization_id, created_by, product_id, quantity, unit,
      deadline, country, region, notes, conditions, status, created_at, updated_at,
      product:products(id, name, slug, unit, market:markets(id, name, slug))
    `)
    .eq('organization_id', orgResult.org.id)
    .order('created_at', { ascending: false })

  if (error) return []
  return (data ?? []) as unknown as Rfq[]
}

export async function listAllRfqs(statusFilter?: RfqStatus): Promise<Rfq[]> {
  const supabase = await createClient()

  let query = supabase
    .from('rfqs')
    .select(`
      id, organization_id, created_by, product_id, quantity, unit,
      deadline, country, region, notes, conditions, status, created_at, updated_at,
      product:products(id, name, slug, unit, market:markets(id, name, slug)),
      organization:organizations(id, name)
    `)
    .order('created_at', { ascending: false })

  if (statusFilter) query = query.eq('status', statusFilter)

  const { data, error } = await query
  if (error) return []
  return (data ?? []) as unknown as Rfq[]
}

export async function getRfq(rfqId: string): Promise<Rfq | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('rfqs')
    .select(`
      id, organization_id, created_by, product_id, quantity, unit,
      deadline, country, region, notes, conditions, status, created_at, updated_at,
      product:products(id, name, slug, unit, market:markets(id, name, slug)),
      organization:organizations(id, name)
    `)
    .eq('id', rfqId)
    .single()

  if (error || !data) return null
  return data as unknown as Rfq
}

// ── Productos activos para el selector ───────────────────────────────────────

export interface ProductOption {
  id: string
  name: string
  slug: string
  unit: string
  market_name: string
}

export async function listActiveProducts(): Promise<ProductOption[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('products')
    .select(`
      id, name, slug, unit,
      market:markets!inner(id, name, is_active,
        category:market_categories!inner(id, is_active)
      )
    `)
    .eq('is_active', true)
    .eq('markets.is_active', true)
    .eq('markets.market_categories.is_active', true)
    .order('name')

  if (error || !data) return []

  return data.map((p: any) => {
    const market = Array.isArray(p.market) ? p.market[0] : p.market
    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      unit: p.unit,
      market_name: market?.name ?? '',
    }
  })
}

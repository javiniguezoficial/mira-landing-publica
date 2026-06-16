'use server'

import { createClient } from '@/lib/supabase/server'
import { getActiveOrg } from '@/lib/queries/user-org'
import { redirect } from 'next/navigation'

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type RfqStatus = 'draft' | 'open' | 'closed' | 'awarded' | 'cancelled'
export type RfqKind = 'product' | 'service'
export type RfqCriticality = 'alto' | 'medio' | 'bajo'

// Condición personalizada dinámica. Se guarda como dato en custom_conditions
// (JSONB). NUNCA se interpreta ni ejecuta su contenido — solo se renderiza.
export interface RfqCustomCondition {
  label: string
  value: string
  type: string
}

export interface Rfq {
  id: string
  organization_id: string
  created_by: string
  rfq_kind: RfqKind
  product_id: string | null
  service_name: string | null
  service_description: string | null
  quantity: number | null   // legacy/compatibilidad
  unit: string | null       // legacy/compatibilidad
  opening_date: string | null
  deadline: string
  award_date: string | null
  supply_start_date: string | null
  country: string
  region: string | null
  estimated_volume: number | null
  purchase_frequency: string | null
  delivery_location: string | null
  incoterm: string | null
  target_price: number | null
  certifications: string[] | null
  sustainability_policy: string | null
  unit_format: string | null
  criticality: RfqCriticality | null
  lead_time: string | null
  min_order: number | null
  sale_currency: string
  internal_code: string | null
  payment_method: string | null
  technical_sheet_url: string | null
  technical_sheet_notes: string | null
  custom_conditions: RfqCustomCondition[]
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
  rfq_kind: RfqKind
  product_id?: string | null
  service_name?: string
  service_description?: string
  opening_date: string
  deadline: string
  award_date: string
  supply_start_date: string
  country: string
  region?: string
  estimated_volume?: number | null
  purchase_frequency?: string
  delivery_location?: string
  incoterm?: string
  target_price?: number | null
  certifications?: string[]
  sustainability_policy?: string
  unit_format: string
  criticality?: RfqCriticality | ''
  lead_time: string
  min_order?: number | null
  sale_currency: string
  internal_code?: string
  payment_method?: string
  technical_sheet_url?: string
  technical_sheet_notes?: string
  custom_conditions?: RfqCustomCondition[]
  notes?: string
  conditions?: string
}

// Lista de columnas reutilizable para los SELECT (evita repetición).
const RFQ_COLUMNS = `
  id, organization_id, created_by, rfq_kind, product_id, service_name, service_description,
  quantity, unit, opening_date, deadline, award_date, supply_start_date,
  country, region, estimated_volume, purchase_frequency, delivery_location, incoterm,
  target_price, certifications, sustainability_policy, unit_format, criticality, lead_time,
  min_order, sale_currency, internal_code, payment_method, technical_sheet_url,
  technical_sheet_notes, custom_conditions, notes, conditions, status, created_at, updated_at
`

// ── Helpers ───────────────────────────────────────────────────────────────────

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
  // Tipo de RFQ
  if (data.rfq_kind !== 'product' && data.rfq_kind !== 'service') {
    throw new Error('Debes indicar si la RFQ es de producto o de servicio')
  }
  if (data.rfq_kind === 'product') {
    if (!data.product_id) throw new Error('Debes seleccionar un producto')
  } else {
    if (!data.service_name?.trim()) throw new Error('El nombre del servicio es obligatorio')
  }

  // quantity/unit son legacy y NO se exigen. Volumen estimado es opcional.
  // Obligatorios B1
  if (!data.unit_format?.trim()) throw new Error('El formato unitario es obligatorio')
  if (!data.lead_time?.trim()) throw new Error('El lead time es obligatorio')
  if (!data.sale_currency?.trim()) throw new Error('La moneda de venta es obligatoria')
  if (!data.country?.trim()) throw new Error('El país es obligatorio')

  // Fechas obligatorias
  if (!data.opening_date) throw new Error('La fecha de apertura es obligatoria')
  if (!data.deadline) throw new Error('La fecha límite de recepción de ofertas es obligatoria')
  if (!data.award_date) throw new Error('La fecha de adjudicación es obligatoria')
  if (!data.supply_start_date) throw new Error('La fecha de inicio de suministro es obligatoria')

  // Orden cronológico: apertura ≤ límite ≤ adjudicación ≤ inicio suministro
  if (data.opening_date > data.deadline) {
    throw new Error('La fecha de apertura no puede ser posterior a la fecha límite de recepción de ofertas')
  }
  if (data.deadline > data.award_date) {
    throw new Error('La fecha límite de recepción no puede ser posterior a la fecha de adjudicación')
  }
  if (data.award_date > data.supply_start_date) {
    throw new Error('La fecha de adjudicación no puede ser posterior al inicio de suministro')
  }

  if (data.criticality && !['alto', 'medio', 'bajo'].includes(data.criticality)) {
    throw new Error('Nivel de criticidad no válido')
  }
}

// Limpia un array de strings (certificaciones): trim + sin vacíos. null si queda vacío.
function cleanStringArray(arr?: string[]): string[] | null {
  if (!Array.isArray(arr)) return null
  const out = arr.map((s) => String(s ?? '').trim()).filter(Boolean)
  return out.length ? out : null
}

// Sanea las condiciones personalizadas: estructura fija {label,value,type}, trim,
// descarta filas totalmente vacías. Tratado SIEMPRE como dato, nunca ejecutado.
function sanitizeCustomConditions(conds?: RfqCustomCondition[]): RfqCustomCondition[] {
  if (!Array.isArray(conds)) return []
  return conds
    .map((c) => ({
      label: String(c?.label ?? '').trim(),
      value: String(c?.value ?? '').trim(),
      type:  String(c?.type ?? 'text').trim() || 'text',
    }))
    .filter((c) => c.label.length > 0 || c.value.length > 0)
}

// Construye el payload de columnas de contenido común a insert y update.
function buildRfqContent(data: RfqFormData) {
  const isProduct = data.rfq_kind === 'product'
  return {
    rfq_kind:              data.rfq_kind,
    product_id:            isProduct ? (data.product_id || null) : null,
    service_name:          isProduct ? null : (data.service_name?.trim() || null),
    service_description:   data.service_description?.trim() || null,
    // quantity/unit son legacy: no se escriben desde el formulario ampliado.
    // En INSERT quedan NULL; en UPDATE se preservan los valores existentes.
    opening_date:          data.opening_date,
    deadline:              data.deadline,
    award_date:            data.award_date,
    supply_start_date:     data.supply_start_date,
    country:               data.country.trim(),
    region:                data.region?.trim() || null,
    estimated_volume:      data.estimated_volume ?? null,
    purchase_frequency:    data.purchase_frequency?.trim() || null,
    delivery_location:     data.delivery_location?.trim() || null,
    incoterm:              data.incoterm?.trim() || null,
    target_price:          data.target_price ?? null,
    certifications:        cleanStringArray(data.certifications),
    sustainability_policy: data.sustainability_policy?.trim() || null,
    unit_format:           data.unit_format.trim(),
    criticality:           data.criticality || null,
    lead_time:             data.lead_time.trim(),
    min_order:             data.min_order ?? null,
    sale_currency:         data.sale_currency.trim() || 'EUR',
    internal_code:         data.internal_code?.trim() || null,
    payment_method:        data.payment_method?.trim() || null,
    technical_sheet_url:   data.technical_sheet_url?.trim() || null,
    technical_sheet_notes: data.technical_sheet_notes?.trim() || null,
    custom_conditions:     sanitizeCustomConditions(data.custom_conditions),
    notes:                 data.notes?.trim() || null,
    conditions:            data.conditions?.trim() || null,
  }
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

  // Solo validamos producto activo cuando la RFQ es de producto
  if (formData.rfq_kind === 'product') {
    await resolveActiveProductOrThrow(supabase, formData.product_id!)
  }

  const { data, error } = await supabase
    .from('rfqs')
    .insert({
      organization_id: orgId,
      created_by: user.id,
      status: 'draft',
      ...buildRfqContent(formData),
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

  // Validar producto activo solo si la RFQ es de producto
  if (formData.rfq_kind === 'product') {
    await resolveActiveProductOrThrow(supabase, formData.product_id!)
  }

  // Actualizar solo campos de contenido — organization_id y created_by no se tocan
  const { error } = await supabase
    .from('rfqs')
    .update(buildRfqContent(formData))
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
      ${RFQ_COLUMNS},
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
      ${RFQ_COLUMNS},
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
      ${RFQ_COLUMNS},
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

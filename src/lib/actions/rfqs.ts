'use server'

import type { ServerSupabaseClient } from '@/lib/auth/context'
import {
  requireCommercialCapability,
  requireMembership,
  requirePlatformAdmin,
  requireSession,
} from '@/lib/auth/guards'
import { isAuthorizationError } from '@/lib/auth/errors'
import {
  RFQ_MESSAGES,
  evaluateRfqManagement,
  isValidRfqTransition,
  rfqErrorDetail,
  translateRfqError,
} from '@/lib/auth/rfq'

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
  request_name: string
  request_description: string | null
  product_id: string | null       // legacy/compatibilidad
  service_name: string | null     // legacy/compatibilidad
  service_description: string | null  // legacy/compatibilidad
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
  request_name: string
  request_description?: string
  product_id?: string | null      // legacy/compatibilidad — no obligatorio
  service_name?: string           // legacy/compatibilidad — no obligatorio
  service_description?: string    // legacy/compatibilidad
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
  id, organization_id, created_by, rfq_kind, request_name, request_description,
  product_id, service_name, service_description,
  quantity, unit, opening_date, deadline, award_date, supply_start_date,
  country, region, estimated_volume, purchase_frequency, delivery_location, incoterm,
  target_price, certifications, sustainability_policy, unit_format, criticality, lead_time,
  min_order, sale_currency, internal_code, payment_method, technical_sheet_url,
  technical_sheet_notes, custom_conditions, notes, conditions, status, created_at, updated_at
`

// ── Helpers ───────────────────────────────────────────────────────────────────

function validateFormData(data: RfqFormData) {
  // Tipo de RFQ
  if (data.rfq_kind !== 'product' && data.rfq_kind !== 'service') {
    throw new Error('Debes indicar si la RFQ es de producto o de servicio')
  }

  // request_name es el único requisito real de "qué se pide" — texto libre,
  // no ligado al catálogo de Pricing. product_id/service_name son legacy.
  if (!data.request_name?.trim()) {
    throw new Error(
      data.rfq_kind === 'product'
        ? 'El nombre del producto solicitado es obligatorio'
        : 'El nombre del servicio solicitado es obligatorio'
    )
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
  return {
    rfq_kind:              data.rfq_kind,
    request_name:          data.request_name.trim(),
    request_description:   data.request_description?.trim() || null,
    // Legacy/compatibilidad: no se piden en el formulario nuevo, pero si
    // vienen informados (p. ej. datos antiguos) se conservan sin validar.
    product_id:            data.product_id || null,
    service_name:          data.service_name?.trim() || null,
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

// Los actions de RFQ devuelven los errores como VALOR (no con throw). En
// producción Next.js redacta el mensaje de cualquier Error lanzado desde un
// Server Action (lo sustituye por uno genérico), así que devolverlo como dato
// es la única forma de que el mensaje real de validación llegue al formulario.
export type RfqActionResult = { id: string } | { error: string }

export async function createDraftRfq(formData: RfqFormData): Promise<RfqActionResult> {
  // Una sola carga de sesión, pertenencia y capacidad. Crear exige `can_buy`
  // vigente y que la organización tenga perfil comprador.
  let autorizado
  try {
    autorizado = await requireCommercialCapability('buy')
  } catch (e) {
    if (isAuthorizationError(e)) {
      return { error: e.code === 'NO_ORGANIZATION'
        ? 'No tienes una organización activa.'
        : RFQ_MESSAGES.sinCapacidadEnOrganizacion }
    }
    throw e
  }

  const { supabase, userId, membership } = autorizado

  try {
    validateFormData(formData)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Datos de la RFQ no válidos.' }
  }

  const { data, error } = await supabase
    .from('rfqs')
    .insert({
      organization_id: membership.organizationId,
      created_by: userId,
      status: 'draft',
      ...buildRfqContent(formData),
    })
    .select('id')
    .single()

  if (error) {
    console.error(rfqErrorDetail('creación de borrador', error))
    return { error: translateRfqError(error) }
  }
  return { id: data.id }
}

// ── Cliente: gestión de cotizaciones ─────────────────────────────────────────
//
// La cotización pertenece a la ORGANIZACIÓN: owner y admin gestionan cualquiera
// de su empresa, un member solo las suyas. En todos los casos hace falta
// capacidad de compra vigente. RLS y el trigger de la migración 024 imponen lo
// mismo; estas comprobaciones existen para dar mensajes claros.

interface RfqAutorizada {
  supabase: ServerSupabaseClient
  rfq: { id: string; organization_id: string; created_by: string; status: RfqStatus }
}

/** Carga la cotización y comprueba que el actor puede gestionarla. */
async function autorizarGestion(rfqId: string): Promise<RfqAutorizada | { error: string }> {
  let autorizado
  try {
    autorizado = await requireMembership()
  } catch (e) {
    if (isAuthorizationError(e)) return { error: 'No tienes una organización activa.' }
    throw e
  }

  const { supabase, userId, context, membership } = autorizado

  const { data: rfq, error } = await supabase
    .from('rfqs')
    .select('id, organization_id, created_by, status')
    .eq('id', rfqId)
    .maybeSingle()

  if (error || !rfq) return { error: RFQ_MESSAGES.sinAcceso }

  const fallo = evaluateRfqManagement(
    { userId, orgRole: membership.orgRole, isPlatformAdmin: context.platformRole === 'platform_admin' },
    { organizationId: rfq.organization_id, createdBy: rfq.created_by, status: rfq.status },
    membership,
  )

  if (fallo) {
    return { error: fallo === 'NO_ORGANIZATION' ? RFQ_MESSAGES.sinAcceso : RFQ_MESSAGES.sinCapacidad }
  }

  return { supabase, rfq: rfq as RfqAutorizada['rfq'] }
}

export async function updateDraftRfq(rfqId: string, formData: RfqFormData): Promise<{ error: string } | void> {
  try {
    validateFormData(formData)
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Datos de la RFQ no válidos.' }
  }

  const autorizada = await autorizarGestion(rfqId)
  if ('error' in autorizada) return autorizada
  const { supabase, rfq } = autorizada

  // El contenido solo se edita mientras la cotización sigue siendo borrador.
  if (rfq.status !== 'draft') return { error: RFQ_MESSAGES.finalizada }

  const { error } = await supabase
    .from('rfqs')
    .update(buildRfqContent(formData))
    .eq('id', rfqId)
    .eq('status', 'draft')

  if (error) {
    console.error(rfqErrorDetail('edición de borrador', error))
    return { error: translateRfqError(error) }
  }
}

/** Cambio de estado desde el área de cliente: publicar o cancelar. */
async function cambiarEstadoCliente(rfqId: string, nuevoEstado: RfqStatus): Promise<void> {
  const autorizada = await autorizarGestion(rfqId)
  if ('error' in autorizada) throw new Error(autorizada.error)
  const { supabase, rfq } = autorizada

  if (!isValidRfqTransition(rfq.status, nuevoEstado, false)) {
    throw new Error(
      rfq.status === 'awarded' || rfq.status === 'cancelled'
        ? RFQ_MESSAGES.finalizada
        : RFQ_MESSAGES.transicionInvalida,
    )
  }

  const { error } = await supabase
    .from('rfqs')
    .update({ status: nuevoEstado })
    .eq('id', rfqId)
    .eq('status', rfq.status)

  if (error) {
    console.error(rfqErrorDetail(`transición a ${nuevoEstado}`, error))
    throw new Error(translateRfqError(error))
  }
}

/** draft → open. */
export async function publishRfq(rfqId: string): Promise<void> {
  await cambiarEstadoCliente(rfqId, 'open')
}

/** draft → cancelled y open → cancelled. */
export async function cancelRfq(rfqId: string): Promise<void> {
  await cambiarEstadoCliente(rfqId, 'cancelled')
}

// ── Admin: cambiar cualquier estado ──────────────────────────────────────────

const VALID_ADMIN_STATUSES: RfqStatus[] = ['draft', 'open', 'closed', 'awarded', 'cancelled']

export async function adminUpdateRfqStatus(rfqId: string, status: RfqStatus): Promise<void> {
  if (!VALID_ADMIN_STATUSES.includes(status)) throw new Error('Estado no válido')

  const { supabase } = await requirePlatformAdmin('throw')

  // La plataforma dispone de más transiciones, no de menos reglas: `awarded` y
  // `cancelled` siguen siendo finales. El trigger de 024 lo impone igualmente.
  const { data: actual } = await supabase
    .from('rfqs')
    .select('status')
    .eq('id', rfqId)
    .maybeSingle()

  if (!actual) throw new Error(RFQ_MESSAGES.sinAcceso)

  if (!isValidRfqTransition(actual.status, status, true)) {
    throw new Error(
      actual.status === 'awarded' || actual.status === 'cancelled'
        ? RFQ_MESSAGES.finalizada
        : RFQ_MESSAGES.transicionInvalida,
    )
  }

  const { error } = await supabase
    .from('rfqs')
    .update({ status })
    .eq('id', rfqId)
    .eq('status', actual.status)

  if (error) {
    console.error(rfqErrorDetail('transición administrativa', error))
    throw new Error(translateRfqError(error))
  }
}

// ── Queries ───────────────────────────────────────────────────────────────────

/**
 * Histórico de la organización. Basta con ser miembro activo: retirar la
 * capacidad de comprar no debe borrar lo que la empresa ya solicitó.
 */
export async function listMyRfqs(): Promise<Rfq[]> {
  let autorizado
  try {
    autorizado = await requireMembership()
  } catch (e) {
    if (isAuthorizationError(e)) return []
    throw e
  }
  const { supabase, membership } = autorizado

  const { data, error } = await supabase
    .from('rfqs')
    .select(`
      ${RFQ_COLUMNS},
      product:products(id, name, slug, unit, market:markets(id, name, slug))
    `)
    .eq('organization_id', membership.organizationId)
    .order('created_at', { ascending: false })

  if (error) return []
  return (data ?? []) as unknown as Rfq[]
}

/** Listado global de Administración. */
export async function listAllRfqs(statusFilter?: RfqStatus): Promise<Rfq[]> {
  const { supabase } = await requirePlatformAdmin()

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

/**
 * Detalle de una cotización. RLS ya limita la visibilidad a la organización
 * propietaria y a la plataforma; se apoya en ella en lugar de duplicar el
 * filtro, pero exige sesión para no depender solo de la base de datos.
 */
export async function getRfq(rfqId: string): Promise<Rfq | null> {
  let supabase
  try {
    ({ supabase } = await requireSession())
  } catch (e) {
    if (isAuthorizationError(e)) return null
    throw e
  }

  const { data, error } = await supabase
    .from('rfqs')
    .select(`
      ${RFQ_COLUMNS},
      product:products(id, name, slug, unit, market:markets(id, name, slug)),
      organization:organizations(id, name)
    `)
    .eq('id', rfqId)
    .maybeSingle()

  if (error || !data) return null
  return data as unknown as Rfq
}

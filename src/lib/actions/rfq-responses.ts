'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

// ── Tipos ─────────────────────────────────────────────────────────────────────

export type RfqResponseStatus = 'received' | 'shortlisted' | 'rejected' | 'accepted'

export interface RfqResponse {
  id: string
  rfq_id: string
  supplier_name: string
  supplier_email: string | null
  supplier_phone: string | null
  price: number
  unit: string
  currency: string
  delivery_date: string | null
  payment_terms: string | null
  notes: string | null
  status: RfqResponseStatus
  created_at: string
  updated_at: string
}

export interface RfqResponseFormData {
  supplier_name: string
  supplier_email?: string
  supplier_phone?: string
  price: number
  unit: string
  currency?: string
  delivery_date?: string
  payment_terms?: string
  notes?: string
  status?: RfqResponseStatus
}

const VALID_STATUSES: RfqResponseStatus[] = ['received', 'shortlisted', 'rejected', 'accepted']

// ── Validación ────────────────────────────────────────────────────────────────

function today(): string {
  return new Date().toISOString().split('T')[0]
}

function validateResponseData(data: RfqResponseFormData) {
  if (!data.supplier_name?.trim()) throw new Error('El nombre del proveedor es obligatorio')
  if (!data.price || data.price <= 0) throw new Error('El precio debe ser mayor que 0')
  if (!data.unit?.trim()) throw new Error('La unidad es obligatoria')

  const currency = data.currency?.trim() || 'EUR'
  if (!currency) throw new Error('La moneda es obligatoria')

  if (data.delivery_date && data.delivery_date < today()) {
    throw new Error('La fecha de entrega no puede ser anterior a hoy')
  }

  if (data.status && !VALID_STATUSES.includes(data.status)) {
    throw new Error('Estado de respuesta no válido')
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

// ── Admin: crear respuesta ────────────────────────────────────────────────────

export async function createRfqResponse(
  rfqId: string,
  formData: RfqResponseFormData
): Promise<{ id: string }> {
  validateResponseData(formData)

  const supabase = await createClient()
  await requireAdmin(supabase)

  const { data, error } = await supabase
    .from('rfq_responses')
    .insert({
      rfq_id: rfqId,
      supplier_name: formData.supplier_name.trim(),
      supplier_email: formData.supplier_email?.trim() || null,
      supplier_phone: formData.supplier_phone?.trim() || null,
      price: formData.price,
      unit: formData.unit.trim(),
      currency: formData.currency?.trim() || 'EUR',
      delivery_date: formData.delivery_date || null,
      payment_terms: formData.payment_terms?.trim() || null,
      notes: formData.notes?.trim() || null,
      status: formData.status ?? 'received',
    })
    .select('id')
    .single()

  if (error) throw new Error(error.message)
  return { id: data.id }
}

// ── Admin: editar respuesta ───────────────────────────────────────────────────

export async function updateRfqResponse(
  responseId: string,
  formData: RfqResponseFormData
): Promise<void> {
  validateResponseData(formData)

  const supabase = await createClient()
  await requireAdmin(supabase)

  const { error } = await supabase
    .from('rfq_responses')
    .update({
      supplier_name: formData.supplier_name.trim(),
      supplier_email: formData.supplier_email?.trim() || null,
      supplier_phone: formData.supplier_phone?.trim() || null,
      price: formData.price,
      unit: formData.unit.trim(),
      currency: formData.currency?.trim() || 'EUR',
      delivery_date: formData.delivery_date || null,
      payment_terms: formData.payment_terms?.trim() || null,
      notes: formData.notes?.trim() || null,
      status: formData.status ?? 'received',
    })
    .eq('id', responseId)

  if (error) throw new Error(error.message)
}

// ── Admin: cambiar estado de respuesta ───────────────────────────────────────

export async function updateRfqResponseStatus(
  responseId: string,
  status: RfqResponseStatus
): Promise<void> {
  if (!VALID_STATUSES.includes(status)) throw new Error('Estado no válido')

  const supabase = await createClient()
  await requireAdmin(supabase)

  const { error } = await supabase
    .from('rfq_responses')
    .update({ status })
    .eq('id', responseId)

  if (error) throw new Error(error.message)
}

// ── Query: listar respuestas de una RFQ ──────────────────────────────────────

export async function listRfqResponses(rfqId: string): Promise<RfqResponse[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('rfq_responses')
    .select('*')
    .eq('rfq_id', rfqId)
    .order('price', { ascending: true })

  if (error) return []
  return (data ?? []) as RfqResponse[]
}

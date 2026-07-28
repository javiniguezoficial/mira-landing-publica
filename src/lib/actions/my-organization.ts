'use server'

import { requireSession, resolveMembership } from '@/lib/auth/guards'
import { isOwner } from '@/lib/identity'
import { redirect } from 'next/navigation'

// Solo estos campos son editables desde el cliente
const EDITABLE_FIELDS = ['phone', 'email', 'website', 'city'] as const
type EditableField = (typeof EDITABLE_FIELDS)[number]

export interface UpdateOrgBasicResult {
  error?: string
}

export async function updateOrgBasic(
  formData: FormData
): Promise<UpdateOrgBasicResult> {
  const { supabase, context } = await requireSession()

  // Pertenencia resuelta de forma determinista, no por la primera fila que
  // devuelva Postgres.
  const membership = resolveMembership(context)

  if (!membership) {
    return { error: 'No tienes una organización asignada.' }
  }

  // `isOwner` acepta el rol canónico ('owner') y el legacy ('client_owner')
  // durante la transición. La comparación literal anterior contra
  // 'client_owner' habría rechazado a un propietario creado ya en el modelo
  // canónico.
  if (!isOwner(membership.orgRole)) {
    return { error: 'Solo el propietario de la organización puede editar estos datos.' }
  }

  const orgId = membership.organizationId

  // Construir payload solo con campos permitidos
  const payload: Partial<Record<EditableField, string | null>> = {}
  for (const field of EDITABLE_FIELDS) {
    const value = (formData.get(field) as string)?.trim() || null
    payload[field] = value
  }

  const { error } = await supabase
    .from('organizations')
    .update(payload)
    .eq('id', orgId)

  if (error) return { error: error.message }

  redirect('/app/mi-organizacion')
}

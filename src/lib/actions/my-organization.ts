'use server'

import {
  ORGANIZATION_EDIT_MESSAGES,
  evaluateOrganizationEdit,
  resolveOrganizationAccessFromContext,
} from '@/lib/auth/access'
import { requireSession } from '@/lib/auth/guards'
import { isOwner } from '@/lib/identity'
import { redirect } from 'next/navigation'

// Solo estos campos son editables desde el cliente
const EDITABLE_FIELDS = ['phone', 'email', 'website', 'city'] as const
type EditableField = (typeof EDITABLE_FIELDS)[number]

export interface UpdateOrgBasicResult {
  error?: string
}

/**
 * Actualiza los datos básicos de la organización.
 *
 * 6B.5.1 corrige dos defectos verificados contra el proyecto remoto:
 *
 *   1. FALSO ÉXITO SILENCIOSO. Un propietario suspendido pasaba la comprobación
 *      de rol —que no miraba estados—, lanzaba el UPDATE y RLS lo dejaba en
 *      cero filas SIN error. Como PostgREST no considera eso un fallo, la
 *      acción redirigía como si hubiera guardado y los cambios se perdían en
 *      silencio. Ahora se comprueba el acceso ANTES, y el UPDATE devuelve las
 *      filas afectadas para poder distinguir «no se guardó» de «se guardó».
 *   2. FUGA DE MENSAJES. Se devolvía `error.message` de PostgreSQL tal cual.
 *
 * El contexto se recarga en CADA envío, así que una suspensión posterior a
 * abrir el formulario bloquea igualmente. RLS sigue siendo la última barrera;
 * esto es lo que hace que el usuario entienda qué ha pasado.
 */
export async function updateOrgBasic(
  formData: FormData
): Promise<UpdateOrgBasicResult> {
  const { supabase, context, userId } = await requireSession()

  // Pertenencia resuelta de forma determinista, no por la primera fila que
  // devuelva Postgres, y clasificada: una suspensión NO es una ausencia.
  const access = resolveOrganizationAccessFromContext(context)

  // `isOwner` acepta el rol canónico ('owner') y el legacy ('client_owner')
  // durante la transición. La comparación literal contra 'client_owner' habría
  // rechazado a un propietario creado ya en el modelo canónico.
  const fallo = evaluateOrganizationEdit(access, isOwner(access.membership?.orgRole ?? null))

  if (fallo) {
    console.warn(`[org] edición denegada (${access.state}: ${access.detail}) para ${userId}`)
    return { error: fallo }
  }

  const orgId = access.membership!.organizationId

  // Construir payload solo con campos permitidos
  const payload: Partial<Record<EditableField, string | null>> = {}
  for (const field of EDITABLE_FIELDS) {
    const value = (formData.get(field) as string)?.trim() || null
    payload[field] = value
  }

  // `.select('id')` no es decorativo: sin él, un UPDATE bloqueado por RLS es
  // indistinguible de uno correcto.
  const { data, error } = await supabase
    .from('organizations')
    .update(payload)
    .eq('id', orgId)
    .select('id')

  if (error) {
    console.error(`[org] error al actualizar ${orgId}: ${error.code ?? 'sin código'} ${error.message}`)
    return { error: ORGANIZATION_EDIT_MESSAGES.generico }
  }

  if (!data || data.length === 0) {
    // Carrera: el acceso era válido al comprobar y ya no lo es al escribir.
    console.warn(`[org] UPDATE sin filas afectadas en ${orgId} para ${userId}`)
    return { error: ORGANIZATION_EDIT_MESSAGES.noGuardado }
  }

  redirect('/app/mi-organizacion')
}

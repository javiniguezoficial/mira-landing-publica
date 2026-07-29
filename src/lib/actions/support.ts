'use server'

import { requirePlatformAdmin, requireSession, resolveMembership } from '@/lib/auth/guards'

// ─── Constantes ───────────────────────────────────────────────────────────────

const ALLOWED_CATEGORIES = ['account','data','prices','rfq','suppliers','billing','other'] as const
const ALLOWED_PRIORITIES = ['low','normal','high'] as const
const ALLOWED_STATUSES   = ['open','in_progress','resolved','closed'] as const

type Category = (typeof ALLOWED_CATEGORIES)[number]
type Priority = (typeof ALLOWED_PRIORITIES)[number]
type Status   = (typeof ALLOWED_STATUSES)[number]

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface ActionResult {
  error?: string
  success?: string
}

// ─── submitSupportTicket (cliente) ────────────────────────────────────────────

export async function submitSupportTicket(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const { supabase, context, userId } = await requireSession()

  const subject  = (formData.get('subject')  as string)?.trim()
  const message  = (formData.get('message')  as string)?.trim()
  const category = (formData.get('category') as string)?.trim()
  const priority = (formData.get('priority') as string)?.trim()

  if (!subject)  return { error: 'El asunto es obligatorio.' }
  if (!message)  return { error: 'El mensaje es obligatorio.' }
  if (!ALLOWED_CATEGORIES.includes(category as Category)) {
    return { error: 'Categoría no válida.' }
  }
  if (!ALLOWED_PRIORITIES.includes(priority as Priority)) {
    return { error: 'Prioridad no válida.' }
  }

  // organization_id calculado en servidor, nunca desde el formulario. Sale del
  // contexto ya cargado por el guard — antes era una consulta aparte con
  // `.limit(1)` sin ORDER BY, no determinista con varias pertenencias.
  //
  // ── EXCEPCIÓN DELIBERADA, NO TOCAR ───────────────────────────────────────
  //
  // Soporte usa `requireSession` + `resolveMembership`, y NUNCA
  // `requireMembership` ni los guards de capacidad comercial. Es el único
  // flujo que debe seguir abierto a una cuenta suspendida: es la vía por la
  // que puede preguntar por qué lo está.
  //
  // Del mismo modo, la pertenencia se conserva aunque esté inactiva, para que
  // el ticket llegue asociado a su organización. La policy
  // `client_insert_own_ticket` lo permite explícitamente vía
  // `belongs_to_org_any_status()`, cuyo comentario en base de datos dice: «Uso
  // EXCLUSIVO del canal de soporte, para que un usuario suspendido pueda
  // reclamar. No usar en ninguna otra policy.»
  //
  // Endurecer esto con un guard de estado activo sería una REGRESIÓN, no una
  // corrección: dejaría a las personas suspendidas sin forma de reclamar.
  const organization_id = resolveMembership(context)?.organizationId ?? null

  const { error } = await supabase
    .from('support_tickets')
    .insert({
      user_id: userId,
      organization_id,
      subject,
      category,
      priority,
      message,
      status: 'open',
    })

  if (error) {
    // Nunca se devuelve `error.message` de PostgreSQL a la interfaz.
    console.error(`[soporte] error al crear ticket: ${error.code ?? 'sin código'} ${error.message}`)
    return { error: 'No se ha podido enviar la solicitud. Vuelve a intentarlo en unos minutos.' }
  }

  return { success: '¡Solicitud enviada! Nos pondremos en contacto contigo pronto.' }
}

// ─── updateTicketStatus (admin) ───────────────────────────────────────────────

export async function updateTicketStatus(
  ticketId: string,
  status: string
): Promise<ActionResult> {
  const { supabase } = await requirePlatformAdmin('redirect-login')

  if (!ALLOWED_STATUSES.includes(status as Status)) {
    return { error: 'Estado no válido.' }
  }

  const { error } = await supabase
    .from('support_tickets')
    .update({ status })
    .eq('id', ticketId)

  if (error) return { error: error.message }
  return { success: 'Estado actualizado.' }
}

// ─── updateTicketResponse (admin) ─────────────────────────────────────────────

export async function updateTicketResponse(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const { supabase } = await requirePlatformAdmin('redirect-login')

  const ticketId      = (formData.get('ticket_id')     as string)?.trim()
  const adminResponse = (formData.get('admin_response') as string)?.trim() || null
  const status        = (formData.get('status')         as string)?.trim()

  if (!ticketId) return { error: 'ID de ticket no válido.' }
  if (!ALLOWED_STATUSES.includes(status as Status)) {
    return { error: 'Estado no válido.' }
  }

  const { error } = await supabase
    .from('support_tickets')
    .update({ admin_response: adminResponse, status })
    .eq('id', ticketId)

  if (error) return { error: error.message }
  return { success: 'Respuesta guardada correctamente.' }
}

'use server'

import { revalidatePath } from 'next/cache'
import { requirePlatformAdmin, requireSession, resolveMembership } from '@/lib/auth/guards'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { notifyTicketAnswered, notifyTicketCreated } from '@/lib/email/support'

/**
 * 039 — refresca las superficies afectadas por un cambio de ticket.
 *
 * `/admin` incluye el LAYOUT, que es donde se calcula el badge de pendientes.
 * Sin esta revalidación, resolver un ticket dejaba el aviso con el número
 * anterior hasta la siguiente recarga completa — y un aviso que no baja al
 * atender deja de ser un aviso.
 */
function refrescarSoporte(ticketId?: string) {
  revalidatePath('/admin', 'layout')
  revalidatePath('/admin/soporte')
  if (ticketId) revalidatePath(`/admin/soporte/${ticketId}`)
}

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

// ─── Notificaciones: siempre DESPUÉS de guardar, y nunca bloqueantes ─────────
//
// Toda notificación de este archivo se lanza cuando la escritura principal ya
// ha ido bien, y su resultado NO influye en lo que se le devuelve a la persona.
//
// El motivo es concreto: un ticket es la vía por la que un cliente reclama
// cuando algo va mal —incluida una cuenta suspendida—. Perder ese ticket porque
// el proveedor de correo devuelve 500 sería el peor fallo posible de esta
// pantalla.
//
// `notificar` es la red final: `deliver()` ya promete no lanzar, pero si algún
// día una plantilla nueva reventara al renderizar, la excepción moriría aquí y
// no en mitad de la Server Action.
async function notificar(operacion: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn()
  } catch (e) {
    console.error(
      `[soporte] la notificación de «${operacion}» falló, la operación principal SÍ se guardó: ` +
        `${e instanceof Error ? e.name : 'error desconocido'}`,
    )
  }
}

/**
 * Correo de la persona propietaria de un ticket.
 *
 * ── Por qué hace falta el cliente privilegiado ────────────────────────────
 *
 * El correo vive en `auth.users`, que ninguna sesión —tampoco la de un
 * administrador— puede leer por PostgREST. `profiles` no lo guarda.
 *
 * ── Por qué no es un IDOR ─────────────────────────────────────────────────
 *
 * `userId` NO viene del formulario: es el `support_tickets.user_id` que la
 * acción acaba de leer de la base. Aunque alguien manipulara el identificador
 * del ticket, el correo que se resuelve es siempre el del propietario REAL de
 * la fila que se ha modificado, nunca uno elegido por quien envía la petición.
 */
async function resolverCorreoDePropietario(userId: string): Promise<string | null> {
  try {
    const admin = await createSupabaseAdminClient()
    const { data, error } = await admin.auth.admin.getUserById(userId)
    if (error) {
      console.error(`[soporte] no se pudo resolver el correo del propietario: ${error.message}`)
      return null
    }
    return data.user?.email ?? null
  } catch {
    console.error('[soporte] excepción al resolver el correo del propietario')
    return null
  }
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

  // ── A partir de aquí el ticket YA ESTÁ GUARDADO ─────────────────────────
  //
  // El correo de quien abre el ticket sale de SU PROPIA sesión: no hace falta
  // ningún cliente privilegiado ni ninguna consulta extra, y es imposible que
  // apunte a otra persona.
  const membership = resolveMembership(context)

  await notificar('ticket creado', async () => {
    // `support_email` es la configuración que YA existe en el producto: la
    // pantalla de Ayuda la muestra a los clientes. Se usa como respaldo del
    // buzón interno cuando no hay variable de entorno. Un fallo al leerla no
    // debe impedir la confirmación al usuario, así que no se comprueba el error.
    const { data: ajustes } = await supabase
      .from('platform_settings')
      .select('support_email')
      .limit(1)
      .maybeSingle()

    await notifyTicketCreated({
      subject,
      message,
      category,
      priority,
      requesterEmail: context.user.email,
      organizationName: membership?.organizationName ?? null,
      platformSupportEmail: (ajustes?.support_email as string | null) ?? null,
    })
  })

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

  // `.select()` para distinguir «actualizado» de «no afectó a ninguna fila»: un
  // identificador inexistente no debe saldarse con un «guardado» silencioso.
  const { data, error } = await supabase
    .from('support_tickets')
    .update({ status })
    .eq('id', ticketId)
    .select('id')

  if (error) {
    // Antes se devolvía `error.message` tal cual: eso enseña texto interno de
    // PostgreSQL —nombres de tabla, de constraint y SQLSTATE— en la pantalla de
    // soporte. El detalle se registra en servidor; a la persona se le da un
    // mensaje que pueda entender.
    console.error(
      `[soporte] error al cambiar el estado: ${error.code ?? 'sin código'} ${error.message}`,
    )
    return { error: 'No se ha podido actualizar el estado. Vuelve a intentarlo en unos minutos.' }
  }
  if (!data || data.length === 0) return { error: 'La solicitud indicada ya no existe.' }

  refrescarSoporte(ticketId)
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

  // Se lee el estado ANTERIOR antes de escribir, por dos motivos distintos:
  //
  //   1. `user_id` y `subject` deben salir de la BASE, no del formulario. Es lo
  //      que garantiza que el aviso llegue al propietario real del ticket
  //      aunque alguien manipulara el identificador enviado.
  //   2. comparar `admin_response` permite no reenviar el correo cuando el
  //      administrador vuelve a guardar sin cambiar el texto —por ejemplo al
  //      tocar solo el estado desde el mismo formulario—.
  const { data: previo } = await supabase
    .from('support_tickets')
    .select('id, user_id, subject, admin_response')
    .eq('id', ticketId)
    .maybeSingle()

  if (!previo) return { error: 'La solicitud indicada ya no existe.' }

  // `.select()` para distinguir «guardado» de «no afectó a ninguna fila». Sin
  // esto, un identificador inexistente se saldaba con un «guardado» silencioso.
  const { data: actualizado, error } = await supabase
    .from('support_tickets')
    .update({ admin_response: adminResponse, status })
    .eq('id', ticketId)
    .select('id')

  if (error) {
    // Nunca se devuelve `error.message` de PostgreSQL a la interfaz.
    console.error(
      `[soporte] error al guardar la respuesta: ${error.code ?? 'sin código'} ${error.message}`,
    )
    return { error: 'No se ha podido guardar la respuesta. Vuelve a intentarlo en unos minutos.' }
  }
  if (!actualizado || actualizado.length === 0) {
    return { error: 'La solicitud indicada ya no existe.' }
  }

  // ── A partir de aquí la respuesta YA ESTÁ GUARDADA ──────────────────────
  const textoNuevo = (adminResponse ?? '').trim()
  const textoAnterior = ((previo.admin_response as string | null) ?? '').trim()
  const hayRespuestaNueva = textoNuevo.length > 0 && textoNuevo !== textoAnterior

  if (hayRespuestaNueva) {
    await notificar('respuesta a ticket', async () => {
      const destinatario = await resolverCorreoDePropietario(previo.user_id as string)

      await notifyTicketAnswered({
        // Asunto y respuesta salen de la base y de lo que se acaba de escribir,
        // nunca de otro ticket: aquí no se busca contenido por identificador.
        subject: (previo.subject as string) ?? '',
        response: textoNuevo,
        status,
        recipientEmail: destinatario,
      })
    })
  }

  refrescarSoporte(ticketId)
  return { success: 'Respuesta guardada correctamente.' }
}

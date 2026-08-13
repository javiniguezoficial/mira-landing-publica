// Notificaciones de correo de Soporte (Bloque 2).
//
// SOLO SERVIDOR. No es `'use server'` a propósito: lo llaman las acciones de
// soporte, que son quienes ya han autorizado y han escrito en la base.
//
// ── El contrato, y por qué es así ─────────────────────────────────────────
//
// Ninguna función de este archivo lanza NUNCA, y ninguna devuelve nada que
// cambie el resultado de la operación principal. Se llaman DESPUÉS de que el
// ticket o la respuesta ya estén guardados.
//
// El motivo es concreto: un ticket es la vía por la que un cliente reclama
// cuando algo va mal —incluida una cuenta suspendida—. Que ese ticket se
// pierda porque el proveedor de correo devuelve 500 sería el peor fallo
// posible de esta pantalla. Primero se guarda; avisar es lo secundario.
//
// ── Qué contenido viaja ───────────────────────────────────────────────────
//
// Solo el del ticket que se está tratando, con los datos que la acción ya ha
// leído de la base bajo RLS. Ninguna plantilla recibe un identificador para ir
// a buscar contenido por su cuenta: eso abriría la puerta a que un id
// manipulado hiciera que el correo llevara el ticket de otra persona.

import { deliver } from './send'
import { loadEmailConfig } from './send'
import { resolveSupportInbox } from './config'
import {
  renderTicketAnsweredForUser,
  renderTicketCreatedForUser,
  renderTicketCreatedInternal,
} from './templates'
import type { EmailDeliveryResult } from './types'

/** Etiquetas visibles, iguales a las de la interfaz. */
const CATEGORY_LABELS: Record<string, string> = {
  account: 'Cuenta',
  data: 'Datos',
  prices: 'Precios',
  rfq: 'Cotizaciones',
  suppliers: 'Proveedores',
  billing: 'Facturación',
  other: 'Otro',
}

const PRIORITY_LABELS: Record<string, string> = {
  low: 'Baja',
  normal: 'Normal',
  high: 'Alta',
}

const STATUS_LABELS: Record<string, string> = {
  open: 'Abierto',
  in_progress: 'En proceso',
  resolved: 'Resuelto',
  closed: 'Cerrado',
}

export function categoryLabel(raw: string | null | undefined): string {
  return (raw && CATEGORY_LABELS[raw]) || 'Otro'
}

export function priorityLabel(raw: string | null | undefined): string {
  return (raw && PRIORITY_LABELS[raw]) || 'Normal'
}

export function ticketStatusLabel(raw: string | null | undefined): string {
  return (raw && STATUS_LABELS[raw]) || 'Abierto'
}

/** Resultado agregado. Solo para los registros: nadie decide nada con esto. */
export interface SupportNotificationOutcome {
  user: EmailDeliveryResult | null
  internal: EmailDeliveryResult | null
}

export interface TicketCreatedNotification {
  subject: string
  message: string
  category: string
  priority: string
  /** Correo de quien abre el ticket, tomado de SU PROPIA sesión. */
  requesterEmail: string | null
  organizationName: string | null
  /** `platform_settings.support_email`, si lo hay. Respaldo del buzón interno. */
  platformSupportEmail: string | null
}

/**
 * Avisa de un ticket recién creado: confirmación a quien lo abre y aviso
 * interno a MIRA.
 *
 * Los dos envíos son independientes. Que no haya buzón interno configurado no
 * impide la confirmación al usuario, y al revés.
 */
export async function notifyTicketCreated(
  input: TicketCreatedNotification,
): Promise<SupportNotificationOutcome> {
  const salida: SupportNotificationOutcome = { user: null, internal: null }

  const resuelta = loadEmailConfig()
  if (!resuelta.ok) {
    // Se registra una sola vez, no una por destinatario.
    console.warn(
      `[email] soporte: sin configuración de correo, no se avisa del ticket nuevo. Falta ${resuelta.missing.join(', ')}`,
    )
    return salida
  }
  const config = resuelta.config

  // ── Confirmación a quien abre el ticket ─────────────────────────────────
  if (input.requesterEmail) {
    const plantilla = renderTicketCreatedForUser({
      subject: input.subject,
      message: input.message,
      categoryLabel: categoryLabel(input.category),
      appUrl: config.appUrl,
      logoUrl: config.logoUrl,
    })

    salida.user = await deliver(
      { to: input.requesterEmail, tag: 'support.ticket.created.user', ...plantilla },
      { config },
    )
  }

  // ── Aviso interno ───────────────────────────────────────────────────────
  const buzon = resolveSupportInbox(config.supportInbox, input.platformSupportEmail)
  if (buzon) {
    const plantilla = renderTicketCreatedInternal({
      subject: input.subject,
      message: input.message,
      categoryLabel: categoryLabel(input.category),
      priorityLabel: priorityLabel(input.priority),
      requesterEmail: input.requesterEmail,
      organizationName: input.organizationName,
      appUrl: config.appUrl,
      logoUrl: config.logoUrl,
    })

    salida.internal = await deliver(
      { to: buzon, tag: 'support.ticket.created.internal', ...plantilla },
      { config },
    )
  } else {
    console.warn(
      '[email] soporte: no hay buzón interno configurado (SUPPORT_NOTIFICATION_EMAIL ni platform_settings.support_email); se omite el aviso interno.',
    )
  }

  return salida
}

export interface TicketAnsweredNotification {
  subject: string
  response: string
  status: string
  /**
   * Correo de la persona PROPIETARIA del ticket, resuelto en servidor a partir
   * de `support_tickets.user_id`. Nunca llega desde el formulario.
   */
  recipientEmail: string | null
}

/**
 * Avisa a quien abrió el ticket de que MIRA ha respondido.
 *
 * Si no hay destinatario resoluble no se envía nada — y no se busca ninguno
 * alternativo. Un correo de soporte enviado «a quien sea» es peor que un correo
 * no enviado.
 */
export async function notifyTicketAnswered(
  input: TicketAnsweredNotification,
): Promise<EmailDeliveryResult | null> {
  if (!input.recipientEmail) {
    console.warn('[email] soporte: sin destinatario para el aviso de respuesta; se omite.')
    return null
  }

  const resuelta = loadEmailConfig()
  if (!resuelta.ok) {
    console.warn(
      `[email] soporte: sin configuración de correo, no se avisa de la respuesta. Falta ${resuelta.missing.join(', ')}`,
    )
    return null
  }
  const config = resuelta.config

  const plantilla = renderTicketAnsweredForUser({
    subject: input.subject,
    response: input.response,
    statusLabel: ticketStatusLabel(input.status),
    appUrl: config.appUrl,
    logoUrl: config.logoUrl,
  })

  return deliver(
    { to: input.recipientEmail, tag: 'support.ticket.answered.user', ...plantilla },
    { config },
  )
}

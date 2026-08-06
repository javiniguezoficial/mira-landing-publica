// Aviso de tickets de soporte (Fase 039).
//
// Módulo PURO.
//
// ── Qué pidió el cliente ───────────────────────────────────────────────────
//
// «Necesito saber cuándo llega un ticket sin entrar continuamente en Soporte.
//  Un popup pequeño al lado de Soporte o algo similar.»
//
// Se implementa un BADGE, no un popup. Un aviso emergente interrumpe lo que se
// esté haciendo y hay que cerrarlo; un número junto al enlace se ve de reojo,
// no pide nada y está siempre disponible. Si más adelante hace falta algo más
// llamativo, se añade encima de esto.
//
// ── Qué se cuenta, y por qué no «no leídos» ────────────────────────────────
//
// `support_tickets` NO tiene ninguna columna de lectura: ni `read_at`, ni
// `seen_by`, ni nada equivalente. Inventar «no leído» exigiría una tabla nueva
// por administrador y por ticket, y decidir qué cuenta como leer.
//
// Se cuenta lo que el modelo REAL sabe responder: los tickets PENDIENTES, es
// decir los que están `open` o `in_progress`. Un ticket resuelto o cerrado ya
// no requiere atención, así que sale de la cuenta — que es justo el
// comportamiento que se espera de un aviso.
//
// Los estados salen de `ALLOWED_STATUSES` de las acciones de soporte:
// open · in_progress · resolved · closed.

/** Estados que significan «todavía requiere atención». */
export const PENDING_TICKET_STATUSES = ['open', 'in_progress'] as const

export type PendingTicketStatus = (typeof PENDING_TICKET_STATUSES)[number]

export function isPendingTicketStatus(raw: unknown): raw is PendingTicketStatus {
  return typeof raw === 'string' && (PENDING_TICKET_STATUSES as readonly string[]).includes(raw)
}

/** Tope a partir del cual el número deja de ser útil y estorba. */
export const BADGE_MAX = 99

/**
 * Cómo se escribe el número en el badge.
 *
 *   0            → `null`, y el badge NO se pinta. Un «0» permanente junto a
 *                  Soporte es ruido: comunica lo mismo que no poner nada y
 *                  además parece un aviso.
 *   1 … 99       → el número tal cual.
 *   100 o más    → «99+». Con tres cifras el badge deja de caber en la barra
 *                  lateral, y la diferencia entre 100 y 400 tickets pendientes
 *                  no cambia lo que hay que hacer.
 *
 * Un valor negativo o no numérico se trata como 0: un contador roto no debe
 * pintar un aviso falso.
 */
export function formatBadgeCount(count: number | null | undefined): string | null {
  if (typeof count !== 'number' || !Number.isFinite(count)) return null
  const n = Math.floor(count)
  if (n <= 0) return null
  return n > BADGE_MAX ? `${BADGE_MAX}+` : String(n)
}

/**
 * Texto accesible del enlace cuando lleva aviso.
 *
 * El badge es un número suelto: para un lector de pantalla, «Soporte 3» no dice
 * qué son esos tres. El enlace lleva su propio `aria-label` completo y el badge
 * queda marcado como decorativo.
 */
export function badgeAriaLabel(label: string, count: number | null | undefined): string {
  const n = typeof count === 'number' && Number.isFinite(count) ? Math.floor(count) : 0
  if (n <= 0) return label
  if (n === 1) return `${label}: 1 ticket pendiente`
  return `${label}: ${n} tickets pendientes`
}

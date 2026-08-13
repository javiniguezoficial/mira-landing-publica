// Presentación de un ticket para quien lo abrió (Bloque 2).
//
// Módulo PURO.
//
// ═══════════════════════════════════════════════════════════════════════════
// ANÁLISIS: ¿se puede saber si una respuesta es «nueva» sin migración?
// ═══════════════════════════════════════════════════════════════════════════
//
// Columnas reales de `support_tickets`:
//
//   id · organization_id · user_id · subject · category · priority · message
//   status · admin_response · resolved_at · created_at · updated_at
//
// Con eso se puede responder de forma FIABLE a dos preguntas:
//
//   · ¿está sin responder?  →  `admin_response` vacío o nulo.
//   · ¿tiene respuesta?     →  `admin_response` con contenido.
//
// Y NO se puede responder a la tercera:
//
//   · ¿es una respuesta que esta persona todavía no ha visto?
//
// Por qué no, en concreto:
//
//   1. No existe ninguna columna de lectura: ni `read_at`, ni `seen_at`, ni
//      nada equivalente. Nada registra que el usuario haya abierto la pantalla.
//
//   2. `updated_at` NO sirve como fecha de respuesta. El trigger
//      `set_updated_at` lo refresca en CUALQUIER escritura, y `updateTicketStatus`
//      cambia el estado sin tocar la respuesta. Un ticket respondido el lunes y
//      cerrado el viernes tiene `updated_at` del viernes: usarlo como «fecha de
//      respuesta» sería mostrar una fecha falsa.
//
//   3. `resolved_at` tampoco: lo gestiona `handle_ticket_resolved_at()` y marca
//      cuándo pasó a `resolved`/`closed`, que es otra cosa. Un ticket respondido
//      y todavía `in_progress` lo tiene a nulo.
//
// DECISIÓN: no se crea migración en este bloque. Se implementa la señal que el
// modelo actual SÍ sostiene —«tiene respuesta de MIRA»—, que es lo que se pidió
// como mínimo, y la fecha se rotula como «Última actualización», que es lo que
// de verdad significa `updated_at`.
//
// Para un «no leído» real haría falta, en una migración aparte y aprobada:
//
//   alter table support_tickets
//     add column admin_responded_at timestamptz,   -- cuándo se respondió
//     add column response_seen_at   timestamptz;   -- cuándo lo vio el usuario
//
// más una policy UPDATE que permita al propietario escribir SOLO
// `response_seen_at` sobre su propio ticket —hoy el cliente no tiene UPDATE
// sobre `support_tickets` en absoluto—. Eso es un cambio de esquema y de
// permisos, no un retoque estético, y por eso queda fuera hasta que se apruebe.

export interface TicketResponseFacts {
  admin_response: string | null
  status: string
}

/** ¿Hay una respuesta con contenido real? Un texto en blanco no cuenta. */
export function hasAdminResponse(ticket: TicketResponseFacts | null | undefined): boolean {
  return typeof ticket?.admin_response === 'string' && ticket.admin_response.trim().length > 0
}

/**
 * Los dos estados que el modelo actual sostiene.
 *
 * `answered` no significa «resuelto»: MIRA puede responder y dejar el ticket en
 * proceso. Son dos ejes distintos y se muestran por separado.
 */
export type TicketResponseState = 'answered' | 'awaiting'

export function ticketResponseState(ticket: TicketResponseFacts): TicketResponseState {
  return hasAdminResponse(ticket) ? 'answered' : 'awaiting'
}

export const TICKET_RESPONSE_LABELS: Record<TicketResponseState, string> = {
  answered: 'Respuesta de MIRA',
  awaiting: 'Pendiente de respuesta',
}

/**
 * Texto de ayuda bajo la lista. Se redacta según lo que la persona tiene
 * delante para no prometer un aviso que no existe.
 */
export function ticketListHint(tickets: TicketResponseFacts[]): string {
  const conRespuesta = tickets.filter(hasAdminResponse).length
  if (tickets.length === 0) return ''
  if (conRespuesta === 0) return 'Te avisaremos por correo en cuanto respondamos.'
  if (conRespuesta === 1) return '1 de tus solicitudes tiene respuesta de MIRA.'
  return `${conRespuesta} de tus solicitudes tienen respuesta de MIRA.`
}

/** Cuántas solicitudes tienen respuesta. Alimenta la señal visual del listado. */
export function countAnswered(tickets: TicketResponseFacts[]): number {
  return tickets.filter(hasAdminResponse).length
}

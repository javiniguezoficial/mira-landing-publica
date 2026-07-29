// Reglas de autorización y transiciones de RFQ (Bloque 6B.4).
//
// Módulo puro. Espeja lo que impone la migración 024, para que la interfaz
// pueda anticipar una denegación y dar un mensaje claro en lugar de un error de
// base de datos. La autoridad sigue siendo SQL: las policies y el trigger se
// aplican aunque alguien llame a PostgREST directamente.
//
// Denominación: en la interfaz estas solicitudes son «cotizaciones». `RFQ` se
// mantiene en el código por coherencia con el esquema.

import type { OrganizationRole } from '@/lib/identity'
import type { AuthorizationCode } from './errors'
import type { AuthMembership } from './types'

/** Estados reales de `rfqs.status`, tomados del CHECK vigente. */
export type RfqStatus = 'draft' | 'open' | 'closed' | 'awarded' | 'cancelled'

/** Estados de los que ya no se sale. */
export const FINAL_RFQ_STATUSES: RfqStatus[] = ['awarded', 'cancelled']

export function isFinalRfqStatus(status: string | null | undefined): boolean {
  return FINAL_RFQ_STATUSES.includes(status as RfqStatus)
}

/**
 * Matriz de transiciones. Réplica exacta de `is_valid_rfq_transition()` en SQL.
 *
 *   cliente:   draft → open | cancelled      ·  open → cancelled
 *   plataforma: además       open → closed | awarded  ·  closed → awarded | open
 */
export function isValidRfqTransition(
  desde: string | null | undefined,
  hasta: string | null | undefined,
  esPlataforma = false,
): boolean {
  if (desde === hasta) return true
  if (isFinalRfqStatus(desde)) return false

  if (desde === 'draft' && (hasta === 'open' || hasta === 'cancelled')) return true
  if (desde === 'open' && hasta === 'cancelled') return true

  if (esPlataforma) {
    if (desde === 'open' && (hasta === 'closed' || hasta === 'awarded')) return true
    if (desde === 'closed' && (hasta === 'awarded' || hasta === 'open')) return true
  }

  return false
}

export interface RfqActor {
  userId: string
  orgRole: OrganizationRole | null
  isPlatformAdmin?: boolean
}

export interface RfqRef {
  organizationId: string
  createdBy: string
  status: string
}

/**
 * ¿Puede el actor GESTIONAR esta cotización (editarla, publicarla, cancelarla)?
 *
 * La cotización pertenece a la ORGANIZACIÓN, no a quien la creó:
 *   · owner y admin gestionan cualquiera de su organización;
 *   · un member solo gestiona las suyas;
 *   · en ambos casos hace falta capacidad de compra vigente.
 *
 * Así, si el creador abandona la empresa, la cotización no queda huérfana.
 */
export function evaluateRfqManagement(
  actor: RfqActor,
  rfq: RfqRef,
  membership: AuthMembership | null,
): AuthorizationCode | null {
  if (actor.isPlatformAdmin) return null

  if (!membership || membership.organizationId !== rfq.organizationId) {
    return 'FORBIDDEN'
  }

  // Capacidad de compra, limitada por el perfil comercial de la organización.
  const perfil = membership.commercialProfile
  const puedeComprar =
    membership.canBuy && (perfil === 'buyer' || perfil === 'buyer_seller')
  if (!puedeComprar) return 'FORBIDDEN'

  const esResponsable =
    rfq.createdBy === actor.userId ||
    membership.orgRole === 'owner' ||
    membership.orgRole === 'admin'

  return esResponsable ? null : 'FORBIDDEN'
}

/**
 * ¿Admite esta cotización que se escriba su CONTENIDO?
 *
 * Solo mientras es borrador. En cuanto sale de `draft` ha podido ser consultada
 * y utilizada por terceros: el contenido es el objeto comercial que vieron y
 * queda congelado. No depende del actor — no hay ningún rol que lo levante.
 */
export function isRfqContentEditable(status: string | null | undefined): boolean {
  return status === 'draft'
}

/**
 * ¿Puede el actor editar el CONTENIDO de esta cotización?
 *
 * Dos condiciones acumulativas: poder gestionarla y que siga siendo borrador.
 * `platform_admin` supera la primera y NO la segunda: conserva las transiciones
 * de estado, no la reescritura de lo ya publicado. Réplica del congelado de fila
 * completa que impone `enforce_rfq_integrity()` en la migración 024.
 */
export function evaluateRfqContentEdit(
  actor: RfqActor,
  rfq: RfqRef,
  membership: AuthMembership | null,
): AuthorizationCode | null {
  const fallo = evaluateRfqManagement(actor, rfq, membership)
  if (fallo) return fallo
  return isRfqContentEditable(rfq.status) ? null : 'FORBIDDEN'
}

/**
 * ¿Puede el actor CREAR cotizaciones en esta organización?
 * Ver el histórico no requiere capacidad; crear, sí.
 */
export function evaluateRfqCreation(
  membership: AuthMembership | null,
): AuthorizationCode | null {
  if (!membership) return 'NO_ORGANIZATION'
  const perfil = membership.commercialProfile
  const puedeComprar =
    membership.canBuy && (perfil === 'buyer' || perfil === 'buyer_seller')
  return puedeComprar ? null : 'FORBIDDEN'
}

/**
 * ¿Puede VER el histórico? Basta con ser miembro activo de la organización.
 * Retirar la capacidad de comprar no borra lo que la empresa ya solicitó.
 */
export function evaluateRfqVisibility(
  membership: AuthMembership | null,
  rfq: Pick<RfqRef, 'organizationId'>,
): AuthorizationCode | null {
  if (!membership) return 'NO_ORGANIZATION'
  return membership.organizationId === rfq.organizationId ? null : 'FORBIDDEN'
}

// ── Mensajes ────────────────────────────────────────────────────────────────

export const RFQ_MESSAGES = {
  sinCapacidad: 'No tienes permisos para gestionar cotizaciones.',
  sinCapacidadEnOrganizacion:
    'No tienes permisos para crear o gestionar cotizaciones en esta organización.',
  sinAcceso: 'No tienes acceso a esta cotización.',
  transicionInvalida: 'No se puede realizar ese cambio de estado.',
  finalizada: 'Esta cotización ya no se puede modificar.',
  datosInternos: 'No se pueden modificar los datos internos de la cotización.',
  generico: 'No se ha podido completar la operación.',
} as const

export interface DatabaseErrorLike {
  code?: string | null
  message?: string | null
}

/**
 * Traduce un error de base de datos a un mensaje mostrable. Nunca devuelve
 * SQLSTATE, nombres de policy o de trigger, ni texto interno de PostgreSQL.
 */
export function translateRfqError(error: DatabaseErrorLike | null | undefined): string {
  if (!error) return RFQ_MESSAGES.generico

  const texto = (error.message ?? '').toLowerCase()

  if (texto.includes('ya no se puede modificar')) return RFQ_MESSAGES.finalizada
  if (texto.includes('cambio de estado')) return RFQ_MESSAGES.transicionInvalida
  if (texto.includes('datos internos')) return RFQ_MESSAGES.datosInternos

  // Violación de RLS: la fila existe pero no es suya, o le falta capacidad.
  if (texto.includes('row-level security') || error.code === '42501') {
    return RFQ_MESSAGES.sinAcceso
  }

  return RFQ_MESSAGES.generico
}

/** Detalle técnico para el registro del servidor. Sin datos personales. */
export function rfqErrorDetail(
  operacion: string,
  error: DatabaseErrorLike | null | undefined,
): string {
  return `[rfq] ${operacion} falló: ${error?.code ?? 'sin código'} ${error?.message ?? ''}`.trim()
}

// Estado de acceso organizativo (Bloque 6B.5.1).
//
// Módulo PURO. No decide nada nuevo sobre seguridad: 6B.5 ya dejó las reglas en
// `policy.ts` y SQL las impone. Lo que añade este módulo es la capacidad de
// EXPLICAR por qué alguien no puede operar, en lugar de meterlo todo en el
// mismo saco.
//
// El problema que corrige: `getActiveOrg()` y `getMyOrganization()` devolvían
// `no_org` tanto para «no perteneces a ninguna empresa» como para «tu acceso
// está suspendido». La pantalla decía entonces «No tienes una organización
// asignada» a alguien que sí la tiene y que solo necesita saber que su acceso
// está suspendido y a quién escribir.
//
// Los estados corresponden UNO A UNO con los valores reales del esquema:
//   profiles.status              pending | active | suspended | rejected
//   organization_members.status  invited | active | suspended
//   organizations.status         pending | active | suspended | rejected
//
// No se inventa ningún valor. `organization_members` NO tiene 'pending': la
// invitación se representa con 'invited'.

import type { AuthorizationCode } from './errors'
import { resolveFallbackMembership } from './membership'
import type { AuthContext, AuthMembership } from './types'

/**
 * Por qué alguien puede o no operar sobre su organización.
 *
 * `active` es el único estado que autoriza. Todos los demás deniegan y se
 * distinguen únicamente para elegir el mensaje y la redirección correctos.
 */
export type OrganizationAccessState =
  /** Pertenencia activa, perfil activo y organización activa. */
  | 'active'
  /** El usuario no pertenece a ninguna organización. */
  | 'no_membership'
  /** `profiles.status` distinto de 'active'. */
  | 'profile_inactive'
  /** `organizations.status` distinto de 'active'. */
  | 'organization_inactive'
  /** `organization_members.status = 'invited'`: invitación sin aceptar. */
  | 'membership_invited'
  /** `organization_members.status = 'suspended'`. */
  | 'membership_suspended'
  /** Estado de pertenencia no reconocido. Fail-closed. */
  | 'membership_inactive'
  /** Sin sesión o contexto ilegible. Fail-closed. */
  | 'invalid_context'

/**
 * Textos visibles. Ninguno menciona columnas, estados internos, RLS, policies,
 * triggers ni mensajes de PostgreSQL: hay un test que lo comprueba.
 */
export const ORGANIZATION_ACCESS_MESSAGES: Record<OrganizationAccessState, string> = {
  active: '',
  no_membership: 'Todavía no tienes una organización asociada.',
  profile_inactive:
    'Tu cuenta no tiene acceso activo a esta función. Puedes contactar con soporte si necesitas ayuda.',
  organization_inactive:
    'Esta organización no está activa actualmente. Contacta con soporte para obtener más información.',
  membership_invited: 'Tu acceso a esta organización está pendiente de activación.',
  membership_suspended:
    'Tu acceso a esta organización está suspendido. Puedes contactar con soporte si necesitas ayuda.',
  membership_inactive: 'Tu acceso a esta organización no está activo actualmente.',
  invalid_context: 'No hemos podido comprobar tu acceso a la organización.',
}

export interface OrganizationAccess {
  state: OrganizationAccessState
  /**
   * La pertenencia resuelta, AUNQUE esté inactiva.
   *
   * Solo es `null` cuando de verdad no existe ninguna. Devolver `null` para una
   * pertenencia suspendida era justamente lo que hacía que una suspensión se
   * presentara como ausencia de organización.
   */
  membership: AuthMembership | null
  /** Únicamente `state === 'active'`. Nada más autoriza a escribir. */
  canOperate: boolean
  /** Texto para la persona. Vacío cuando el acceso es activo. */
  message: string
  /** Detalle para el registro del servidor. Sin datos personales. */
  detail: string
}

/**
 * Clasifica el acceso de una pertenencia ya resuelta.
 *
 * ORDEN DE COMPROBACIÓN, de lo más amplio a lo más concreto:
 *
 *   1. contexto      — sin sesión no hay nada que explicar;
 *   2. pertenencia   — si no existe, no hay organización de la que hablar;
 *   3. perfil        — tu cuenta;
 *   4. organización  — tu empresa;
 *   5. tu asiento    — tu pertenencia concreta.
 *
 * El orden solo elige QUÉ mensaje se muestra: todos los estados salvo `active`
 * deniegan por igual. Se resuelve de fuera hacia dentro porque una organización
 * suspendida no la arregla el usuario contactando con su administrador, y
 * decirle «tu acceso está suspendido» le mandaría a la puerta equivocada.
 */
export function resolveOrganizationAccess(
  context: AuthContext | null,
  membership: AuthMembership | null,
): OrganizationAccess {
  const construir = (state: OrganizationAccessState, detail: string): OrganizationAccess => ({
    state,
    membership,
    canOperate: state === 'active',
    message: ORGANIZATION_ACCESS_MESSAGES[state],
    detail,
  })

  if (!context) return construir('invalid_context', 'sin sesión')
  if (!membership) return construir('no_membership', 'sin pertenencias')

  if (context.profileStatus !== 'active') {
    return construir('profile_inactive', `perfil=${context.profileStatus ?? 'desconocido'}`)
  }

  if (membership.organizationStatus !== 'active') {
    return construir(
      'organization_inactive',
      `organización=${membership.organizationStatus ?? 'desconocido'}`,
    )
  }

  switch (membership.membershipStatus) {
    case 'active':
      return construir('active', 'acceso activo')
    case 'invited':
      return construir('membership_invited', 'pertenencia=invited')
    case 'suspended':
      return construir('membership_suspended', 'pertenencia=suspended')
    default:
      // `normalizeMembershipStatus` devuelve null ante un valor que no
      // reconoce. Nunca se asume activo.
      return construir('membership_inactive', 'pertenencia=desconocida')
  }
}

/**
 * Atajo desde el contexto completo: resuelve la pertenencia con el criterio
 * determinista de 6B.5 —que ya prefiere una activa cuando hay varias, y
 * conserva la mejor inactiva cuando no hay ninguna— y la clasifica.
 */
export function resolveOrganizationAccessFromContext(
  context: AuthContext | null,
): OrganizationAccess {
  if (!context) return resolveOrganizationAccess(null, null)
  return resolveOrganizationAccess(context, resolveFallbackMembership(context.memberships))
}

/** Traducción al código de autorización, para las superficies que lo necesiten. */
export function accessAuthorizationCode(
  access: OrganizationAccess,
): AuthorizationCode | null {
  if (access.state === 'active') return null
  if (access.state === 'invalid_context') return 'UNAUTHENTICATED'
  if (access.state === 'no_membership') return 'NO_ORGANIZATION'
  return 'FORBIDDEN'
}

// ── Edición de la organización ──────────────────────────────────────────────

export const ORGANIZATION_EDIT_MESSAGES = {
  soloPropietario: 'Solo el propietario de la organización puede editar estos datos.',
  organizacionDistinta: 'No tienes acceso a esa organización.',
  noGuardado:
    'No se han podido guardar los cambios. Es posible que tu acceso haya cambiado; vuelve a intentarlo.',
  generico: 'No se han podido guardar los cambios.',
} as const

/**
 * ¿Puede este actor editar los datos de la organización?
 *
 * Devuelve el MENSAJE que debe verse, o `null` si se permite. Concentra aquí
 * las tres condiciones —acceso activo, rol de propietario y organización
 * objetivo correcta— para que la Server Action no vuelva a componerlas a mano.
 *
 * No reimplementa ninguna regla de autorización: consume `resolveOrganizationAccess`,
 * que a su vez refleja lo que imponen `is_org_owner()` y las policies.
 */
export function evaluateOrganizationEdit(
  access: OrganizationAccess,
  esPropietario: boolean,
  targetOrganizationId?: string | null,
): string | null {
  if (!access.canOperate) return access.message
  if (!esPropietario) return ORGANIZATION_EDIT_MESSAGES.soloPropietario

  if (targetOrganizationId && targetOrganizationId !== access.membership?.organizationId) {
    return ORGANIZATION_EDIT_MESSAGES.organizacionDistinta
  }

  return null
}

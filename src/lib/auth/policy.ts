// Reglas de autorización de MIRA (Bloque 6B.1).
//
// Módulo puro: cada función recibe un contexto ya cargado y devuelve `null` si
// la comprobación pasa, o el `AuthorizationCode` que explica por qué no. No
// redirige, no lanza y no consulta nada — así se puede probar exhaustivamente
// sin red y sin Next, y las tres superficies (página, Server Action, Route
// Handler) comparten exactamente la misma decisión.
//
// ALCANCE 6B.1: solo `requireSession` y `requirePlatformAdmin` están
// conectados a rutas y acciones. Las evaluaciones de estado y de capacidad
// comercial existen y están probadas, pero NINGÚN guard las invoca todavía:
// se conectan en 6B.2 (estados), 6B.4 (capacidades) y 6B.5 (middleware).

import { isOrgAdmin, isOwner, type OrganizationRole } from '@/lib/identity'
import type { AuthorizationCode } from './errors'
import type { AuthContext, AuthMembership } from './types'

/** Hay sesión utilizable. */
export function evaluateSession(context: AuthContext | null): AuthorizationCode | null {
  if (!context) return 'UNAUTHENTICATED'
  return null
}

/**
 * Administrador de plataforma.
 *
 * Un rol que no se reconoce devuelve `INVALID_ROLE`, no `FORBIDDEN`: ambos
 * deniegan igual, pero distinguirlos hace visible en los registros que hay un
 * valor corrupto en base de datos en lugar de un usuario normal.
 */
export function evaluatePlatformAdmin(context: AuthContext | null): AuthorizationCode | null {
  const sinSesion = evaluateSession(context)
  if (sinSesion) return sinSesion

  const role = context!.platformRole
  if (role === null) return 'INVALID_ROLE'
  if (role !== 'platform_admin') return 'FORBIDDEN'
  return null
}

/** Existe una pertenencia utilizable. */
export function evaluateMembership(membership: AuthMembership | null): AuthorizationCode | null {
  if (!membership) return 'NO_ORGANIZATION'
  return null
}

/**
 * Rol organizativo mínimo, jerárquico: owner ⊃ admin ⊃ member.
 * Reutiliza `isOwner` / `isOrgAdmin` de `identity.ts`, que ya aceptan tanto el
 * valor canónico como el legacy (`client_owner`).
 */
export function evaluateOrganizationRole(
  membership: AuthMembership | null,
  minimum: OrganizationRole,
): AuthorizationCode | null {
  const sinOrg = evaluateMembership(membership)
  if (sinOrg) return sinOrg

  const role = membership!.orgRole
  if (role === null) return 'INVALID_ROLE'

  if (minimum === 'owner') return isOwner(role) ? null : 'FORBIDDEN'
  if (minimum === 'admin') return isOrgAdmin(role) ? null : 'FORBIDDEN'
  return null // 'member': cualquier rol reconocido basta
}

// ── Traducción a la respuesta de cada superficie ────────────────────────────

/**
 * Cómo responde una superficie que NAVEGA (página o Server Action) cuando hay
 * sesión pero no permiso de administrador. Cada llamada conserva el
 * comportamiento que ya tenía esa superficie antes de 6B.1.
 */
export type AdminDenial = 'redirect-dashboard' | 'redirect-login' | 'throw'

/**
 * Destino de la redirección, o `null` si esa superficie debe lanzar en lugar
 * de navegar. Función pura para poder probar el reparto sin Next.
 */
export function adminDenialTarget(onDeny: AdminDenial): string | null {
  if (onDeny === 'throw') return null
  return onDeny === 'redirect-login' ? '/login' : '/app/dashboard'
}

// ── Preparadas para bloques posteriores — NO conectadas en 6B.1 ─────────────

/** 6B.5. Estado global del usuario. */
export function evaluateActiveProfile(context: AuthContext | null): AuthorizationCode | null {
  const sinSesion = evaluateSession(context)
  if (sinSesion) return sinSesion
  return context!.profileStatus === 'active' ? null : 'FORBIDDEN'
}

/** 6B.5. Estado de la organización de la pertenencia. */
export function evaluateActiveOrganization(
  membership: AuthMembership | null,
): AuthorizationCode | null {
  const sinOrg = evaluateMembership(membership)
  if (sinOrg) return sinOrg
  return membership!.organizationStatus === 'active' ? null : 'FORBIDDEN'
}

/** 6B.5. Estado de la pertenencia. `invited` todavía no da acceso. */
export function evaluateActiveMembership(
  membership: AuthMembership | null,
): AuthorizationCode | null {
  const sinOrg = evaluateMembership(membership)
  if (sinOrg) return sinOrg
  return membership!.membershipStatus === 'active' ? null : 'FORBIDDEN'
}

export type CommercialCapability = 'buy' | 'sell'

/**
 * 6B.4. Capacidad comercial del miembro, limitada por el perfil comercial de
 * la organización: una empresa `buyer` no puede habilitar la venta a nadie,
 * por mucho que la fila del miembro tenga `can_sell = true`.
 */
export function evaluateCapability(
  membership: AuthMembership | null,
  capability: CommercialCapability,
): AuthorizationCode | null {
  const sinOrg = evaluateMembership(membership)
  if (sinOrg) return sinOrg

  const m = membership!
  const techo =
    capability === 'buy'
      ? m.commercialProfile === 'buyer' || m.commercialProfile === 'buyer_seller'
      : m.commercialProfile === 'seller' || m.commercialProfile === 'buyer_seller'

  const propia = capability === 'buy' ? m.canBuy : m.canSell
  return techo && propia ? null : 'FORBIDDEN'
}

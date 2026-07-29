// Reglas de autorización de MIRA (Bloque 6B.1).
//
// Módulo puro: cada función recibe un contexto ya cargado y devuelve `null` si
// la comprobación pasa, o el `AuthorizationCode` que explica por qué no. No
// redirige, no lanza y no consulta nada — así se puede probar exhaustivamente
// sin red y sin Next, y las tres superficies (página, Server Action, Route
// Handler) comparten exactamente la misma decisión.
//
// ALCANCE 6B.5: las evaluaciones de estado y de capacidad comercial YA están
// conectadas, a través de `evaluateOrganizationAccess` y
// `evaluateCommercialAction`, que son las dos únicas entradas que deben usar
// los guards. Hasta 6B.4 existían y estaban probadas, pero ningún guard las
// invocaba: la interfaz ofrecía acciones que RLS después rechazaba.
//
// Correspondencia con SQL, que es la autoridad:
//   evaluateOrganizationAccess → is_org_member(uuid)
//   evaluateCapability         → can_buy_in_org(uuid) / can_sell_in_org(uuid)
//   evaluateOrganizationRole   → is_org_owner(uuid) / is_org_admin(uuid)
//   evaluatePlatformAdmin      → is_platform_admin()   (ver salvedad en 6B.5)

import { isOrgAdmin, isOwner, type OrganizationRole, type PlatformRole } from '@/lib/identity'
import type { AuthorizationCode } from './errors'
import type { AuthContext, AuthMembership } from './types'

/** Hay sesión utilizable. */
export function evaluateSession(context: AuthContext | null): AuthorizationCode | null {
  if (!context) return 'UNAUTHENTICATED'
  return null
}

/**
 * Decisión mínima sobre el rol global. Recibe el rol YA normalizado.
 *
 * Existe aparte de `evaluatePlatformAdmin` porque el middleware corre en el
 * Edge Runtime y no puede construir un `AuthContext` completo (no tiene acceso
 * a `next/headers`). Ambas superficies comparten así exactamente el mismo
 * criterio en lugar de reimplementarlo.
 *
 * FAIL-CLOSED: `null` —rol desconocido, perfil ausente o consulta con error—
 * devuelve `INVALID_ROLE` y por tanto DENIEGA. Un error nunca es un permiso.
 *
 * Se distingue `INVALID_ROLE` de `FORBIDDEN` porque ambos deniegan igual, pero
 * el primero hace visible en los registros que hay un valor corrupto o una
 * consulta fallida, y no simplemente un usuario normal.
 */
export function evaluatePlatformRole(
  platformRole: PlatformRole | null,
): AuthorizationCode | null {
  if (platformRole === null) return 'INVALID_ROLE'
  if (platformRole !== 'platform_admin') return 'FORBIDDEN'
  return null
}

/**
 * Administrador de plataforma, a partir del contexto completo.
 *
 * Espejo exacto de `is_platform_admin()`, que desde 021 exige LAS DOS cosas:
 * `p.role = 'platform_admin'` Y `p.status = 'active'`. Hasta 6B.5 este guard
 * solo miraba el rol, así que un administrador suspendido veía el panel entero
 * y cada consulta le fallaba por RLS. Suspender debe retirar permisos de
 * verdad, no solo dejar de mostrarlos.
 *
 * El orden importa para los registros: primero se distingue «no eres
 * administrador» (`FORBIDDEN` / `INVALID_ROLE`) y solo después se comprueba el
 * estado, para que un rol corrupto no se confunda con una suspensión.
 */
export function evaluatePlatformAdmin(context: AuthContext | null): AuthorizationCode | null {
  const sinSesion = evaluateSession(context)
  if (sinSesion) return sinSesion

  const sinRol = evaluatePlatformRole(context!.platformRole)
  if (sinRol) return sinRol

  return evaluateActiveProfile(context)
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

/**
 * 6B.5. Espejo exacto de `is_org_member(uuid)`: pertenencia ACTIVA en una
 * organización ACTIVA.
 *
 * Es la unidad mínima de acceso organizativo. Todo lo demás —roles, capacidades,
 * lectura del histórico— se compone a partir de aquí, igual que las cinco
 * funciones SQL se apoyan en el mismo `where`.
 *
 * `profiles.status` NO entra: `is_org_member()` tampoco lo mira. El estado del
 * perfil se evalúa aparte, con `evaluateActiveProfile`.
 */
export function evaluateOrganizationAccess(
  membership: AuthMembership | null,
): AuthorizationCode | null {
  const sinOrg = evaluateMembership(membership)
  if (sinOrg) return sinOrg

  return evaluateActiveMembership(membership) ?? evaluateActiveOrganization(membership)
}

export type CommercialCapability = 'buy' | 'sell'

/**
 * 6B.4/6B.5. Capacidad comercial del miembro. Espejo de `can_buy_in_org(uuid)`
 * y `can_sell_in_org(uuid)`, que exigen las CUATRO condiciones a la vez:
 *
 *   om.status = 'active'  ·  o.status = 'active'
 *   om.can_buy/can_sell   ·  o.commercial_profile admite la capacidad
 *
 * Hasta 6B.5 esta función solo comprobaba las dos últimas. Los estados activos
 * se daban por supuestos, y la interfaz ofrecía acciones que RLS después
 * rechazaba. El perfil comercial de la organización sigue siendo el techo: una
 * empresa `buyer` no habilita la venta a nadie, por mucho que la fila del
 * miembro tenga `can_sell = true`.
 */
export function evaluateCapability(
  membership: AuthMembership | null,
  capability: CommercialCapability,
): AuthorizationCode | null {
  const sinAcceso = evaluateOrganizationAccess(membership)
  if (sinAcceso) return sinAcceso

  const m = membership!
  const techo =
    capability === 'buy'
      ? m.commercialProfile === 'buyer' || m.commercialProfile === 'buyer_seller'
      : m.commercialProfile === 'seller' || m.commercialProfile === 'buyer_seller'

  const propia = capability === 'buy' ? m.canBuy : m.canSell
  return techo && propia ? null : 'FORBIDDEN'
}

/**
 * 6B.5. Decisión COMPLETA para ejecutar una acción comercial: sesión, perfil
 * activo y capacidad vigente sobre la organización.
 *
 * Es la única entrada que deben usar los guards. Añade sobre `evaluateCapability`
 * la comprobación del estado del PERFIL, que ninguna función SQL hace hoy:
 * `can_buy_in_org()` mira la pertenencia y la organización, no `profiles.status`.
 * La aplicación es aquí deliberadamente MÁS estricta que la base de datos —
 * suspender a una persona debe retirarle las acciones comerciales—, y ser más
 * estricto que RLS nunca abre una puerta, solo cierra una que SQL dejaba pasar.
 */
export function evaluateCommercialAction(
  context: AuthContext | null,
  membership: AuthMembership | null,
  capability: CommercialCapability,
): AuthorizationCode | null {
  const perfil = evaluateActiveProfile(context)
  if (perfil) return perfil

  return evaluateCapability(membership, capability)
}

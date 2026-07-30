// Guards de autorización (Bloque 6B.1).
//
// SOLO SERVIDOR. Sustituyen a las 14 comprobaciones duplicadas de
// `platform_admin` que existían repartidas por Server Actions, páginas y Route
// Handlers, cada una con su propio comportamiento.
//
// La DECISIÓN vive en `policy.ts` y es única. La RESPUESTA sigue siendo la
// propia de cada superficie, y se elige explícitamente en la llamada:
//
//   página          → redirige (nunca JSON)
//   Server Action   → redirige si no hay sesión, lanza AuthorizationError si
//                     no hay permiso, o devuelve el error como valor
//   Route Handler   → JSON 401/403 (nunca redirige)
//
// 6B.5 conecta los estados. `requireMembership` exige pertenencia y
// organización ACTIVAS —el mismo criterio que `is_org_member(uuid)`— y
// `requireCommercialCapability` añade el perfil activo y la capacidad vigente.
// Ningún guard reconstruye esas combinaciones a mano: la decisión vive entera
// en `policy.ts` para que interfaz, acciones y SQL no puedan divergir.

import { redirect } from 'next/navigation'
import { AuthorizationError, type AuthorizationCode } from './errors'
import { getMembershipForOrganization, resolveFallbackMembership } from './membership'
import {
  adminDenialTarget,
  evaluateCommercialAction,
  evaluateOrganizationAccess,
  evaluateOrganizationModule,
  evaluatePlatformAdmin,
  evaluateSession,
  type AdminDenial,
  type CommercialCapability,
} from './policy'
import type { OrganizationModuleName } from './modules'
import { loadAuthContext, type ServerSupabaseClient } from './context'
import type { AuthContext, AuthMembership } from './types'

export interface AuthorizedSession {
  supabase: ServerSupabaseClient
  context: AuthContext
  userId: string
}

// El reparto de comportamientos vive en `policy.ts` (`AdminDenial`,
// `adminDenialTarget`), que es puro y por tanto testeable sin Next:
//
//   redirect-dashboard → /app/dashboard  (mayoría de acciones de admin)
//   redirect-login     → /login          (soporte y configuración)
//   throw              → AuthorizationError (acciones que informan en la UI)
export type { AdminDenial }

// Mensaje único para el modo `throw`, idéntico al que emitían los guards
// duplicados. El `code` conserva el motivo real para los registros.
const ADMIN_DENIED_MESSAGE = 'No tienes permiso de administrador'

function logDenial(surface: string, code: AuthorizationCode, userId: string | null) {
  console.warn(`[auth] ${surface} denegado (${code}) para ${userId ?? 'anónimo'}`)
}

/**
 * Exige sesión. Sin sesión redirige a /login, que es lo que hacían todas las
 * superficies no-API antes de 6B.1.
 */
export async function requireSession(): Promise<AuthorizedSession> {
  const { supabase, context } = await loadAuthContext()

  const fallo = evaluateSession(context)
  if (fallo || !context) {
    logDenial('sesión', fallo ?? 'UNAUTHENTICATED', null)
    redirect('/login')
  }

  return { supabase, context, userId: context.user.id }
}

/**
 * Exige rol global `platform_admin`.
 *
 * Sin sesión SIEMPRE redirige a /login. Sin permiso, según `onDeny`.
 */
export async function requirePlatformAdmin(
  onDeny: AdminDenial = 'redirect-dashboard',
): Promise<AuthorizedSession> {
  const { supabase, context } = await loadAuthContext()

  const fallo = evaluatePlatformAdmin(context)

  if (fallo === 'UNAUTHENTICATED' || !context) {
    logDenial('platform_admin', 'UNAUTHENTICATED', null)
    redirect('/login')
  }

  if (fallo) {
    logDenial('platform_admin', fallo, context.user.id)
    const destino = adminDenialTarget(onDeny)
    if (destino === null) throw new AuthorizationError(fallo, ADMIN_DENIED_MESSAGE)
    redirect(destino)
  }

  return { supabase, context, userId: context.user.id }
}

export interface ApiAuthorizationOk {
  ok: true
  supabase: ServerSupabaseClient
  context: AuthContext
  userId: string
}

export interface ApiAuthorizationFailure {
  ok: false
  error: AuthorizationError
}

/**
 * Variante para Route Handlers: nunca redirige ni lanza. Quien llama traduce
 * el error a JSON con `authorizationHttpStatus` / `authorizationApiMessage`.
 */
export async function authorizePlatformAdminApi(): Promise<
  ApiAuthorizationOk | ApiAuthorizationFailure
> {
  const { supabase, context } = await loadAuthContext()

  const fallo = evaluatePlatformAdmin(context)
  if (fallo || !context) {
    const code = fallo ?? 'UNAUTHENTICATED'
    logDenial('api platform_admin', code, context?.user.id ?? null)
    return { ok: false, error: new AuthorizationError(code) }
  }

  return { ok: true, supabase, context, userId: context.user.id }
}

/**
 * Resuelve la pertenencia con la que operar.
 *
 * Con `organizationId` la resolución es explícita. Sin él se usa el fallback
 * determinista de `membership.ts` — temporal, hasta que exista un selector de
 * organización visible.
 *
 * NO redirige ni lanza: devuelve `null` para que quien llama responda según su
 * contrato (una página redirige, una acción devuelve `{ error }`).
 */
export function resolveMembership(
  context: AuthContext,
  organizationId?: string | null,
): AuthMembership | null {
  return organizationId
    ? getMembershipForOrganization(context.memberships, organizationId)
    : resolveFallbackMembership(context.memberships)
}

export interface AuthorizedMembership extends AuthorizedSession {
  membership: AuthMembership
}

/**
 * Opciones comunes de los guards de organización.
 *
 * `module` (1.4) exige además que la organización tenga contratado ese módulo.
 * El orden de evaluación es siempre el mismo y NO es arbitrario:
 *
 *   1. acceso a la organización — de una empresa a la que no perteneces no se
 *      informa de su configuración;
 *   2. módulo — es un hecho de la EMPRESA y domina sobre el permiso personal:
 *      a quien tiene `can_buy` en una organización sin el módulo hay que
 *      decirle que su empresa no lo tiene, no que le faltan permisos;
 *   3. capacidad personal.
 */
export interface OrganizationGuardOptions {
  module?: OrganizationModuleName
}

/**
 * Exige sesión y una pertenencia UTILIZABLE, y devuelve todo junto: cliente de
 * Supabase, contexto y pertenencia resuelta.
 *
 * Evita el patrón que se repetía en las acciones de cotizaciones —`getUser()`
 * seguido de `getActiveOrg()`—, que cargaba la sesión dos veces.
 *
 * «Utilizable» es exactamente lo que entiende `is_org_member(uuid)`: pertenencia
 * activa en organización activa. Hasta 6B.5 bastaba con que la fila existiera,
 * así que una suspensión llegaba hasta la consulta y RLS la devolvía vacía; la
 * pantalla mostraba «aún no tienes cotizaciones» en lugar de decir la verdad.
 *
 * NO redirige: lanza `AuthorizationError` para que cada superficie responda
 * según su contrato.
 */
export async function requireMembership(
  organizationId?: string | null,
  options?: OrganizationGuardOptions,
): Promise<AuthorizedMembership> {
  const sesion = await requireSession()
  const membership = resolveMembership(sesion.context, organizationId)

  const fallo =
    evaluateOrganizationAccess(membership) ??
    (options?.module ? evaluateOrganizationModule(membership, options.module) : null)

  if (fallo || !membership) {
    logDenial('pertenencia', fallo ?? 'NO_ORGANIZATION', sesion.userId)
    throw new AuthorizationError(fallo ?? 'NO_ORGANIZATION')
  }

  return { ...sesion, membership }
}

/**
 * Exige una capacidad comercial vigente sobre la organización.
 *
 * Decisión única y completa (ver `evaluateCommercialAction`): perfil activo,
 * pertenencia activa, organización activa, techo comercial y flag del miembro.
 * Es el mismo criterio que aplican `can_buy_in_org()` y `can_sell_in_org()`,
 * más el estado del perfil, que SQL no comprueba y el producto sí exige.
 *
 * Se evalúa en CADA acción, no al pintar la página: una suspensión que ocurra
 * mientras el formulario está abierto bloquea igualmente el envío.
 */
export async function requireCommercialCapability(
  capability: CommercialCapability,
  organizationId?: string | null,
  options?: OrganizationGuardOptions,
): Promise<AuthorizedMembership> {
  const sesion = await requireSession()
  const membership = resolveMembership(sesion.context, organizationId)

  // El módulo se evalúa ANTES que la capacidad: ver `OrganizationGuardOptions`.
  const fallo =
    (options?.module
      ? evaluateOrganizationAccess(membership) ??
        evaluateOrganizationModule(membership, options.module)
      : null) ?? evaluateCommercialAction(sesion.context, membership, capability)
  if (fallo || !membership) {
    logDenial(`capacidad ${capability}`, fallo ?? 'NO_ORGANIZATION', sesion.userId)
    throw new AuthorizationError(fallo ?? 'NO_ORGANIZATION')
  }

  return { ...sesion, membership }
}

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
// 6B.1 NO aplica estados de perfil/organización/pertenencia ni capacidades
// comerciales. Esas evaluaciones existen en `policy.ts` pero ningún guard las
// invoca: se conectan en 6B.2, 6B.4 y 6B.5.

import { redirect } from 'next/navigation'
import { AuthorizationError, type AuthorizationCode } from './errors'
import { getMembershipForOrganization, resolveFallbackMembership } from './membership'
import { adminDenialTarget, evaluatePlatformAdmin, evaluateSession, type AdminDenial } from './policy'
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

// Carga del contexto de autorización (Bloque 6B.1).
//
// SOLO SERVIDOR. Usa el cliente normal de Supabase (clave anónima + cookies de
// sesión), nunca la service role: todo lo que lee aquí queda sujeto a RLS, que
// sigue siendo la última línea de defensa. Un guard que decidiera con service
// role estaría confiando en sí mismo en lugar de en la base de datos.
//
// ── Sobre la caché por request ──────────────────────────────────────────────
//
// Se ha evaluado `React.cache()` y se ha DESCARTADO en 6B.1. `cache()` está
// garantizado dentro del render de React (Server Components); su alcance en
// Server Actions y Route Handlers, que son justamente el 90 % de las
// superficies que este bloque refactoriza, no está garantizado por Next. Una
// caché que funciona en unas superficies y en otras no es peor que ninguna:
// invita a asumir un ahorro que no ocurre.
//
// En su lugar, el contexto se carga UNA vez por guard y se DEVUELVE, para que
// quien llama lo reutilice explícitamente junto con el cliente de Supabase ya
// creado. El coste queda igual que antes de 6B.1: una acción administrativa
// hacía `getUser()` + 1 consulta y sigue haciendo `getUser()` + 2 consultas
// lanzadas EN PARALELO, así que la latencia no crece.
//
// Nada de esto es una caché entre requests: no existe estado compartido entre
// peticiones ni entre usuarios.

import {
  normalizeCommercialProfile,
  normalizeMembershipStatus,
  normalizeOrganizationRole,
  normalizeOrganizationStatus,
  normalizePlatformRole,
  normalizeProfileStatus,
} from '@/lib/identity'
import { createClient } from '@/lib/supabase/server'
import type { AuthContext, AuthMembership } from './types'

export type ServerSupabaseClient = Awaited<ReturnType<typeof createClient>>

/** Forma cruda de la fila de pertenencia con la organización embebida. */
interface RawMembership {
  organization_id: string | null
  role: string | null
  org_role: string | null
  can_buy: boolean | null
  can_sell: boolean | null
  status: string | null
  joined_at: string | null
  organization:
    | { id: string; name: string | null; status: string | null; commercial_profile: string | null }
    | { id: string; name: string | null; status: string | null; commercial_profile: string | null }[]
    | null
}

function toMembership(raw: RawMembership): AuthMembership | null {
  if (!raw?.organization_id) return null

  const org = Array.isArray(raw.organization) ? (raw.organization[0] ?? null) : raw.organization

  return {
    organizationId: raw.organization_id,
    organizationName: org?.name ?? '',
    // Prioriza el modelo canónico y cae al legacy mientras dure la transición.
    orgRole: normalizeOrganizationRole(raw.org_role ?? raw.role),
    membershipStatus: normalizeMembershipStatus(raw.status),
    // Solo `true` estricto concede la capacidad.
    canBuy: raw.can_buy === true,
    canSell: raw.can_sell === true,
    joinedAt: raw.joined_at ?? '',
    organizationStatus: normalizeOrganizationStatus(org?.status),
    commercialProfile: normalizeCommercialProfile(org?.commercial_profile),
  }
}

/**
 * Carga el contexto completo del usuario que hace la petición.
 *
 * Devuelve `null` si no hay sesión. NUNCA lanza ni redirige: la reacción ante
 * un fallo es responsabilidad de cada superficie (ver `guards.ts`).
 *
 * Si el perfil no existiera, `platformRole` y `profileStatus` quedan en `null`
 * y toda comprobación deniega — fail-closed.
 */
export async function getAuthContext(
  supabase: ServerSupabaseClient,
): Promise<AuthContext | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  // En paralelo: la latencia es la de la consulta más lenta, no la suma.
  const [profileResult, membershipsResult] = await Promise.all([
    supabase.from('profiles').select('role, status').eq('id', user.id).single(),
    supabase
      .from('organization_members')
      .select(
        `organization_id, role, org_role, can_buy, can_sell, status, joined_at,
         organization:organizations(id, name, status, commercial_profile)`,
      )
      .eq('user_id', user.id),
  ])

  // Un error al cargar pertenencias NO puede confundirse con "no tiene
  // ninguna": se registra y se devuelve la lista vacía, que deniega igual pero
  // deja rastro.
  if (membershipsResult.error) {
    console.error('[auth] error al cargar pertenencias:', membershipsResult.error.message)
  }

  const rawMemberships = (membershipsResult.data ?? []) as unknown as RawMembership[]

  return {
    user: { id: user.id, email: user.email ?? null },
    platformRole: normalizePlatformRole(profileResult.data?.role),
    profileStatus: normalizeProfileStatus(profileResult.data?.status),
    memberships: rawMemberships
      .map(toMembership)
      .filter((m): m is AuthMembership => m !== null),
  }
}

/**
 * Atajo para las superficies que aún no tienen un cliente de Supabase creado.
 * Devuelve también el cliente para que quien llama lo reutilice en lugar de
 * crear otro.
 */
export async function loadAuthContext(): Promise<{
  supabase: ServerSupabaseClient
  context: AuthContext | null
}> {
  const supabase = await createClient()
  return { supabase, context: await getAuthContext(supabase) }
}

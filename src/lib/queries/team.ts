// Lectura del equipo de la propia organización (Bloque 1 · portal cliente).
//
// SOLO SERVIDOR. Es el lector de `/app/mi-organizacion/equipo`; todo lo que
// ESCRIBE vive en `lib/actions/team.ts`, igual que en el panel de MIRA se
// separan `queries/users.ts` y `actions/user-admin.ts`.
//
// ── Las tres puertas, en este orden ────────────────────────────────────────
//
//   1. sesión y pertenencia utilizable   → `resolveOrganizationAccessFromContext`
//   2. rol suficiente para gestionar     → `canManageTeam` (owner | admin)
//   3. RLS                               → `members_same_org_select`
//
// La segunda no sustituye a la tercera: aunque alguien saltara esta función,
// PostgREST solo le devolvería las pertenencias de su propia organización.

import { loadAuthContext } from '@/lib/auth/context'
import {
  resolveOrganizationAccessFromContext,
  type OrganizationAccess,
} from '@/lib/auth/access'
import { canManageTeam, type TeamActor } from '@/lib/auth/team'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import {
  normalizeMembershipStatus,
  normalizeOrganizationRole,
  type CommercialProfile,
  type MembershipStatus,
  type OrganizationRole,
} from '@/lib/identity'

export interface TeamMemberView {
  /** Identificador de la PERTENENCIA, no del usuario. Es lo que se modifica. */
  id: string
  userId: string
  firstName: string | null
  lastName: string | null
  /** Vacío cuando no se ha podido resolver. Nunca se inventa. */
  email: string
  orgRole: OrganizationRole | null
  status: MembershipStatus | null
  canBuy: boolean
  canSell: boolean
  joinedAt: string
}

export type TeamResult =
  /** No pertenece a ninguna organización. */
  | { status: 'no_org' }
  /** Pertenece, pero su acceso no está activo. */
  | { status: 'inactive'; access: OrganizationAccess }
  /** Acceso activo, pero es `member`: no gestiona a nadie. */
  | { status: 'forbidden' }
  | {
      status: 'ok'
      organizationId: string
      organizationName: string
      commercialProfile: CommercialProfile | null
      actorUserId: string
      actorRole: OrganizationRole | null
      members: TeamMemberView[]
    }

interface MemberRow {
  id: string
  user_id: string
  role: string | null
  org_role: string | null
  status: string | null
  can_buy: boolean | null
  can_sell: boolean | null
  joined_at: string
  profile: { first_name: string | null; last_name: string | null } | null
}

/**
 * Correos de un conjunto CERRADO de usuarios.
 *
 * ── Por qué aquí sí se usa el cliente privilegiado ─────────────────────────
 *
 * `profiles` no guarda el correo: vive en `auth.users`, que ninguna sesión de
 * cliente puede leer. Sin esto la columna «Email» quedaría siempre vacía.
 *
 * ── Por qué no es un IDOR ──────────────────────────────────────────────────
 *
 * Los identificadores NO vienen de la petición: son exactamente los que ha
 * devuelto la consulta anterior, ya filtrada por RLS a la organización del
 * actor. Quien llama no puede pedir el correo de un usuario arbitrario porque
 * nunca elige la lista.
 *
 * Se resuelve id a id con `getUserById` en lugar de `listUsers()`: un equipo son
 * unas pocas personas, y listar TODOS los usuarios de la plataforma para
 * quedarse con tres sería traer a memoria mucho más de lo que se necesita.
 */
async function resolverCorreos(userIds: string[]): Promise<Record<string, string>> {
  if (userIds.length === 0) return {}

  const admin = await createSupabaseAdminClient()
  const salida: Record<string, string> = {}

  const resultados = await Promise.all(
    userIds.map(async (id) => {
      const { data, error } = await admin.auth.admin.getUserById(id)
      if (error) {
        console.error(`[equipo] no se pudo resolver el correo de ${id}: ${error.message}`)
        return null
      }
      return { id, email: data.user?.email ?? '' }
    }),
  )

  for (const r of resultados) {
    if (r?.email) salida[r.id] = r.email
  }
  return salida
}

/**
 * Equipo de la organización del usuario actual, para gestionarlo.
 *
 * Devuelve `forbidden` —y no una lista vacía— cuando el actor es `member`: una
 * lista vacía se leería como «no hay compañeros», que es falso.
 */
export async function getMyTeam(): Promise<TeamResult> {
  const { supabase, context } = await loadAuthContext()

  const access = resolveOrganizationAccessFromContext(context)
  if (access.state === 'no_membership') return { status: 'no_org' }
  if (!access.canOperate) return { status: 'inactive', access }

  const membership = access.membership!
  const actor: TeamActor = {
    userId: context!.user.id,
    orgRole: membership.orgRole,
    // El rol de plataforma NO entra: esta pantalla es la del cliente. Un
    // `platform_admin` gestiona clientes desde /admin, donde queda auditado.
    isPlatformAdmin: false,
  }

  if (!canManageTeam(actor)) return { status: 'forbidden' }

  // El embed DEBE desambiguarse: `organization_members` tiene DOS FK hacia
  // `profiles` (`user_id` e `invited_by`) y un `profile:profiles(...)` genérico
  // devuelve PGRST201 en vez de datos.
  const { data, error } = await supabase
    .from('organization_members')
    .select(`
      id, user_id, role, org_role, status, can_buy, can_sell, joined_at,
      profile:profiles!organization_members_user_id_fkey(first_name, last_name)
    `)
    .eq('organization_id', membership.organizationId)
    .order('joined_at', { ascending: true })

  if (error) {
    console.error(`[equipo] error al cargar el equipo: ${error.code ?? '?'} ${error.message}`)
  }

  const filas = (data ?? []) as unknown as MemberRow[]
  const correos = await resolverCorreos(filas.map((m) => m.user_id))

  const members: TeamMemberView[] = filas.map((m) => {
    const perfil = Array.isArray(m.profile) ? (m.profile[0] ?? null) : m.profile
    return {
      id: m.id,
      userId: m.user_id,
      firstName: perfil?.first_name ?? null,
      lastName: perfil?.last_name ?? null,
      email: correos[m.user_id] ?? '',
      // `org_role` manda; se cae al legacy `role` mientras dure la transición.
      orgRole: normalizeOrganizationRole(m.org_role ?? m.role),
      status: normalizeMembershipStatus(m.status),
      canBuy: m.can_buy === true,
      canSell: m.can_sell === true,
      joinedAt: m.joined_at,
    }
  })

  return {
    status: 'ok',
    organizationId: membership.organizationId,
    organizationName: membership.organizationName,
    // Ya viene normalizado desde `loadAuthContext`: es el mismo valor que
    // aplican `can_buy_in_org()` y `can_sell_in_org()`.
    commercialProfile: membership.commercialProfile,
    actorUserId: actor.userId,
    actorRole: membership.orgRole,
    members,
  }
}

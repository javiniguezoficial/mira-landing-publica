import { loadAuthContext } from '@/lib/auth/context'
import {
  ORGANIZATION_ACCESS_MESSAGES,
  resolveOrganizationAccessFromContext,
  type OrganizationAccess,
} from '@/lib/auth/access'
import type { OrganizationRole } from '@/lib/identity'

export type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'cancelled' | 'expired'

export interface ActiveOrg {
  id: string
  name: string
  subscription_status: SubscriptionStatus
  plan: { id: string; name: string; slug: string } | null
  /**
   * Rol canónico ya normalizado ('owner' | 'admin' | 'member'), o null si el
   * valor almacenado no se reconoce. Para mostrarlo por pantalla se usa
   * `organizationRoleLabel()` de `@/lib/identity`.
   */
  userRole: OrganizationRole | null
  memberCount: number
  /** Todas las organizaciones del usuario, para el futuro selector. */
  allOrgIds: string[]
}

export type UserOrgResult =
  /** No pertenece a ninguna organización. */
  | { status: 'no_org' }
  /** Pertenece, pero su acceso no está activo. `access` explica por qué. */
  | { status: 'inactive'; access: OrganizationAccess }
  | { status: 'ok'; org: ActiveOrg }

/**
 * Organización con la que opera el usuario.
 *
 * Antes de 6B.1 esto era `memberships[0]`: con más de una pertenencia, la
 * organización activa dependía del orden que devolviera Postgres, que no está
 * garantizado. Ahora la elección es determinista (owner > admin > member, luego
 * `joined_at`, luego `organization_id`).
 *
 * 6B.5.1: se distingue «no tienes organización» de «tu acceso no está activo».
 * Antes ambos casos devolvían `no_org` y la pantalla afirmaba algo falso a
 * quien sí pertenece a una empresa. El acceso se clasifica ANTES de consultar:
 * con una pertenencia suspendida, `is_org_member()` deniega el SELECT y la
 * consulta volvería vacía de todos modos.
 *
 * TEMPORAL: cuando el producto exponga multiempresa, esta función recibirá la
 * organización elegida por el usuario en lugar de deducirla.
 */
export async function getActiveOrg(): Promise<UserOrgResult> {
  const { supabase, context } = await loadAuthContext()

  const access = resolveOrganizationAccessFromContext(context)
  if (access.state === 'no_membership') return { status: 'no_org' }
  // `!context` ya produce `invalid_context`, que no opera; se comprueba aparte
  // para que el compilador lo sepa y no haya que forzar el tipo más abajo.
  if (!access.canOperate || !context) return { status: 'inactive', access }

  const membership = access.membership!

  // El embed DEBE desambiguarse con el nombre de la clave ajena: desde la
  // migración 026, `organizations` tiene DOS FK hacia `plans` —`plan_id` y
  // `requested_plan_id`—, así que un `plan:plans(...)` genérico hace que
  // PostgREST responda PGRST201 ("Could not embed because more than one
  // relationship was found") en lugar de datos. Es el mismo motivo por el que
  // el embed de `profiles` ya se desambiguaba en `my-organization.ts`.
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .select('id, name, subscription_status, plan:plans!organizations_plan_id_fkey(id, name, slug)')
    .eq('id', membership.organizationId)
    .single()

  // Con acceso activo la organización DEBE ser legible. Si no lo es, algo ha
  // cambiado entre la carga del contexto y esta consulta: se deniega con un
  // mensaje neutro en lugar de afirmar que no hay organización.
  //
  // El error se REGISTRA siempre: convertirlo en `invalid_context` sin dejar
  // rastro fue lo que hizo que una consulta rota pareciera un problema de
  // permisos durante el incidente de 026.
  if (orgError || !org) {
    console.error(
      `[getActiveOrg] organización no legible con acceso activo: ${orgError?.code ?? 'sin código'} ${orgError?.message ?? 'sin fila'}`,
    )
    return {
      status: 'inactive',
      access: {
        ...access,
        state: 'invalid_context',
        canOperate: false,
        message: ORGANIZATION_ACCESS_MESSAGES.invalid_context,
        detail: 'organización no legible con acceso activo',
      },
    }
  }

  const { count } = await supabase
    .from('organization_members')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', membership.organizationId)

  return {
    status: 'ok',
    org: {
      id: org.id,
      name: org.name,
      subscription_status: org.subscription_status as SubscriptionStatus,
      plan: Array.isArray(org.plan) ? (org.plan[0] ?? null) : (org.plan as ActiveOrg['plan']),
      userRole: membership.orgRole,
      memberCount: count ?? 0,
      allOrgIds: context.memberships.map((m) => m.organizationId),
    },
  }
}

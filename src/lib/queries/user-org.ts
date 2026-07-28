import { loadAuthContext } from '@/lib/auth/context'
import { resolveFallbackMembership } from '@/lib/auth/membership'
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
  | { status: 'no_org' }
  | { status: 'ok'; org: ActiveOrg }

/**
 * Organización con la que opera el usuario.
 *
 * Antes de 6B.1 esto era `memberships[0]`: con más de una pertenencia, la
 * organización activa dependía del orden que devolviera Postgres, que no está
 * garantizado. Ahora la elección es determinista (owner > admin > member, luego
 * `joined_at`, luego `organization_id`).
 *
 * TEMPORAL: cuando el producto exponga multiempresa, esta función recibirá la
 * organización elegida por el usuario en lugar de deducirla.
 */
export async function getActiveOrg(): Promise<UserOrgResult> {
  const { supabase, context } = await loadAuthContext()
  if (!context) return { status: 'no_org' }

  const membership = resolveFallbackMembership(context.memberships)
  if (!membership) return { status: 'no_org' }

  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .select('id, name, subscription_status, plan:plans(id, name, slug)')
    .eq('id', membership.organizationId)
    .single()

  if (orgError || !org) return { status: 'no_org' }

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

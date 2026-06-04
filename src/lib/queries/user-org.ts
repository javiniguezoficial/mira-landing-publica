import { createClient } from '@/lib/supabase/server'

export type MemberRole = 'org_owner' | 'org_admin' | 'org_member' | 'client_owner' | 'client_member'
export type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'cancelled' | 'expired'

export interface ActiveOrg {
  id: string
  name: string
  subscription_status: SubscriptionStatus
  plan: { id: string; name: string; slug: string } | null
  userRole: MemberRole
  memberCount: number
  // Future: pass all orgs here to build a selector
  allOrgIds: string[]
}

export type UserOrgResult =
  | { status: 'no_org' }
  | { status: 'ok'; org: ActiveOrg }

export async function getActiveOrg(): Promise<UserOrgResult> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { status: 'no_org' }

  // Get all memberships for this user
  const { data: memberships, error: memberError } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id)

  if (memberError || !memberships || memberships.length === 0) {
    return { status: 'no_org' }
  }

  // Use first org (future: let user pick via selector using allOrgIds)
  const primary = memberships[0]
  const allOrgIds = memberships.map((m) => m.organization_id)

  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .select('id, name, subscription_status, plan:plans(id, name, slug)')
    .eq('id', primary.organization_id)
    .single()

  if (orgError || !org) return { status: 'no_org' }

  // Count all members in this org
  const { count } = await supabase
    .from('organization_members')
    .select('*', { count: 'exact', head: true })
    .eq('organization_id', primary.organization_id)

  return {
    status: 'ok',
    org: {
      id: org.id,
      name: org.name,
      subscription_status: org.subscription_status as SubscriptionStatus,
      plan: Array.isArray(org.plan) ? (org.plan[0] ?? null) : (org.plan as ActiveOrg['plan']),
      userRole: primary.role as MemberRole,
      memberCount: count ?? 0,
      allOrgIds,
    },
  }
}

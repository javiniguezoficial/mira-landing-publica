import { createClient } from '@/lib/supabase/server'

export interface OrgMember {
  id: string
  user_id: string
  role: string
  joined_at: string
  profile: {
    first_name: string | null
    last_name: string | null
    phone: string | null
  } | null
}

export interface OrgDetail {
  id: string
  name: string
  type: string | null
  cif_nif: string | null
  sector: string | null
  annual_revenue_range: string | null
  employee_count_range: string | null
  address: string | null
  city: string | null
  country: string
  phone: string | null
  email: string | null
  website: string | null
  subscription_status: string
  subscription_start: string | null
  created_at: string
  plan: { name: string; slug: string } | null
}

export type MyOrgResult =
  | { status: 'no_org' }
  | { status: 'ok'; org: OrgDetail; members: OrgMember[]; userRole: string }

export async function getMyOrganization(): Promise<MyOrgResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { status: 'no_org' }

  // Obtener membresía del usuario actual
  const { data: membership, error: memErr } = await supabase
    .from('organization_members')
    .select('organization_id, role')
    .eq('user_id', user.id)
    .limit(1)
    .single()

  if (memErr || !membership) return { status: 'no_org' }

  const orgId = membership.organization_id

  // Cargar organización completa + plan
  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .select(`
      id, name, type, cif_nif, sector,
      annual_revenue_range, employee_count_range,
      address, city, country, phone, email, website,
      subscription_status, subscription_start, created_at,
      plan:plans(name, slug)
    `)
    .eq('id', orgId)
    .single()

  if (orgErr || !org) return { status: 'no_org' }

  // Cargar miembros con sus perfiles (habilitado por la policy 008)
  const { data: membersRaw } = await supabase
    .from('organization_members')
    .select(`
      id, user_id, role, joined_at,
      profile:profiles(first_name, last_name, phone)
    `)
    .eq('organization_id', orgId)
    .order('joined_at', { ascending: true })

  const members: OrgMember[] = (membersRaw ?? []).map((m) => ({
    id: m.id,
    user_id: m.user_id,
    role: m.role,
    joined_at: m.joined_at,
    profile: Array.isArray(m.profile) ? (m.profile[0] ?? null) : (m.profile as OrgMember['profile']),
  }))

  const planRaw = org.plan
  const plan = Array.isArray(planRaw) ? (planRaw[0] ?? null) : (planRaw as OrgDetail['plan'])

  return {
    status: 'ok',
    org: { ...org, plan } as OrgDetail,
    members,
    userRole: membership.role,
  }
}

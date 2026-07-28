import { loadAuthContext } from '@/lib/auth/context'
import { resolveFallbackMembership } from '@/lib/auth/membership'
import { resolveMemberRoles, type OrganizationRole } from '@/lib/identity'

export interface OrgMember {
  id: string
  user_id: string
  /** Rol legacy (`client_owner`/`client_member`). Se conserva por compatibilidad. */
  role: string
  /** Rol canónico ya normalizado. Es el que debe usar la interfaz. */
  orgRole: OrganizationRole | null
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
  | { status: 'ok'; org: OrgDetail; members: OrgMember[]; userRole: OrganizationRole | null }

export async function getMyOrganization(): Promise<MyOrgResult> {
  const { supabase, context } = await loadAuthContext()
  if (!context) return { status: 'no_org' }

  // Elección determinista de la pertenencia. Antes era `.limit(1)` sin ORDER
  // BY: con más de una pertenencia el resultado dependía del orden que
  // devolviera Postgres. Ver `resolveFallbackMembership`.
  const membership = resolveFallbackMembership(context.memberships)
  if (!membership) return { status: 'no_org' }

  const orgId = membership.organizationId

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

  // Cargar miembros con sus perfiles (habilitado por la policy 008).
  //
  // El embed DEBE desambiguarse con el nombre de la clave ajena:
  // `organization_members` tiene DOS FK hacia `profiles` (`user_id` e
  // `invited_by`), así que un `profile:profiles(...)` genérico hace que
  // PostgREST devuelva el error PGRST201 ("Could not embed because more than
  // one relationship was found") en lugar de datos. Como este error se estaba
  // ignorando, la lista de miembros salía vacía en silencio.
  const { data: membersRaw, error: membersErr } = await supabase
    .from('organization_members')
    .select(`
      id, user_id, role, org_role, joined_at,
      profile:profiles!organization_members_user_id_fkey(first_name, last_name, phone)
    `)
    .eq('organization_id', orgId)
    .order('joined_at', { ascending: true })

  // Nunca fallar en silencio: una lista de miembros vacía debe significar que
  // no hay miembros, no que la consulta falló.
  if (membersErr) {
    console.error('[getMyOrganization] error al cargar miembros:', membersErr.message)
  }

  const members: OrgMember[] = resolveMemberRoles(membersRaw ?? []).map((m) => ({
    id: m.id,
    user_id: m.user_id,
    role: m.role,
    orgRole: m.orgRole,
    joined_at: m.joined_at,
    profile: Array.isArray(m.profile) ? (m.profile[0] ?? null) : (m.profile as OrgMember['profile']),
  }))

  const planRaw = org.plan
  const plan = Array.isArray(planRaw) ? (planRaw[0] ?? null) : (planRaw as OrgDetail['plan'])

  return {
    status: 'ok',
    org: { ...org, plan } as OrgDetail,
    members,
    // Rol canónico ya normalizado por el contexto de autorización.
    userRole: membership.orgRole,
  }
}

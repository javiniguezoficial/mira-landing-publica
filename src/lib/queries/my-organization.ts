import { loadAuthContext } from '@/lib/auth/context'
import {
  ORGANIZATION_ACCESS_MESSAGES,
  resolveOrganizationAccessFromContext,
  type OrganizationAccess,
} from '@/lib/auth/access'
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
  /** No pertenece a ninguna organización. */
  | { status: 'no_org' }
  /** Pertenece, pero su acceso no está activo. `access` explica por qué. */
  | { status: 'inactive'; access: OrganizationAccess }
  | { status: 'ok'; org: OrgDetail; members: OrgMember[]; userRole: OrganizationRole | null }

/**
 * 6B.5.1: el acceso se clasifica ANTES de consultar.
 *
 * No se intenta una vista de solo lectura para los estados inactivos porque SQL
 * no la permite: `org_members_select` usa `is_org_member(id)`, que exige
 * pertenencia y organización activas. Comprobado en remoto — con la pertenencia
 * suspendida, el SELECT de `organizations` devuelve 0 filas. Prometer aquí un
 * modo lectura sería prometer una pantalla vacía.
 */
export async function getMyOrganization(): Promise<MyOrgResult> {
  const { supabase, context } = await loadAuthContext()

  const access = resolveOrganizationAccessFromContext(context)
  if (access.state === 'no_membership') return { status: 'no_org' }
  if (!access.canOperate) return { status: 'inactive', access }

  const orgId = access.membership!.organizationId
  const membership = access.membership!

  // Cargar organización completa + plan.
  //
  // El embed de `plans` DEBE desambiguarse: desde 026, `organizations` tiene DOS
  // FK hacia `plans` —`plan_id` y `requested_plan_id`—, y un `plan:plans(...)`
  // genérico devuelve PGRST201 en lugar de datos.
  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .select(`
      id, name, type, cif_nif, sector,
      annual_revenue_range, employee_count_range,
      address, city, country, phone, email, website,
      subscription_status, subscription_start, created_at,
      plan:plans!organizations_plan_id_fkey(name, slug)
    `)
    .eq('id', orgId)
    .single()

  // Con acceso activo la organización DEBE ser legible. Si no lo es, el estado
  // ha cambiado entre la carga del contexto y esta consulta. El error se
  // registra siempre: sin rastro, una consulta rota parece un problema de
  // permisos.
  if (orgErr || !org) {
    console.error(
      `[getMyOrganization] organización no legible con acceso activo: ${orgErr?.code ?? 'sin código'} ${orgErr?.message ?? 'sin fila'}`,
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

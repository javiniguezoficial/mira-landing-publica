'use server'

import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { requirePlatformAdmin } from '@/lib/auth/guards'
import { type ManageableOrgRole } from '@/lib/auth/member-write'
import {
  normalizeOrganizationRole,
  normalizePlatformRole,
  normalizeProfileStatus,
  type OrganizationRole,
  type PlatformRole,
  type ProfileStatus,
} from '@/lib/identity'
import { matchesUserFilters, type UserListFilters } from '@/lib/users/list-params'
import {
  DELETION_MESSAGES,
  deletionBlockMessages,
  evaluateUserDeletion,
  type UserDeletionFacts,
} from '@/lib/auth/user-deletion'

// ── Tipos ────────────────────────────────────────────────────────────────────

export type GlobalRole = 'platform_admin' | 'user' | 'client_owner' | 'client_member'

/** Rol asignable desde la administración. La propiedad no se gestiona aquí. */
export type { ManageableOrgRole }

export interface UserProfile {
  id: string
  email: string
  first_name: string | null
  last_name: string | null
  phone: string | null
  avatar_url: string | null
  role: GlobalRole
  created_at: string
  updated_at: string
}

export interface OrgMember {
  id: string
  organization_id: string
  user_id: string
  /** Valor legacy almacenado. La interfaz debe usar `orgRole`. */
  role: string
  /** Rol canónico ya normalizado, resuelto desde `org_role` con caída al legacy. */
  orgRole: OrganizationRole | null
  status: string
  can_buy: boolean
  can_sell: boolean
  joined_at: string
  invited_by: string | null
  user?: UserProfile | null
}

// ── Cliente con service role (solo servidor) ─────────────────────────────────
//
// El service role IGNORA RLS por completo. Por eso queda deliberadamente
// aislado (6B.1):
//
//   · NO forma parte de AuthContext;
//   · NO lo devuelve ningún guard;
//   · NO se comparte entre acciones;
//   · NO se usa NUNCA para decidir si alguien es administrador — esa decisión
//     la toma `requirePlatformAdmin()` con el cliente normal, sujeto a RLS;
//   · se crea solo dentro de la función que lo necesita, DESPUÉS de autorizar.
//
// Su único uso sigue siendo leer los emails de `auth.users`, que no es
// accesible desde el cliente normal.


// ── Emails desde auth.users via service role ──────────────────────────────────

async function fetchEmailMap(): Promise<Record<string, string>> {
  const admin = await createSupabaseAdminClient()
  // listUsers pagina de 1000 en 1000; para esta fase asumimos < 1000 usuarios
  const { data } = await admin.auth.admin.listUsers({ perPage: 1000 })
  const map: Record<string, string> = {}
  for (const u of data?.users ?? []) {
    if (u.email) map[u.id] = u.email
  }
  return map
}

// ── Listado de usuarios ───────────────────────────────────────────────────────

export async function getProfiles(): Promise<UserProfile[]> {
  const { supabase } = await requirePlatformAdmin()
  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)

  const emails = await fetchEmailMap()

  return (profiles ?? []).map((p) => ({
    ...p,
    email: emails[p.id] ?? '',
  })) as UserProfile[]
}

// ── Detalle de usuario ────────────────────────────────────────────────────────

export async function getProfileById(id: string): Promise<UserProfile | null> {
  const { supabase } = await requirePlatformAdmin()
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', id)
    .single()

  if (error || !profile) return null

  const emails = await fetchEmailMap()
  return { ...profile, email: emails[id] ?? '' } as UserProfile
}

// ── Miembros de una organización ──────────────────────────────────────────────

export async function getOrganizationMembers(orgId: string): Promise<OrgMember[]> {
  const { supabase } = await requirePlatformAdmin()
  const { data, error } = await supabase
    .from('organization_members')
    .select('*')
    .eq('organization_id', orgId)
    .order('joined_at', { ascending: true })

  if (error) throw new Error(error.message)

  const emails = await fetchEmailMap()

  const userIds = (data ?? []).map((m) => m.user_id)
  const { data: profiles } = await supabase
    .from('profiles')
    .select('*')
    .in('id', userIds)

  const profileMap: Record<string, UserProfile> = {}
  for (const p of profiles ?? []) {
    profileMap[p.id] = { ...p, email: emails[p.id] ?? '' } as UserProfile
  }

  return (data ?? []).map((m) => ({
    ...m,
    // Rol canónico resuelto una sola vez: la interfaz no debe volver a
    // interpretar valores legacy por su cuenta.
    orgRole: normalizeOrganizationRole(m.org_role ?? m.role),
    user: profileMap[m.user_id] ?? null,
  })) as OrgMember[]
}

// ── Organizaciones de un usuario ──────────────────────────────────────────────

export async function getUserOrganizations(userId: string) {
  const { supabase } = await requirePlatformAdmin()
  const { data, error } = await supabase
    .from('organization_members')
    .select(`
      id,
      role,
      joined_at,
      organization:organizations(id, name, subscription_status, plan:plans!organizations_plan_id_fkey(name))
    `)
    .eq('user_id', userId)
    .order('joined_at', { ascending: true })

  if (error) throw new Error(error.message)
  return data ?? []
}

// ── Escrituras: viven en `actions/user-admin.ts` (039) ────────────────────────
//
// Aquí había tres acciones de escritura —`addOrganizationMember`,
// `removeOrganizationMember` y `updateOrganizationMemberRole`— que se han
// retirado, no simplemente dejado de usar.
//
// El motivo es de seguridad, no de orden: en Next.js toda función exportada de
// un archivo `'use server'` es un ENDPOINT invocable desde el navegador. Una
// acción de escritura que ya nadie llama sigue aceptando peticiones, deja de
// revisarse porque «no se usa» y, sobre todo, se salta las reglas que se hayan
// añadido después en su sustituta: aquellas tres no registraban auditoría, no
// tocaban estado ni capacidades y aceptaban solo `admin` y `member`.
//
// Este archivo queda como LECTOR del panel. Todo lo que escribe sobre
// autorización está en `lib/actions/user-admin.ts`, junto con sus guards y su
// registro, para que una revisión de seguridad pueda leerlo de una sentada.

// ═══════════════════════════════════════════════════════════════════════════
// LECTORES DE LA ADMINISTRACIÓN DE USUARIOS (Fase 039)
// ═══════════════════════════════════════════════════════════════════════════
//
// El listado y el detalle se resuelven ENTEROS en servidor: filtros incluidos.
// Filtrar en el navegador exigiría mandarle la lista completa de usuarios con
// sus organizaciones y capacidades, que es justo lo que no debe salir de
// servidor sin necesidad.

/** Pertenencia de un usuario, ya resuelta con el nombre de su organización. */
export interface AdminUserMembership {
  id: string
  organizationId: string
  organizationName: string
  organizationStatus: string | null
  commercialProfile: string | null
  orgRole: OrganizationRole | null
  status: string | null
  canBuy: boolean
  canSell: boolean
  joinedAt: string
}

export interface AdminUserRow {
  id: string
  email: string
  firstName: string | null
  lastName: string | null
  phone: string | null
  status: ProfileStatus | null
  platformRole: PlatformRole | null
  createdAt: string
  updatedAt: string
  memberships: AdminUserMembership[]
}

const PROFILE_COLUMNS =
  'id, first_name, last_name, phone, role, status, created_at, updated_at, ' +
  'preferred_locale, preferred_currency, preferred_country'

/**
 * Carga TODOS los usuarios con sus pertenencias, en tres consultas fijas.
 *
 * No hay N+1: una para los perfiles, una para las pertenencias con el embed de
 * la organización, y la lectura de correos de `auth.users`. El cruce se hace en
 * memoria sobre unos cientos de filas.
 */
async function loadAdminUsers(): Promise<AdminUserRow[]> {
  const { supabase } = await requirePlatformAdmin()

  const [{ data: perfiles, error }, { data: memberships }, emails] = await Promise.all([
    supabase.from('profiles').select(PROFILE_COLUMNS).order('created_at', { ascending: false }),
    supabase
      .from('organization_members')
      .select(
        'id, organization_id, user_id, org_role, role, status, can_buy, can_sell, joined_at, ' +
          'organization:organizations(id, name, status, commercial_profile)',
      )
      .order('joined_at', { ascending: true }),
    fetchEmailMap(),
  ])

  if (error) throw new Error(error.message)

  const porUsuario = new Map<string, AdminUserMembership[]>()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  for (const m of (memberships ?? []) as any[]) {
    const org = Array.isArray(m.organization) ? m.organization[0] : m.organization
    if (!org) continue
    const fila: AdminUserMembership = {
      id: m.id,
      organizationId: org.id,
      organizationName: org.name,
      organizationStatus: org.status ?? null,
      commercialProfile: org.commercial_profile ?? null,
      orgRole: normalizeOrganizationRole(m.org_role ?? m.role),
      status: m.status ?? null,
      canBuy: m.can_buy === true,
      canSell: m.can_sell === true,
      joinedAt: m.joined_at,
    }
    const actual = porUsuario.get(m.user_id)
    if (actual) actual.push(fila)
    else porUsuario.set(m.user_id, [fila])
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return ((perfiles ?? []) as any[]).map((p) => ({
    id: p.id,
    email: emails[p.id] ?? '',
    firstName: p.first_name ?? null,
    lastName: p.last_name ?? null,
    phone: p.phone ?? null,
    status: normalizeProfileStatus(p.status),
    platformRole: normalizePlatformRole(p.role),
    createdAt: p.created_at,
    updatedAt: p.updated_at,
    memberships: porUsuario.get(p.id) ?? [],
  }))
}

export interface AdminUserListPage {
  users: AdminUserRow[]
  total: number
  filtered: number
}

/** Listado filtrado. Los filtros llegan ya normalizados desde la URL. */
export async function listAdminUsers(filters: UserListFilters): Promise<AdminUserListPage> {
  const todos = await loadAdminUsers()

  const users = todos.filter((u) =>
    matchesUserFilters(
      {
        firstName: u.firstName,
        lastName: u.lastName,
        email: u.email,
        status: u.status,
        platformRole: u.platformRole,
        memberships: u.memberships.map((m) => ({
          organizationId: m.organizationId,
          canBuy: m.canBuy,
          canSell: m.canSell,
        })),
      },
      filters,
    ),
  )

  return { users, total: todos.length, filtered: users.length }
}

/** Detalle completo de un usuario, con todas sus pertenencias. */
export async function getAdminUserDetail(userId: string): Promise<AdminUserRow | null> {
  const todos = await loadAdminUsers()
  return todos.find((u) => u.id === userId) ?? null
}

export interface AssignableOrganization {
  id: string
  name: string
  status: string | null
  commercialProfile: string | null
  hasOwner: boolean
  memberCount: number
}

/**
 * Organizaciones a las que se puede asignar a alguien, con los hechos que
 * necesita el formulario para decidir qué ofrecer: si ya tienen propietario y
 * qué capacidades comerciales admiten.
 */
export async function listAssignableOrganizations(): Promise<AssignableOrganization[]> {
  const { supabase } = await requirePlatformAdmin()

  const [{ data: orgs }, { data: members }] = await Promise.all([
    supabase.from('organizations').select('id, name, status, commercial_profile').order('name'),
    supabase.from('organization_members').select('organization_id, org_role, role'),
  ])

  const conOwner = new Set<string>()
  const recuento = new Map<string, number>()
  for (const m of members ?? []) {
    recuento.set(m.organization_id, (recuento.get(m.organization_id) ?? 0) + 1)
    if (normalizeOrganizationRole(m.org_role ?? m.role) === 'owner') conOwner.add(m.organization_id)
  }

  return (orgs ?? []).map((o) => ({
    id: o.id,
    name: o.name,
    status: o.status ?? null,
    commercialProfile: o.commercial_profile ?? null,
    hasOwner: conOwner.has(o.id),
    memberCount: recuento.get(o.id) ?? 0,
  }))
}

/** Cuántos administradores de plataforma ACTIVOS hay. Para avisar en la interfaz. */
export async function countActivePlatformAdmins(): Promise<number> {
  const { supabase } = await requirePlatformAdmin()
  const { count } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('role', 'platform_admin')
    .eq('status', 'active')
  return count ?? 0
}

/** Histórico de auditoría de un usuario. Las 20 últimas operaciones. */
export interface AuditEntryRow {
  id: string
  action: string
  actorId: string
  actorName: string
  targetOrganizationId: string | null
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  isQa: boolean
  createdAt: string
}

export async function getUserAuditTrail(userId: string): Promise<AuditEntryRow[]> {
  const { supabase } = await requirePlatformAdmin()

  const { data } = await supabase
    .from('admin_audit_log')
    .select('id, action, actor_id, target_organization_id, before_state, after_state, is_qa, created_at')
    .eq('target_user_id', userId)
    .order('created_at', { ascending: false })
    .limit(20)

  if (!data || data.length === 0) return []

  const actorIds = [...new Set(data.map((e) => e.actor_id))]
  const { data: actores } = await supabase
    .from('profiles')
    .select('id, first_name, last_name')
    .in('id', actorIds)

  const nombres = new Map<string, string>()
  for (const a of actores ?? []) {
    nombres.set(a.id, [a.first_name, a.last_name].filter(Boolean).join(' ') || 'Administrador')
  }

  return data.map((e) => ({
    id: e.id,
    action: e.action,
    actorId: e.actor_id,
    actorName: nombres.get(e.actor_id) ?? 'Administrador',
    targetOrganizationId: e.target_organization_id,
    before: e.before_state as Record<string, unknown> | null,
    after: e.after_state as Record<string, unknown> | null,
    isQa: e.is_qa === true,
    createdAt: e.created_at,
  }))
}

// ═══════════════════════════════════════════════════════════════════════════
// ¿Se puede eliminar esta cuenta?  (lectura para la ficha)
// ═══════════════════════════════════════════════════════════════════════════

export interface UserDeletionCheck {
  deletable: boolean
  blocks: string[]
  warnings: string[]
}

/**
 * Reúne las dependencias de una cuenta y devuelve el veredicto ya traducido.
 *
 * Es SOLO LECTURA y existe para que la ficha pueda explicar por qué una cuenta
 * no se puede eliminar ANTES de que nadie pulse nada. La decisión de verdad la
 * vuelve a tomar `deleteUserAccount` con los mismos hechos releídos: esto es
 * para informar, no para autorizar.
 */
export async function checkUserDeletable(userId: string): Promise<UserDeletionCheck> {
  const { supabase, userId: actorId } = await requirePlatformAdmin()

  const { data: perfil } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', userId)
    .maybeSingle()

  if (!perfil) return { deletable: false, blocks: [DELETION_MESSAGES.noExiste], warnings: [] }

  const [
    { data: owned }, { count: rfqs }, { count: tickets },
    { count: noticias }, { count: importaciones }, { count: borrados },
    { count: proveedores }, { count: admins },
  ] = await Promise.all([
    supabase.from('organization_members').select('organizations ( name )').eq('user_id', userId).eq('org_role', 'owner'),
    supabase.from('rfqs').select('id', { count: 'exact', head: true }).eq('created_by', userId),
    supabase.from('support_tickets').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('news').select('id', { count: 'exact', head: true }).eq('created_by', userId),
    supabase.from('market_import_batches').select('id', { count: 'exact', head: true }).eq('created_by', userId),
    supabase.from('market_price_deletion_batches').select('id', { count: 'exact', head: true }).eq('created_by', userId),
    supabase.from('supplier_update_batches').select('id', { count: 'exact', head: true }).eq('created_by', userId),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'platform_admin').eq('status', 'active'),
  ])

  const hechos: UserDeletionFacts = {
    actorId,
    targetUserId: userId,
    targetIsPlatformAdmin: normalizePlatformRole(perfil.role) === 'platform_admin',
    activeAdminCount: admins ?? 0,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ownedOrganizations: (owned ?? []).map((m: any) => m.organizations?.name ?? 'una organización'),
    rfqCount: rfqs ?? 0,
    supportTicketCount: tickets ?? 0,
    authoredNewsCount: noticias ?? 0,
    importBatchCount: importaciones ?? 0,
    deletionBatchCount: borrados ?? 0,
    supplierBatchCount: proveedores ?? 0,
  }

  const veredicto = evaluateUserDeletion(hechos)
  return {
    deletable: veredicto.deletable,
    blocks: deletionBlockMessages(veredicto, hechos),
    warnings: veredicto.warnings,
  }
}

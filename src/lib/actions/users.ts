'use server'

import { createServerClient } from '@supabase/ssr'
import { requirePlatformAdmin } from '@/lib/auth/guards'
import {
  buildMembershipInsert,
  buildMembershipRoleUpdate,
  membershipErrorDetail,
  normalizeManageableRole,
  translateMembershipError,
  type ManageableOrgRole,
} from '@/lib/auth/member-write'
import { normalizeOrganizationRole, type OrganizationRole } from '@/lib/identity'
import { cookies } from 'next/headers'

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

async function createAdminClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    }
  )
}

// ── Emails desde auth.users via service role ──────────────────────────────────

async function fetchEmailMap(): Promise<Record<string, string>> {
  const admin = await createAdminClient()
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
      organization:organizations(id, name, subscription_status, plan:plans(name))
    `)
    .eq('user_id', userId)
    .order('joined_at', { ascending: true })

  if (error) throw new Error(error.message)
  return data ?? []
}

// ── Añadir miembro ────────────────────────────────────────────────────────────

export async function addOrganizationMember(
  orgId: string,
  userId: string,
  role: ManageableOrgRole
): Promise<void> {
  const { userId: adminId, supabase } = await requirePlatformAdmin()

  // Nunca se confía en el valor que llega del formulario: se normaliza en
  // servidor y solo sobreviven 'admin' y 'member'. `owner` y los valores legacy
  // quedan fuera — la propiedad no se crea desde esta acción.
  const rolCanonico = normalizeManageableRole(role)
  if (!rolCanonico) throw new Error('El rol seleccionado no es válido.')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .single()
  if (!profile) throw new Error('Usuario no encontrado.')

  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .eq('id', orgId)
    .single()
  if (!org) throw new Error('Organización no encontrada.')

  // Escritura dual y explícita: ningún campo de autorización queda al azar de
  // un default.
  const { error } = await supabase
    .from('organization_members')
    .insert(
      buildMembershipInsert({
        organizationId: orgId,
        userId,
        role: rolCanonico,
        invitedBy: adminId,
      }),
    )

  if (error) {
    console.error(membershipErrorDetail('alta de miembro', error))
    throw new Error(translateMembershipError(error))
  }
}

// ── Eliminar miembro ──────────────────────────────────────────────────────────

export async function removeOrganizationMember(memberId: string): Promise<void> {
  const { supabase, userId: adminId } = await requirePlatformAdmin()

  // La base de datos lo impide igualmente tras la migración 023; esta
  // comprobación previa existe para dar un mensaje claro en lugar de un error
  // de restricción.
  const { data: miembro } = await supabase
    .from('organization_members')
    .select('id, user_id, org_role, role')
    .eq('id', memberId)
    .single()

  if (!miembro) throw new Error('Miembro no encontrado.')

  if (normalizeOrganizationRole(miembro.org_role ?? miembro.role) === 'owner') {
    throw new Error('El propietario no puede modificarse desde esta acción.')
  }
  if (miembro.user_id === adminId) {
    throw new Error('No puedes modificar tu propia pertenencia desde esta acción.')
  }

  const { error } = await supabase
    .from('organization_members')
    .delete()
    .eq('id', memberId)

  if (error) {
    console.error(membershipErrorDetail('baja de miembro', error))
    throw new Error(translateMembershipError(error))
  }
}

// ── Actualizar rol de miembro ─────────────────────────────────────────────────

export async function updateOrganizationMemberRole(
  memberId: string,
  newRole: ManageableOrgRole
): Promise<void> {
  const { supabase, userId: adminId } = await requirePlatformAdmin()

  const rolCanonico = normalizeManageableRole(newRole)
  if (!rolCanonico) throw new Error('El rol seleccionado no es válido.')

  const { data: miembro } = await supabase
    .from('organization_members')
    .select('id, user_id, org_role, role')
    .eq('id', memberId)
    .single()

  if (!miembro) throw new Error('Miembro no encontrado.')

  if (normalizeOrganizationRole(miembro.org_role ?? miembro.role) === 'owner') {
    throw new Error('El propietario no puede modificarse desde esta acción.')
  }
  if (miembro.user_id === adminId) {
    throw new Error('No puedes modificar tu propia pertenencia desde esta acción.')
  }

  // `org_role` y `role` se actualizan SIEMPRE juntos: dejarlos desalineados
  // produce una fila que el trigger de 023 rechaza.
  const { error } = await supabase
    .from('organization_members')
    .update(buildMembershipRoleUpdate(rolCanonico))
    .eq('id', memberId)

  if (error) {
    console.error(membershipErrorDetail('cambio de rol', error))
    throw new Error(translateMembershipError(error))
  }
}

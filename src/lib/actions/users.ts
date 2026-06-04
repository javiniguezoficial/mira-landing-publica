'use server'

import { createServerClient } from '@supabase/ssr'
import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

// ── Tipos ────────────────────────────────────────────────────────────────────

export type GlobalRole = 'platform_admin' | 'client_owner' | 'client_member'
export type OrgMemberRole = 'client_owner' | 'client_member'

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
  role: OrgMemberRole
  joined_at: string
  invited_by: string | null
  user?: UserProfile | null
}

// ── Cliente con service role (solo servidor) ─────────────────────────────────

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

// ── Guard: solo platform_admin ────────────────────────────────────────────────

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'platform_admin') redirect('/app/dashboard')
  return { supabase, adminClient: await createAdminClient(), userId: user.id }
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
  await requireAdmin()

  const supabase = await createClient()
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
  await requireAdmin()

  const supabase = await createClient()
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
  await requireAdmin()

  const supabase = await createClient()
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
    user: profileMap[m.user_id] ?? null,
  })) as OrgMember[]
}

// ── Organizaciones de un usuario ──────────────────────────────────────────────

export async function getUserOrganizations(userId: string) {
  await requireAdmin()

  const supabase = await createClient()
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
  role: OrgMemberRole
): Promise<void> {
  const { userId: adminId } = await requireAdmin()

  if (!['client_owner', 'client_member'].includes(role)) {
    throw new Error('Rol no válido. Debe ser client_owner o client_member.')
  }

  const supabase = await createClient()

  // Verificar que el usuario existe
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .single()
  if (!profile) throw new Error('Usuario no encontrado.')

  // Verificar que la organización existe
  const { data: org } = await supabase
    .from('organizations')
    .select('id')
    .eq('id', orgId)
    .single()
  if (!org) throw new Error('Organización no encontrada.')

  const { error } = await supabase
    .from('organization_members')
    .insert({
      organization_id: orgId,
      user_id: userId,
      role,
      invited_by: adminId,
    })

  if (error) {
    if (error.code === '23505') {
      throw new Error('El usuario ya es miembro de esta organización.')
    }
    throw new Error(error.message)
  }
}

// ── Eliminar miembro ──────────────────────────────────────────────────────────

export async function removeOrganizationMember(memberId: string): Promise<void> {
  await requireAdmin()

  const supabase = await createClient()
  const { error } = await supabase
    .from('organization_members')
    .delete()
    .eq('id', memberId)

  if (error) throw new Error(error.message)
}

// ── Actualizar rol de miembro ─────────────────────────────────────────────────

export async function updateOrganizationMemberRole(
  memberId: string,
  newRole: OrgMemberRole
): Promise<void> {
  await requireAdmin()

  if (!['client_owner', 'client_member'].includes(newRole)) {
    throw new Error('Rol no válido.')
  }

  const supabase = await createClient()
  const { error } = await supabase
    .from('organization_members')
    .update({ role: newRole })
    .eq('id', memberId)

  if (error) throw new Error(error.message)
}

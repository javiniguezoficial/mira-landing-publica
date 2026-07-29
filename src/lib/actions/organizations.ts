'use server'

import { requirePlatformAdmin } from '@/lib/auth/guards'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import {
  SIGNUP_MESSAGES,
  evaluateActivation,
  isValidInitialStatus,
  isValidOrganizationStatus,
  signupErrorDetail,
  translateSignupError,
  validateNewOwner,
  validateOrganizationSignup,
} from '@/lib/auth/signup'

// ── Tipos ────────────────────────────────────────────────────────────────────

export type SubscriptionStatus = 'trial' | 'active' | 'past_due' | 'cancelled' | 'expired'
export type OrgType = 'fisica' | 'juridica'

export interface Organization {
  id: string
  name: string
  type: OrgType | null
  cif_nif: string | null
  sector: string | null
  annual_revenue_range: string | null
  employee_count_range: string | null
  city: string | null
  country: string
  phone: string | null
  email: string | null
  website: string | null
  plan_id: string | null
  subscription_status: SubscriptionStatus
  subscription_start: string | null
  subscription_end: string | null
  created_at: string
  updated_at: string
  /** Ciclo de vida del cliente (6B.2). `select('*')` ya lo traía; faltaba en el tipo. */
  status: string
  commercial_profile: string
  /** Origen del alta (6C): landing, admin o stripe. */
  signup_source: string
  /** Plan que el cliente SOLICITÓ. Informativo: `plan_id` es el que gobierna. */
  requested_plan_id: string | null
  plan_approved_by: string | null
  plan_approved_at: string | null
  plan?: { id: string; name: string; slug: string } | null
}

export interface OrgFormData {
  name: string
  type?: OrgType
  cif_nif?: string
  sector?: string
  annual_revenue_range?: string
  employee_count_range?: string
  city?: string
  country?: string
  phone?: string
  email?: string
  website?: string
  plan_id?: string
  subscription_status?: SubscriptionStatus
}


// ── Listado ───────────────────────────────────────────────────────────────────

export async function getOrganizations(): Promise<Organization[]> {
  const { supabase } = await requirePlatformAdmin()

  const { data, error } = await supabase
    .from('organizations')
    .select(`
      *,
      plan:plans!organizations_plan_id_fkey(id, name, slug)
    `)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return (data ?? []) as Organization[]
}

// ── Detalle ───────────────────────────────────────────────────────────────────

export async function getOrganizationById(id: string): Promise<Organization | null> {
  const { supabase } = await requirePlatformAdmin()

  const { data, error } = await supabase
    .from('organizations')
    .select(`
      *,
      plan:plans!organizations_plan_id_fkey(id, name, slug)
    `)
    .eq('id', id)
    .single()

  if (error) return null
  return data as Organization
}

// ── Obtener planes disponibles ────────────────────────────────────────────────

export async function getPlans() {
  const { supabase } = await requirePlatformAdmin()

  const { data } = await supabase
    .from('plans')
    .select('id, name, slug')
    .eq('is_active', true)
    .order('price_monthly', { ascending: true })

  return data ?? []
}

// ── Crear organización ────────────────────────────────────────────────────────

export async function createOrganization(formData: OrgFormData): Promise<{ id: string }> {
  const { supabase } = await requirePlatformAdmin()

  // Si no se selecciona plan, usar Starter por defecto
  let planId = formData.plan_id || null
  if (!planId) {
    const { data: starter } = await supabase
      .from('plans')
      .select('id')
      .eq('slug', 'starter')
      .single()
    planId = starter?.id ?? null
  }

  const { data, error } = await supabase
    .from('organizations')
    .insert({
      name: formData.name.trim(),
      type: formData.type ?? null,
      cif_nif: formData.cif_nif?.trim() || null,
      sector: formData.sector?.trim() || null,
      annual_revenue_range: formData.annual_revenue_range || null,
      employee_count_range: formData.employee_count_range || null,
      city: formData.city?.trim() || null,
      country: formData.country?.trim() || 'ES',
      phone: formData.phone?.trim() || null,
      email: formData.email?.trim() || null,
      website: formData.website?.trim() || null,
      plan_id: planId,
      subscription_status: formData.subscription_status ?? 'trial',
    })
    .select('id')
    .single()

  if (error) throw new Error(error.message)
  return { id: data.id }
}

// ── Editar organización ───────────────────────────────────────────────────────

export async function updateOrganization(id: string, formData: OrgFormData): Promise<void> {
  const { supabase } = await requirePlatformAdmin()

  const { error } = await supabase
    .from('organizations')
    .update({
      name: formData.name.trim(),
      type: formData.type ?? null,
      cif_nif: formData.cif_nif?.trim() || null,
      sector: formData.sector?.trim() || null,
      annual_revenue_range: formData.annual_revenue_range || null,
      employee_count_range: formData.employee_count_range || null,
      city: formData.city?.trim() || null,
      country: formData.country?.trim() || 'ES',
      phone: formData.phone?.trim() || null,
      email: formData.email?.trim() || null,
      website: formData.website?.trim() || null,
      plan_id: formData.plan_id || null,
      subscription_status: formData.subscription_status ?? 'trial',
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) throw new Error(error.message)
}

// ── 6C · Alta y gestión básica de clientes ───────────────────────────────────
//
// Todas estas acciones exigen `platform_admin` ACTIVO: `requirePlatformAdmin`
// compone rol y `profileStatus` desde 6B.5, y la policy `org_admin_all` más el
// trigger `protect_organization_columns` lo vuelven a comprobar en SQL. Ocultar
// un botón nunca es la protección.

export interface OrganizationOwner {
  userId: string
  firstName: string | null
  lastName: string | null
  orgRole: string
  status: string
  canBuy: boolean
  canSell: boolean
}

/** Propietario de una organización, o `null` si —excepcionalmente— no tiene. */
export async function getOrganizationOwner(orgId: string): Promise<OrganizationOwner | null> {
  const { supabase } = await requirePlatformAdmin()

  const { data } = await supabase
    .from('organization_members')
    .select(`
      user_id, org_role, status, can_buy, can_sell,
      profile:profiles!organization_members_user_id_fkey(first_name, last_name)
    `)
    .eq('organization_id', orgId)
    .eq('org_role', 'owner')
    .maybeSingle()

  if (!data) return null

  const profile = Array.isArray(data.profile) ? data.profile[0] : data.profile
  return {
    userId: data.user_id as string,
    firstName: (profile as { first_name?: string | null })?.first_name ?? null,
    lastName: (profile as { last_name?: string | null })?.last_name ?? null,
    orgRole: data.org_role as string,
    status: data.status as string,
    canBuy: data.can_buy as boolean,
    canSell: data.can_sell as boolean,
  }
}

/**
 * Crea empresa y propietario en una sola transacción.
 *
 * Sustituye a `createOrganization` para el alta de clientes reales: aquella
 * dejaba la empresa sin propietario, y una organización sin owner no la puede
 * gestionar nadie. Se apoya en la misma función SQL que usa la landing, así que
 * la regla de propietario único es idéntica por los dos caminos.
 *
 * El propietario debe ser un usuario que ya exista. Crear la cuenta de Auth de
 * una persona nueva pertenece al bloque de invitaciones, que no es este: hasta
 * entonces, esa persona se registra desde la landing y aquí se activa su empresa.
 */
export async function createOrganizationWithOwner(input: {
  name: string
  planSlug: string
  commercialProfile: string
  ownerUserId: string
  status?: string | null
  cifNif?: string | null
  country?: string | null
  phone?: string | null
}): Promise<{ id?: string; error?: string }> {
  const { supabase } = await requirePlatformAdmin('throw')

  if (!input.ownerUserId) return { error: SIGNUP_MESSAGES.propietario }

  const { data: planes } = await supabase.from('plans').select('slug').eq('is_active', true)
  const fallo = validateOrganizationSignup(
    {
      name: input.name,
      planSlug: input.planSlug,
      commercialProfile: input.commercialProfile,
    },
    (planes ?? []).map((p) => p.slug as string),
  )
  if (fallo) return { error: fallo }

  if (input.status != null && !isValidInitialStatus(input.status)) {
    return { error: SIGNUP_MESSAGES.estado }
  }

  const { data, error } = await supabase.rpc('create_organization_with_owner', {
    p_name: input.name,
    p_plan_slug: input.planSlug,
    p_commercial_profile: input.commercialProfile,
    p_cif_nif: input.cifNif ?? null,
    p_country: input.country ?? 'ES',
    p_phone: input.phone ?? null,
    p_owner_user_id: input.ownerUserId,
    p_status: input.status ?? 'pending',
  })

  if (error) {
    console.error(signupErrorDetail('alta administrativa', error))
    return { error: translateSignupError(error) }
  }

  return { id: data as string }
}

/** Cambia el plan de un cliente. El plan se valida contra el catálogo activo. */
export async function setOrganizationPlan(
  orgId: string,
  planSlug: string,
): Promise<{ error?: string }> {
  const { supabase } = await requirePlatformAdmin('throw')

  const { data: plan } = await supabase
    .from('plans')
    .select('id')
    .eq('slug', planSlug)
    .eq('is_active', true)
    .maybeSingle()

  if (!plan) return { error: SIGNUP_MESSAGES.plan }

  const { data, error } = await supabase
    .from('organizations')
    .update({ plan_id: plan.id })
    .eq('id', orgId)
    .select('id')

  if (error) {
    console.error(signupErrorDetail('cambio de plan', error))
    return { error: SIGNUP_MESSAGES.generico }
  }
  if (!data || data.length === 0) return { error: SIGNUP_MESSAGES.generico }

  return {}
}

/**
 * Suspende, reactiva a pendiente o rechaza un cliente.
 *
 * NO activa: activar exige confirmar el plan y va por `activateOrganization`.
 * No hay borrado: un cliente real se suspende.
 */
export async function setOrganizationStatus(
  orgId: string,
  status: string,
): Promise<{ error?: string }> {
  const { supabase } = await requirePlatformAdmin('throw')

  if (!isValidOrganizationStatus(status)) return { error: SIGNUP_MESSAGES.estado }
  if (status === 'active') return { error: SIGNUP_MESSAGES.planSinConfirmar }

  const { data, error } = await supabase
    .from('organizations')
    .update({ status })
    .eq('id', orgId)
    .select('id')

  if (error) {
    console.error(signupErrorDetail('cambio de estado', error))
    return { error: SIGNUP_MESSAGES.generico }
  }
  if (!data || data.length === 0) return { error: SIGNUP_MESSAGES.generico }

  return {}
}

/**
 * Activa un cliente confirmando explícitamente el plan asignado.
 *
 * El plan que llegó de la landing es una SOLICITUD: viaja en la metadata del
 * registro, que el navegador escribe, así que alguien podría pedir Enterprise
 * habiendo pulsado Starter. Aquí se concede el plan que decide la persona
 * administradora, se registra quién lo aprobó y solo entonces se activa —todo
 * en el mismo UPDATE, para que no exista un instante con la organización activa
 * y sin plan.
 *
 * `protect_organization_columns` vuelve a exigirlo en SQL: una transición a
 * `active` sin `plan_id` ni `plan_approved_by` se rechaza. Activar sin mirar el
 * plan no es posible ni saltándose esta acción.
 */
export async function activateOrganization(
  orgId: string,
  approvedPlanSlug: string,
): Promise<{ error?: string }> {
  const { supabase, userId } = await requirePlatformAdmin('throw')

  const { data: planes } = await supabase.from('plans').select('slug').eq('is_active', true)
  const fallo = evaluateActivation(approvedPlanSlug, (planes ?? []).map((p) => p.slug as string))
  if (fallo) return { error: fallo }

  const { data: plan } = await supabase
    .from('plans')
    .select('id')
    .eq('slug', approvedPlanSlug.trim())
    .eq('is_active', true)
    .maybeSingle()

  if (!plan) return { error: SIGNUP_MESSAGES.plan }

  const { data, error } = await supabase
    .from('organizations')
    .update({
      plan_id: plan.id,
      plan_approved_by: userId,
      plan_approved_at: new Date().toISOString(),
      status: 'active',
    })
    .eq('id', orgId)
    .select('id')

  if (error) {
    console.error(signupErrorDetail('activación', error))
    return { error: SIGNUP_MESSAGES.generico }
  }
  if (!data || data.length === 0) return { error: SIGNUP_MESSAGES.generico }

  return {}
}

/**
 * Alta administrativa completa cuando la persona propietaria TODAVÍA NO tiene
 * cuenta.
 *
 * ── Sobre el uso privilegiado ───────────────────────────────────────────────
 *
 * Es el único punto de 6C que necesita la API administrativa de Supabase, y se
 * apoya en el cliente server-only que ya existía en `users.ts` desde 6B.1:
 *
 *   · usa `SUPABASE_SERVICE_ROLE_KEY`, SIN prefijo `NEXT_PUBLIC_`, así que Next
 *     nunca la incrusta en el bundle del navegador;
 *   · el fichero es `'use server'` y ningún componente cliente la referencia;
 *   · se crea DENTRO de la función, después de autorizar, y no se devuelve;
 *   · su único cometido aquí es dar de alta al usuario en Auth para obtener su
 *     identificador. La organización se crea después con el cliente NORMAL,
 *     sujeto a RLS, y con la misma RPC que usa la landing.
 *
 * `inviteUserByEmail` crea la cuenta y envía el correo con el que la persona
 * establece su contraseña. No es un sistema de invitaciones de equipo: es el
 * flujo nativo de Supabase Auth para una sola cuenta, la del propietario.
 *
 * ── Sobre la atomicidad ─────────────────────────────────────────────────────
 *
 * Auth y la base de datos son dos sistemas: no hay transacción que abarque a
 * ambos. El orden es forzoso —el propietario debe existir antes que la
 * organización, por la clave ajena—, así que si la creación de la empresa
 * fallara quedaría una cuenta de Auth sin organización. Se registra en el log y
 * se puede reintentar: la RPC es idempotente y esa misma persona sirve como
 * propietaria en el segundo intento.
 */
export async function createOrganizationForNewOwner(input: {
  email: string
  firstName: string
  lastName?: string | null
  name: string
  planSlug: string
  commercialProfile: string
  status?: string | null
  cifNif?: string | null
  country?: string | null
  phone?: string | null
}): Promise<{ id?: string; message?: string; error?: string }> {
  const { supabase, userId } = await requirePlatformAdmin('throw')

  const falloPersona = validateNewOwner(input)
  if (falloPersona) return { error: falloPersona }

  const { data: planes } = await supabase.from('plans').select('slug').eq('is_active', true)
  const fallo = validateOrganizationSignup(
    { name: input.name, planSlug: input.planSlug, commercialProfile: input.commercialProfile },
    (planes ?? []).map((p) => p.slug as string),
  )
  if (fallo) return { error: fallo }

  if (input.status != null && !isValidInitialStatus(input.status)) {
    return { error: SIGNUP_MESSAGES.estado }
  }

  // Cliente privilegiado, solo servidor y solo para esta llamada.
  const admin = await createSupabaseAdminClient()
  const { data: invitado, error: errorInvitacion } = await admin.auth.admin.inviteUserByEmail(
    input.email.trim(),
    {
      data: {
        first_name: input.firstName.trim(),
        last_name: input.lastName?.trim() || null,
      },
    },
  )

  if (errorInvitacion || !invitado?.user?.id) {
    // Respuesta no comprometida: no se confirma si el correo ya tenía cuenta.
    console.error(signupErrorDetail('invitación de propietario', errorInvitacion))
    return { error: SIGNUP_MESSAGES.altaPropietario }
  }

  // A partir de aquí, cliente NORMAL: la organización se crea con la misma RPC
  // que la landing, sujeta a RLS y a las mismas reglas de propietario único.
  const { data, error } = await supabase.rpc('create_organization_with_owner', {
    p_name: input.name,
    p_plan_slug: input.planSlug,
    p_commercial_profile: input.commercialProfile,
    p_cif_nif: input.cifNif ?? null,
    p_country: input.country ?? 'ES',
    p_phone: input.phone ?? null,
    p_owner_user_id: invitado.user.id,
    p_status: input.status ?? 'pending',
  })

  if (error) {
    console.error(
      `${signupErrorDetail('alta con propietario nuevo', error)} · cuenta creada sin organización, requiere reintento · admin=${userId}`,
    )
    return { error: translateSignupError(error) }
  }

  return { id: data as string, message: SIGNUP_MESSAGES.invitacionEnviada }
}

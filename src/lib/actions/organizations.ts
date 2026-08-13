'use server'

import { revalidatePath } from 'next/cache'
import { requirePlatformAdmin } from '@/lib/auth/guards'
import {
  buildOrganizationModules,
  parseOrganizationModules,
  type OrganizationModules,
} from '@/lib/auth/modules'
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
import {
  capabilitiesExceedProfile,
  clampCapabilitiesToProfile,
} from '@/lib/auth/user-admin'
import { normalizeCommercialProfile, type CommercialProfile } from '@/lib/identity'
import { writeAuditEntry } from '@/lib/audit/write'

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
  /**
   * Módulos contratados (1.4). Llega como el jsonb crudo de PostgREST: se
   * normaliza con `parseOrganizationModules` antes de usarlo, nunca se lee
   * indexando a mano.
   */
  modules?: unknown
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
  /**
   * Perfil comercial: `buyer` · `seller` · `buyer_seller`.
   *
   * Es el TECHO de `can_buy` / `can_sell` de cada miembro. Faltaba aquí, y esa
   * ausencia era la causa real de «no se puede activar el perfil de vendedor»:
   * la columna existía y los triggers la respetaban, pero ningún formulario la
   * escribía, así que toda organización nacía con el default `buyer` y la
   * casilla «Vender» salía deshabilitada para siempre.
   */
  commercial_profile?: CommercialProfile
}

/**
 * Perfil comercial validado contra la allowlist, o `null` si no se reconoce.
 *
 * Se normaliza SIEMPRE en servidor: el valor llega de un `<select>` del
 * navegador y ahí no se puede confiar en nada. El CHECK
 * `organizations_commercial_profile_check` lo vuelve a exigir en SQL.
 */
function perfilComercialValido(raw: unknown): CommercialProfile | null {
  return normalizeCommercialProfile(typeof raw === 'string' ? raw : null)
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

  // Sin perfil explícito se mantiene el default histórico de la columna
  // (`buyer`), que es el más restrictivo de los tres: una empresa nueva no
  // vende hasta que alguien lo decide a conciencia.
  const perfil = perfilComercialValido(formData.commercial_profile) ?? 'buyer'

  const { data, error } = await supabase
    .from('organizations')
    .insert({
      name: formData.name.trim(),
      commercial_profile: perfil,
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
  const { supabase, userId: actorId } = await requirePlatformAdmin()

  // El perfil comercial solo se toca si el formulario lo trae. Un `undefined`
  // NO se convierte en `buyer`: eso degradaría en silencio a una empresa
  // vendedora cada vez que se guardara el formulario desde una pantalla que no
  // incluyera el campo.
  const perfil = perfilComercialValido(formData.commercial_profile)

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
      ...(perfil ? { commercial_profile: perfil } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) throw new Error(error.message)

  if (perfil) await retirarCapacidadesFueraDeTecho(supabase, id, perfil, actorId)
}

/**
 * Retira de cada miembro las capacidades que el nuevo perfil comercial ya no
 * contempla.
 *
 * ── Por qué hace falta ─────────────────────────────────────────────────────
 *
 * El trigger `enforce_membership_rules` vigila el techo comercial, pero solo se
 * dispara al escribir en `organization_members`. Bajar el perfil de la EMPRESA
 * no recorre a sus miembros, así que sin esto quedaban filas con `can_sell` bajo
 * una organización `buyer`.
 *
 * ── Por qué no es un riesgo de seguridad, y aun así se corrige ─────────────
 *
 * `can_sell_in_org()` exige LAS DOS cosas —la marca del miembro y el perfil de
 * la empresa—, así que una capacidad huérfana nunca concedió nada. Lo que
 * producía era una interfaz que mentía: enseñaba «Vende» a quien no podía
 * vender, y al volver a ampliar el perfil la capacidad reaparecía sin que nadie
 * la hubiera concedido de nuevo.
 *
 * SOLO RETIRA. Ampliar el perfil no activa capacidades a nadie.
 */
async function retirarCapacidadesFueraDeTecho(
  supabase: Awaited<ReturnType<typeof requirePlatformAdmin>>['supabase'],
  organizationId: string,
  perfil: CommercialProfile,
  actorId: string,
): Promise<void> {
  const { data: miembros, error } = await supabase
    .from('organization_members')
    .select('id, user_id, can_buy, can_sell')
    .eq('organization_id', organizationId)

  if (error) {
    console.error(signupErrorDetail('lectura de miembros tras cambio de perfil', error))
    return
  }

  for (const m of miembros ?? []) {
    const actuales = { canBuy: m.can_buy === true, canSell: m.can_sell === true }
    if (!capabilitiesExceedProfile(perfil, actuales)) continue

    const recortadas = clampCapabilitiesToProfile(perfil, actuales)

    const { error: updErr } = await supabase
      .from('organization_members')
      .update({ can_buy: recortadas.canBuy, can_sell: recortadas.canSell })
      .eq('id', m.id)

    if (updErr) {
      // No se aborta el bucle: cada miembro es independiente y dejar a los
      // demás sin recortar por un fallo puntual sería peor.
      console.error(signupErrorDetail(`recorte de capacidades de ${m.id}`, updErr))
      continue
    }

    await writeAuditEntry(supabase, {
      actorId,
      action: 'membership.capabilities_changed',
      targetUserId: m.user_id as string,
      targetOrganizationId: organizationId,
      before: { can_buy: actuales.canBuy, can_sell: actuales.canSell },
      after: { can_buy: recortadas.canBuy, can_sell: recortadas.canSell },
    })
  }
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
 * Activa o desactiva los módulos contratados por un cliente (1.4).
 *
 * ── Las cuatro capas que protegen esto ──────────────────────────────────────
 *
 *   1. `requirePlatformAdmin('throw')` — exige sesión, rol `platform_admin` y
 *      perfil ACTIVO. Un administrador suspendido no pasa de aquí.
 *   2. La organización se comprueba de verdad: el UPDATE devuelve las filas
 *      afectadas y cero filas se trata como error, así que un identificador
 *      inexistente no se salda con un «guardado» silencioso.
 *   3. RLS — el UPDATE viaja por el cliente NORMAL, sujeto a
 *      `org_admin_all`/`org_owner_update`. No se usa la service role.
 *   4. El trigger `protect_organization_columns` (027) incluye ahora `modules`
 *      entre las columnas privilegiadas. Esta es la que cierra el vector real:
 *      la persona propietaria de una organización SÍ tiene UPDATE sobre su
 *      propia fila vía `org_owner_update`, así que sin el trigger podría
 *      reactivarse los módulos con un PATCH directo a PostgREST, sin pasar por
 *      esta acción ni por la interfaz.
 *
 * El valor se normaliza con `buildOrganizationModules`: solo `true` estricto
 * activa, y solo se escriben las dos claves conocidas. El CHECK
 * `organizations_modules_valid` vuelve a exigir esa forma en SQL.
 */
export async function setOrganizationModules(
  orgId: string,
  modules: { markets: boolean; quotes: boolean },
): Promise<{ error?: string }> {
  const { supabase } = await requirePlatformAdmin('throw')

  if (!orgId?.trim()) return { error: 'No se ha indicado la organización.' }

  const { data, error } = await supabase
    .from('organizations')
    .update({ modules: buildOrganizationModules(modules) })
    .eq('id', orgId)
    .select('id, modules')

  if (error) {
    console.error(signupErrorDetail('cambio de módulos', error))
    return { error: MODULES_MESSAGES.generico }
  }
  if (!data || data.length === 0) return { error: MODULES_MESSAGES.noEncontrada }

  // El estado de los módulos cambia lo que ve el cliente en su propio panel,
  // no solo esta ficha: se revalidan ambas superficies.
  revalidatePath(`/admin/clientes/${orgId}`)
  revalidatePath('/admin/clientes')
  revalidatePath('/app', 'layout')

  return {}
}

const MODULES_MESSAGES = {
  generico: 'No se han podido guardar los módulos. Inténtalo de nuevo.',
  noEncontrada: 'No se ha encontrado la organización indicada.',
} as const

/** Lectura normalizada de los módulos de un cliente, para la ficha de administración. */
export async function getOrganizationModulesById(
  orgId: string,
): Promise<OrganizationModules> {
  const { supabase } = await requirePlatformAdmin()

  const { data } = await supabase
    .from('organizations')
    .select('modules')
    .eq('id', orgId)
    .maybeSingle()

  return parseOrganizationModules(data?.modules)
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

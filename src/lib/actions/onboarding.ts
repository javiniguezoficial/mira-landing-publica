'use server'

import { requireSession } from '@/lib/auth/guards'
import { isAuthorizationError } from '@/lib/auth/errors'
import {
  SIGNUP_MESSAGES,
  signupErrorDetail,
  translateSignupError,
  validateOrganizationSignup,
} from '@/lib/auth/signup'

export interface OrganizationSignupPayload {
  companyName: string
  planSlug: string
  commercialProfile: string
  cifNif?: string | null
  country?: string | null
  phone?: string | null
}

export interface OnboardingResult {
  organizationId?: string
  error?: string
}

/** Slugs de plan activos. Es la allowlist real; no hay una copia en código. */
export async function getActivePlanSlugs(): Promise<string[]> {
  const { supabase } = await requireSession()
  const { data } = await supabase.from('plans').select('slug').eq('is_active', true)
  return (data ?? []).map((p) => p.slug as string)
}

/**
 * Crea la empresa del usuario recién registrado y lo deja como ÚNICO propietario.
 *
 * Se llama en dos momentos, y por eso tiene que ser idempotente:
 *
 *   · justo después de `signUp`, cuando Supabase devuelve sesión;
 *   · desde `/auth/callback`, cuando hace falta confirmar el email antes.
 *
 * La idempotencia real vive en SQL: `create_organization_with_owner` devuelve la
 * organización existente si el usuario ya tiene una, así que un doble envío, una
 * segunda pestaña o un reintento no crean una segunda empresa.
 *
 * Los datos de empresa viajan en `user_metadata` desde el registro. El navegador
 * puede manipularlos, así que NADA de lo que llega se acepta sin validar: el
 * plan se resuelve contra `plans` activos y el estado lo decide el servidor.
 */
export async function completeOrganizationSignup(
  payload?: OrganizationSignupPayload,
): Promise<OnboardingResult> {
  let sesion
  try {
    sesion = await requireSession()
  } catch (e) {
    if (isAuthorizationError(e)) return { error: SIGNUP_MESSAGES.sinSesion }
    throw e
  }

  const { supabase, userId } = sesion

  // Si ya pertenece a una organización no hay nada que hacer. Se comprueba aquí
  // para ahorrar la llamada, pero la garantía está en la función SQL.
  const { data: yaMiembro } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle()

  if (yaMiembro?.organization_id) {
    return { organizationId: yaMiembro.organization_id as string }
  }

  // Los datos llegan del formulario o, si venimos del callback de email, de la
  // metadata que se guardó al registrarse.
  const { data: auth } = await supabase.auth.getUser()
  const meta = (auth?.user?.user_metadata ?? {}) as Record<string, unknown>

  const entrada = {
    name: payload?.companyName ?? (meta.company as string | undefined) ?? null,
    planSlug: payload?.planSlug ?? (meta.plan_slug as string | undefined) ?? null,
    commercialProfile:
      payload?.commercialProfile ?? (meta.commercial_profile as string | undefined) ?? 'buyer',
    cifNif: payload?.cifNif ?? (meta.cif_nif as string | undefined) ?? null,
    country: payload?.country ?? (meta.country as string | undefined) ?? 'ES',
    phone: payload?.phone ?? (meta.phone as string | undefined) ?? null,
  }

  const planes = await getActivePlanSlugs()
  const fallo = validateOrganizationSignup(entrada, planes)
  if (fallo) return { error: fallo }

  const { data, error } = await supabase.rpc('create_organization_with_owner', {
    p_name: entrada.name,
    p_plan_slug: entrada.planSlug,
    p_commercial_profile: entrada.commercialProfile,
    p_cif_nif: entrada.cifNif,
    p_country: entrada.country,
    p_phone: entrada.phone,
    p_owner_user_id: null,
    p_status: null,
  })

  if (error) {
    console.error(signupErrorDetail('alta desde landing', error))
    return { error: translateSignupError(error) }
  }

  return { organizationId: data as string }
}

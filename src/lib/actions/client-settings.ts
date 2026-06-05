'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

// ─── Constantes permitidas ────────────────────────────────────────────────────

const ALLOWED_LOCALES   = ['es', 'en'] as const
const ALLOWED_CURRENCIES = ['EUR'] as const
const ALLOWED_COUNTRIES  = ['ES', 'FR', 'DE', 'IT', 'PT', 'NL', 'PL'] as const

type AllowedLocale   = (typeof ALLOWED_LOCALES)[number]
type AllowedCurrency = (typeof ALLOWED_CURRENCIES)[number]
type AllowedCountry  = (typeof ALLOWED_COUNTRIES)[number]

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface ClientConfig {
  profile: {
    id: string
    email: string
    first_name: string | null
    last_name: string | null
    phone: string | null
    avatar_url: string | null
    preferred_locale: AllowedLocale
    preferred_currency: AllowedCurrency
    preferred_country: AllowedCountry
  }
}

export interface ActionResult {
  error?: string
  success?: string
}

// ─── Helper: usuario autenticado ──────────────────────────────────────────────

async function requireAuth() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  return { supabase, user }
}

// ─── getClientConfig ──────────────────────────────────────────────────────────

export async function getClientConfig(): Promise<ClientConfig> {
  const { supabase, user } = await requireAuth()

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, phone, avatar_url, preferred_locale, preferred_currency, preferred_country')
    .eq('id', user.id)
    .single()

  if (error || !profile) redirect('/login')

  return {
    profile: {
      id: profile.id,
      email: user.email ?? '',
      first_name: profile.first_name,
      last_name: profile.last_name,
      phone: profile.phone,
      avatar_url: profile.avatar_url,
      preferred_locale:   (ALLOWED_LOCALES.includes(profile.preferred_locale as AllowedLocale)
        ? profile.preferred_locale : 'es') as AllowedLocale,
      preferred_currency: (ALLOWED_CURRENCIES.includes(profile.preferred_currency as AllowedCurrency)
        ? profile.preferred_currency : 'EUR') as AllowedCurrency,
      preferred_country:  (ALLOWED_COUNTRIES.includes(profile.preferred_country as AllowedCountry)
        ? profile.preferred_country : 'ES') as AllowedCountry,
    },
  }
}

// ─── updateClientProfile ──────────────────────────────────────────────────────

export async function updateClientProfile(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const { supabase, user } = await requireAuth()

  const first_name = (formData.get('first_name') as string)?.trim()
  const last_name  = (formData.get('last_name')  as string)?.trim() || null
  const phone      = (formData.get('phone')      as string)?.trim() || null

  if (!first_name) return { error: 'El nombre es obligatorio.' }

  // Solo actualizamos campos de perfil personal. role, organization_id y
  // cualquier otro campo sensible nunca forman parte del payload.
  const { error } = await supabase
    .from('profiles')
    .update({ first_name, last_name, phone })
    .eq('id', user.id)

  if (error) return { error: error.message }

  return { success: 'Perfil actualizado correctamente.' }
}

// ─── updateClientPreferences ──────────────────────────────────────────────────

export async function updateClientPreferences(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const { supabase, user } = await requireAuth()

  const preferred_locale   = (formData.get('preferred_locale')   as string)?.trim()
  const preferred_currency = (formData.get('preferred_currency') as string)?.trim()
  const preferred_country  = (formData.get('preferred_country')  as string)?.trim()

  if (!ALLOWED_LOCALES.includes(preferred_locale as AllowedLocale)) {
    return { error: `Idioma no válido. Valores permitidos: ${ALLOWED_LOCALES.join(', ')}.` }
  }
  if (!ALLOWED_CURRENCIES.includes(preferred_currency as AllowedCurrency)) {
    return { error: `Moneda no válida. Valores permitidos: ${ALLOWED_CURRENCIES.join(', ')}.` }
  }
  if (!ALLOWED_COUNTRIES.includes(preferred_country as AllowedCountry)) {
    return { error: `País no válido. Valores permitidos: ${ALLOWED_COUNTRIES.join(', ')}.` }
  }

  const { error } = await supabase
    .from('profiles')
    .update({ preferred_locale, preferred_currency, preferred_country })
    .eq('id', user.id)

  if (error) return { error: error.message }

  return { success: 'Preferencias guardadas correctamente.' }
}

'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface AdminConfig {
  profile: {
    id: string
    email: string
    first_name: string | null
    last_name: string | null
    phone: string | null
    avatar_url: string | null
  }
  settings: {
    id: string
    platform_name: string
    support_email: string | null
    default_country: string
    default_currency: string
    maintenance_mode: boolean
  }
}

export interface ActionResult {
  error?: string
  success?: string
}

// ─── Helper: verificar platform_admin ────────────────────────────────────────

async function requirePlatformAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'platform_admin') redirect('/login')

  return { supabase, user }
}

// ─── Helper: obtener o crear fila singleton de platform_settings ─────────────

async function getOrCreateSettings(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data, error } = await supabase
    .from('platform_settings')
    .select('*')
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(error.message)

  if (data) return data

  // No existe fila → crearla con valores por defecto
  const { data: created, error: insertError } = await supabase
    .from('platform_settings')
    .insert({
      platform_name: 'MIRA',
      support_email: null,
      default_country: 'ES',
      default_currency: 'EUR',
      maintenance_mode: false,
    })
    .select()
    .single()

  if (insertError) throw new Error(insertError.message)
  return created
}

// ─── getAdminConfig ───────────────────────────────────────────────────────────

export async function getAdminConfig(): Promise<AdminConfig> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, first_name, last_name, phone, avatar_url')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'platform_admin') redirect('/login')

  const settings = await getOrCreateSettings(supabase)

  return {
    profile: {
      id: profile.id,
      email: user.email ?? '',
      first_name: profile.first_name,
      last_name: profile.last_name,
      phone: profile.phone,
      avatar_url: profile.avatar_url,
    },
    settings: {
      id: settings.id,
      platform_name: settings.platform_name,
      support_email: settings.support_email,
      default_country: settings.default_country,
      default_currency: settings.default_currency,
      maintenance_mode: settings.maintenance_mode,
    },
  }
}

// ─── updateAdminProfile ───────────────────────────────────────────────────────

export async function updateAdminProfile(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const { supabase, user } = await requirePlatformAdmin()

  const first_name = (formData.get('first_name') as string)?.trim()
  const last_name  = (formData.get('last_name')  as string)?.trim() || null
  const phone      = (formData.get('phone')      as string)?.trim() || null

  if (!first_name) return { error: 'El nombre es obligatorio.' }

  const { error } = await supabase
    .from('profiles')
    .update({ first_name, last_name, phone })
    .eq('id', user.id)

  if (error) return { error: error.message }

  return { success: 'Perfil actualizado correctamente.' }
}

// ─── updatePlatformSettings ───────────────────────────────────────────────────

export async function updatePlatformSettings(
  _prev: ActionResult,
  formData: FormData
): Promise<ActionResult> {
  const { supabase } = await requirePlatformAdmin()

  const platform_name    = (formData.get('platform_name')    as string)?.trim()
  const support_email    = (formData.get('support_email')    as string)?.trim() || null
  const default_country  = (formData.get('default_country')  as string)?.trim()
  const default_currency = (formData.get('default_currency') as string)?.trim()
  const maintenance_mode = formData.get('maintenance_mode') === 'true'

  // Validaciones
  if (!platform_name) return { error: 'El nombre de la plataforma es obligatorio.' }
  if (!default_country || !/^[A-Z]{2}$/.test(default_country)) {
    return { error: 'El país por defecto debe ser un código de 2 letras mayúsculas (ej. ES).' }
  }
  if (!default_currency || !/^[A-Z]{3}$/.test(default_currency)) {
    return { error: 'La moneda debe ser un código de 3 letras mayúsculas (ej. EUR).' }
  }
  if (support_email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(support_email)) {
      return { error: 'El email de soporte no tiene un formato válido.' }
    }
  }

  // Obtener o crear fila singleton
  const settings = await getOrCreateSettings(supabase)

  const { error } = await supabase
    .from('platform_settings')
    .update({ platform_name, support_email, default_country, default_currency, maintenance_mode })
    .eq('id', settings.id)

  if (error) return { error: error.message }

  return { success: 'Ajustes de plataforma guardados correctamente.' }
}

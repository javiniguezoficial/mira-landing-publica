// Configuración de la capa de email (Bloque 2).
//
// Módulo PURO: recibe el entorno como parámetro en lugar de leer `process.env`
// por su cuenta, así se puede probar exhaustivamente sin tocar variables
// globales ni contaminar otros tests.
//
// ── Regla que gobierna todo este archivo ──────────────────────────────────
//
// NO SE INVENTA NINGÚN VALOR. Ni el remitente, ni el dominio, ni la dirección
// interna de soporte, ni la clave. Si falta algo, se dice EXACTAMENTE qué falta
// y no se envía. Un remitente inventado no llegaría a ninguna parte y un
// destinatario inventado es peor: podría llegarle a un tercero.

import type { EmailAddress } from './types'

/** Nombres reales de las variables. Se exportan para poder documentarlas. */
export const EMAIL_ENV_VARS = {
  /** Clave del proveedor. SECRETO: nunca se registra ni se devuelve. */
  apiKey: 'RESEND_API_KEY',
  /** Remitente verificado en el proveedor. `MIRA <soporte@dominio>` o solo la dirección. */
  from: 'EMAIL_FROM',
  /** Buzón interno que recibe el aviso de ticket nuevo. */
  supportInbox: 'SUPPORT_NOTIFICATION_EMAIL',
  /** URL pública ABSOLUTA del logotipo. Opcional. */
  logoUrl: 'MIRA_EMAIL_LOGO_URL',
  /** Base para los enlaces del correo. Ya existía en el proyecto. */
  appUrl: 'NEXT_PUBLIC_APP_URL',
} as const

export interface EmailConfig {
  apiKey: string
  from: EmailAddress
  /** `null` si no se ha configurado: el aviso interno se omite, el del usuario no. */
  supportInbox: string | null
  /** `null` si no hay logotipo. Las plantillas caen entonces al nombre en texto. */
  logoUrl: string | null
  /** Sin barra final. Base de los CTA. */
  appUrl: string
}

export type EmailConfigResult =
  | { ok: true; config: EmailConfig }
  /** Falta configuración: no se envía nada y se dice qué falta. */
  | { ok: false; missing: string[] }

/**
 * Validación deliberadamente simple.
 *
 * Quien valida de verdad una dirección es el proveedor al aceptarla. Aquí solo
 * se descartan los errores gruesos —cadena vacía, sin arroba, con espacios—
 * para no llamar a una API externa con basura evidente.
 */
export function isPlausibleEmail(raw: string | null | undefined): boolean {
  if (typeof raw !== 'string') return false
  const v = raw.trim()
  if (v.length === 0 || /\s/.test(v)) return false
  return /^[^@]+@[^@.]+(\.[^@.]+)+$/.test(v)
}

/**
 * Interpreta `EMAIL_FROM` en sus dos formas admitidas:
 *
 *   `soporte@ejemplo.com`
 *   `MIRA <soporte@ejemplo.com>`
 *
 * Devuelve `null` si la dirección no es plausible — y entonces la variable
 * cuenta como ausente, porque un remitente mal escrito es tan inútil como no
 * tenerlo.
 */
export function parseFromAddress(raw: string | null | undefined): EmailAddress | null {
  if (typeof raw !== 'string') return null
  const v = raw.trim()
  if (v.length === 0) return null

  const conNombre = v.match(/^(.*?)\s*<([^>]+)>$/)
  if (conNombre) {
    const nombre = conNombre[1].trim().replace(/^["']|["']$/g, '')
    const email = conNombre[2].trim()
    if (!isPlausibleEmail(email)) return null
    return nombre ? { email, name: nombre } : { email }
  }

  return isPlausibleEmail(v) ? { email: v } : null
}

/**
 * Solo se admite una URL absoluta `https:` para el logotipo.
 *
 * Una ruta relativa (`/logo.png`) no sirve: el correo se abre fuera de la
 * aplicación y no hay ningún origen contra el que resolverla. `http:` tampoco:
 * muchos clientes bloquean el contenido mixto y la imagen no se vería.
 */
export function normalizeLogoUrl(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null
  const v = raw.trim()
  if (v.length === 0) return null
  try {
    const url = new URL(v)
    return url.protocol === 'https:' ? url.toString() : null
  } catch {
    return null
  }
}

/** Quita la barra final para que los CTA no acaben con `//`. */
export function normalizeAppUrl(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null
  const v = raw.trim().replace(/\/+$/, '')
  if (v.length === 0) return null
  try {
    const url = new URL(v)
    return url.protocol === 'https:' || url.protocol === 'http:' ? v : null
  } catch {
    return null
  }
}

/**
 * Resuelve la configuración a partir del entorno.
 *
 * ── Qué es obligatorio y qué no ────────────────────────────────────────────
 *
 * OBLIGATORIO   `RESEND_API_KEY`, `EMAIL_FROM`, `NEXT_PUBLIC_APP_URL`.
 *               Sin los tres no hay envío posible: falta con qué autenticarse,
 *               desde qué dirección, o a dónde apuntan los enlaces.
 *
 * OPCIONAL      `SUPPORT_NOTIFICATION_EMAIL` — sin ella se omite SOLO el aviso
 *               interno; la confirmación al usuario se envía igual. Puede
 *               llegar también desde `platform_settings.support_email`, que ya
 *               existe en el proyecto (ver `resolveSupportInbox`).
 *
 * OPCIONAL      `MIRA_EMAIL_LOGO_URL` — sin ella la cabecera usa el nombre en
 *               texto. Un correo sin logotipo se lee perfectamente; uno con un
 *               enlace roto, no.
 *
 * `missing` lleva los nombres de las variables, NUNCA sus valores.
 */
export function resolveEmailConfig(env: Record<string, string | undefined>): EmailConfigResult {
  const missing: string[] = []

  const apiKey = env[EMAIL_ENV_VARS.apiKey]?.trim()
  if (!apiKey) missing.push(EMAIL_ENV_VARS.apiKey)

  const from = parseFromAddress(env[EMAIL_ENV_VARS.from])
  if (!from) missing.push(EMAIL_ENV_VARS.from)

  const appUrl = normalizeAppUrl(env[EMAIL_ENV_VARS.appUrl])
  if (!appUrl) missing.push(EMAIL_ENV_VARS.appUrl)

  if (missing.length > 0) return { ok: false, missing }

  const inbox = env[EMAIL_ENV_VARS.supportInbox]?.trim()

  return {
    ok: true,
    config: {
      apiKey: apiKey!,
      from: from!,
      supportInbox: isPlausibleEmail(inbox) ? inbox!.trim() : null,
      logoUrl: normalizeLogoUrl(env[EMAIL_ENV_VARS.logoUrl]),
      appUrl: appUrl!,
    },
  }
}

/**
 * Buzón interno de avisos, con la precedencia acordada.
 *
 *   1. `SUPPORT_NOTIFICATION_EMAIL` — decisión explícita de despliegue.
 *   2. `platform_settings.support_email` — configuración que YA existe en el
 *      producto y que la pantalla de Ayuda muestra a los clientes.
 *   3. `null` — no se envía aviso interno. NO se inventa ninguna dirección.
 *
 * El orden no es arbitrario: la variable de entorno la fija quien despliega y
 * debe poder mandar sobre un valor guardado en la base por otra persona.
 */
export function resolveSupportInbox(
  configured: string | null,
  platformSettingsEmail: string | null | undefined,
): string | null {
  if (isPlausibleEmail(configured)) return configured!.trim()
  if (isPlausibleEmail(platformSettingsEmail)) return platformSettingsEmail!.trim()
  return null
}

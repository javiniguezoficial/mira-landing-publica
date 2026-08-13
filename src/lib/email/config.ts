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
  /** Servidor SMTP del correo corporativo. */
  smtpHost: 'SMTP_HOST',
  /** Puerto. Opcional: por defecto 465 (TLS implícito). */
  smtpPort: 'SMTP_PORT',
  /** TLS implícito. Opcional: se deduce del puerto si no se indica. */
  smtpSecure: 'SMTP_SECURE',
  /** Cuenta con la que autenticarse. Puede no coincidir con `EMAIL_FROM`. */
  smtpUser: 'SMTP_USER',
  /** SECRETO: nunca se registra, ni se devuelve, ni aparece en ningún error. */
  smtpPassword: 'SMTP_PASSWORD',
  /** Remitente. `MIRA <soporte@dominio>` o solo la dirección. */
  from: 'EMAIL_FROM',
  /** Buzón interno que recibe el aviso de ticket nuevo. */
  supportInbox: 'SUPPORT_NOTIFICATION_EMAIL',
  /** URL pública ABSOLUTA del logotipo. Opcional. */
  logoUrl: 'MIRA_EMAIL_LOGO_URL',
  /** Base para los enlaces del correo. Ya existía en el proyecto. */
  appUrl: 'NEXT_PUBLIC_APP_URL',
} as const

/** Puerto por omisión: TLS implícito, que es lo que ofrece cPanel. */
export const DEFAULT_SMTP_PORT = 465

export interface SmtpConfig {
  host: string
  port: number
  /** `true` = TLS implícito (465). `false` = STARTTLS (587). */
  secure: boolean
  user: string
  /** SECRETO. No se registra ni se serializa en ningún sitio. */
  password: string
}

export interface EmailConfig {
  smtp: SmtpConfig
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
 * Puerto SMTP. Devuelve `null` si el valor existe pero no sirve, para poder
 * distinguir «no configurado» (se usa el defecto) de «mal configurado».
 */
export function parseSmtpPort(raw: string | null | undefined): number | null {
  if (raw === undefined || raw === null) return DEFAULT_SMTP_PORT
  const v = String(raw).trim()
  if (v === '') return DEFAULT_SMTP_PORT
  if (!/^\d+$/.test(v)) return null
  const n = Number(v)
  return n >= 1 && n <= 65535 ? n : null
}

/**
 * TLS implícito. Si no se indica, se deduce del puerto.
 *
 * 465 es TLS desde el primer byte; 587 empieza en claro y sube con STARTTLS.
 * Deducirlo evita la combinación que más falla en cPanel: puerto 465 con
 * `secure=false`, que se queda esperando y acaba en tiempo de espera agotado.
 */
export function parseSmtpSecure(
  raw: string | null | undefined,
  port: number,
): boolean {
  if (raw === undefined || raw === null || String(raw).trim() === '') {
    return port === 465
  }
  const v = String(raw).trim().toLowerCase()
  if (['true', '1', 'yes', 'si', 'sí'].includes(v)) return true
  if (['false', '0', 'no'].includes(v)) return false
  // Valor no reconocido: se deduce igualmente del puerto en lugar de asumir
  // `false`, que es la opción insegura.
  return port === 465
}

/**
 * Resuelve la configuración a partir del entorno.
 *
 * ── Qué es obligatorio y qué no ────────────────────────────────────────────
 *
 * OBLIGATORIO   `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM` y
 *               `NEXT_PUBLIC_APP_URL`. Sin ellos no hay envío posible: falta
 *               a qué servidor conectarse, con qué credenciales, desde qué
 *               dirección, o a dónde apuntan los enlaces.
 *
 * OPCIONAL      `SMTP_PORT` — por defecto 465.
 * OPCIONAL      `SMTP_SECURE` — se deduce del puerto.
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
 * `missing` lleva los nombres de las variables, NUNCA sus valores. Es
 * especialmente importante para `SMTP_PASSWORD`.
 */
export function resolveEmailConfig(env: Record<string, string | undefined>): EmailConfigResult {
  const missing: string[] = []

  const host = env[EMAIL_ENV_VARS.smtpHost]?.trim()
  if (!host) missing.push(EMAIL_ENV_VARS.smtpHost)

  const user = env[EMAIL_ENV_VARS.smtpUser]?.trim()
  if (!user) missing.push(EMAIL_ENV_VARS.smtpUser)

  // NO se recorta: una contraseña puede empezar o acabar con espacio.
  const password = env[EMAIL_ENV_VARS.smtpPassword]
  if (!password) missing.push(EMAIL_ENV_VARS.smtpPassword)

  const port = parseSmtpPort(env[EMAIL_ENV_VARS.smtpPort])
  if (port === null) missing.push(EMAIL_ENV_VARS.smtpPort)

  const from = parseFromAddress(env[EMAIL_ENV_VARS.from])
  if (!from) missing.push(EMAIL_ENV_VARS.from)

  const appUrl = normalizeAppUrl(env[EMAIL_ENV_VARS.appUrl])
  if (!appUrl) missing.push(EMAIL_ENV_VARS.appUrl)

  if (missing.length > 0) return { ok: false, missing }

  const inbox = env[EMAIL_ENV_VARS.supportInbox]?.trim()

  return {
    ok: true,
    config: {
      smtp: {
        host: host!,
        port: port!,
        secure: parseSmtpSecure(env[EMAIL_ENV_VARS.smtpSecure], port!),
        user: user!,
        password: password!,
      },
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

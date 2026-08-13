// URLs de retorno de los correos de Supabase Auth (Bloque 2).
//
// Módulo PURO: recibe la base como parámetro para poder probarlo sin entorno.
//
// ── El fallo que corrige ──────────────────────────────────────────────────
//
// `signUp()` NO pasaba `emailRedirectTo`. Sin ese parámetro, el enlace del
// correo de confirmación usa la «Site URL» del panel de Supabase, que es un
// único valor global. Consecuencias reales:
//
//   · en desarrollo, confirmar una cuenta te lleva a producción;
//   · si la Site URL apunta a la raíz, se pierde el paso por `/auth/callback`,
//     que es justamente donde `completeOrganizationSignup()` crea la empresa
//     de quien se acaba de registrar.
//
// El flujo de recuperación de contraseña YA lo hacía bien
// (`RecoverPasswordPage`), así que aquí se reutiliza exactamente su forma en
// lugar de inventar otra.
//
// ── Por qué se pasa por `/auth/callback` y no a la página final ───────────
//
// Porque el enlace del correo trae un `code` que hay que canjear por sesión.
// `/auth/callback` lo canjea, completa el alta pendiente y solo entonces
// redirige a `next`. Apuntar directamente al destino final dejaría al usuario
// autenticado a medias y sin organización.

/** Ruta que canjea el código del correo por una sesión. */
export const AUTH_CALLBACK_PATH = '/auth/callback'

/** Destino tras confirmar el alta. */
export const SIGNUP_NEXT_PATH = '/app/dashboard'

/** Destino tras pulsar el enlace de recuperación de contraseña. */
export const RECOVERY_NEXT_PATH = '/actualizar-password'

/**
 * Normaliza la base: sin barra final y solo `http:`/`https:`.
 *
 * Devuelve `null` ante cualquier cosa que no sea una URL absoluta utilizable.
 * Un valor inválido NO se sustituye por un dominio inventado: quien llama
 * decide qué hacer, y lo correcto es omitir `emailRedirectTo` y dejar que
 * Supabase use su Site URL antes que mandar a la gente a un dominio erróneo.
 */
export function normalizeBaseUrl(raw: string | null | undefined): string | null {
  if (typeof raw !== 'string') return null
  const v = raw.trim().replace(/\/+$/, '')
  if (v.length === 0) return null
  try {
    const url = new URL(v)
    return url.protocol === 'http:' || url.protocol === 'https:' ? v : null
  } catch {
    return null
  }
}

/**
 * URL completa de retorno para un correo de Auth.
 *
 * `next` se codifica como parámetro porque `/auth/callback` ya lo valida
 * (`destinoSeguro`): solo admite rutas internas, así que un `next` externo se
 * descarta allí. Aquí se construye únicamente a partir de constantes del
 * propio módulo, nunca de nada que venga del navegador.
 */
export function buildAuthRedirectUrl(
  baseUrl: string | null | undefined,
  nextPath: string,
): string | null {
  const base = normalizeBaseUrl(baseUrl)
  if (!base) return null
  return `${base}${AUTH_CALLBACK_PATH}?next=${encodeURIComponent(nextPath)}`
}

/** Retorno del correo de confirmación de alta. */
export function buildSignupRedirectUrl(baseUrl: string | null | undefined): string | null {
  return buildAuthRedirectUrl(baseUrl, SIGNUP_NEXT_PATH)
}

/** Retorno del correo de recuperación de contraseña. */
export function buildRecoveryRedirectUrl(baseUrl: string | null | undefined): string | null {
  return buildAuthRedirectUrl(baseUrl, RECOVERY_NEXT_PATH)
}

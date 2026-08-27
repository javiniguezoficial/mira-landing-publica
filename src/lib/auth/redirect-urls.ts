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
 * Aterrizaje de una INVITACIÓN. No pasa por `/auth/callback`, y es deliberado.
 *
 * ── Por qué este flujo necesita otro destino ─────────────────────────────
 *
 * `/auth/callback` es un Route Handler: código de SERVIDOR. Sirve para los
 * enlaces que vuelven con `?code=` (PKCE), que es lo que ocurre cuando la
 * petición salió del propio navegador —recuperar contraseña, confirmar alta—.
 *
 * Una invitación la envía el SERVIDOR con `admin.inviteUserByEmail()`. La
 * persona invitada nunca ha visitado la aplicación, así que su navegador no
 * tiene el «code verifier» que exige PKCE, y Supabase devuelve la sesión en el
 * FRAGMENTO de la URL (`#access_token=…`). El fragmento no se envía al
 * servidor: el Route Handler no puede verlo ni podrá nunca.
 *
 * Por eso la invitación aterriza en una pantalla de CLIENTE. Unificarlo con el
 * callback sería volver al fallo que se está corrigiendo.
 */
export const INVITE_LANDING_PATH = '/auth/invitacion'

// ═══════════════════════════════════════════════════════════════════════════
// HOSTS QUE NUNCA PUEDEN VIAJAR EN UN ENLACE (044 · hotfix)
// ═══════════════════════════════════════════════════════════════════════════
//
// ── El fallo que se corrige ───────────────────────────────────────────────
//
// El cliente recibió un enlace que terminaba en
//
//   https://0.0.0.0:3000/login?error=auth      → ERR_ADDRESS_INVALID
//
// `0.0.0.0` es la dirección de ESCUCHA del contenedor (`ENV HOSTNAME="0.0.0.0"`
// en el Dockerfile, con `PORT=3000`). Es una dirección comodín: significa
// «acepta conexiones por cualquier interfaz». NO es una dirección a la que
// nadie pueda conectarse, y por eso el navegador ni siquiera lo intenta.
//
// ── Por qué se rechazan unas siempre y otras solo en producción ───────────
//
//   0.0.0.0 · :: · 0        SIEMPRE. No son alcanzables desde ningún sitio,
//                           tampoco desde la propia máquina. Un enlace a
//                           `0.0.0.0` está roto en desarrollo igual que en
//                           producción, así que no hay ningún motivo para
//                           admitirlo nunca.
//
//   localhost · 127.0.0.1   SOLO en producción. En desarrollo son la base
//   · ::1                   correcta y necesaria (`http://localhost:3000`).
//                           En producción significan «este contenedor», y un
//                           correo con ese enlace lleva al usuario a su propio
//                           ordenador.
//
// La lista se compara sobre `hostname`, no sobre la cadena entera: así da igual
// el puerto, el esquema o la barra final.

const HOSTS_NUNCA_PUBLICOS = new Set(['0.0.0.0', '::', '[::]', '0'])
const HOSTS_SOLO_EN_DESARROLLO = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

/**
 * ¿Se puede meter este host en un enlace que va a abrir otra persona?
 *
 * `enProduccion` se pasa como parámetro en lugar de leer `process.env` aquí
 * dentro, para que el módulo siga siendo puro y los dos casos se puedan probar
 * sin tocar variables globales.
 */
export function isPubliclyReachableHost(hostname: string, enProduccion: boolean): boolean {
  const h = hostname.trim().toLowerCase()
  if (h.length === 0) return false
  if (HOSTS_NUNCA_PUBLICOS.has(h)) return false
  if (enProduccion && HOSTS_SOLO_EN_DESARROLLO.has(h)) return false
  return true
}

function esProduccion(): boolean {
  return process.env.NODE_ENV === 'production'
}

/**
 * Normaliza la base: sin barra final, solo `http:`/`https:`, y con un host al
 * que de verdad se pueda llegar.
 *
 * Devuelve `null` ante cualquier cosa que no sea una URL absoluta utilizable.
 * Un valor inválido NO se sustituye por un dominio inventado: quien llama
 * decide qué hacer, y lo correcto es omitir `emailRedirectTo` y dejar que
 * Supabase use su Site URL antes que mandar a la gente a un dominio erróneo.
 *
 * Desde el hotfix, «inservible» incluye además una base cuyo host no sea
 * alcanzable — `0.0.0.0` el primero. Antes se aceptaba: es una URL
 * sintácticamente válida, y `new URL()` no tiene por qué saber que nadie puede
 * abrirla.
 */
export function normalizeBaseUrl(
  raw: string | null | undefined,
  enProduccion: boolean = esProduccion(),
): string | null {
  if (typeof raw !== 'string') return null
  const v = raw.trim().replace(/\/+$/, '')
  if (v.length === 0) return null
  try {
    const url = new URL(v)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    if (!isPubliclyReachableHost(url.hostname, enProduccion)) return null
    return v
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

/**
 * Retorno del correo de INVITACIÓN.
 *
 * A diferencia de los otros dos, NO pasa por `/auth/callback?next=…`: apunta
 * directamente a la pantalla de cliente que sabe leer el fragmento. Ver
 * `INVITE_LANDING_PATH`.
 *
 * Misma validación de base que el resto: si `NEXT_PUBLIC_APP_URL` no sirve
 * —`0.0.0.0`, `localhost` en producción, o ausente— devuelve `null` y quien
 * llama omite `redirectTo`, antes que mandar a nadie a una dirección rota.
 */
export function buildInviteRedirectUrl(baseUrl: string | null | undefined): string | null {
  const base = normalizeBaseUrl(baseUrl)
  if (!base) return null
  return `${base}${INVITE_LANDING_PATH}`
}

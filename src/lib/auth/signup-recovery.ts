// Recuperación del alta pública cuando el callback de email no puede cerrarla.
//
// Módulo PURO: decide, no ejecuta. Lo consumen `/auth/callback`, la pantalla
// de login y `completeOrganizationSignup`, y por ser puro se prueba entero sin
// Supabase.
//
// ═══════════════════════════════════════════════════════════════════════════
// EL CASO REAL QUE CUBRE (14-09-2026, QA con logs delante)
// ═══════════════════════════════════════════════════════════════════════════
//
// 1. Alguien se registra en `/registro`. `signUp()` guarda los datos de la
//    empresa en `user_metadata` y GoTrue crea un «flow state» PKCE.
// 2. El correo de confirmación llega, pero la persona lo abre 5, 10 o 30
//    minutos después. `/verify` CONFIRMA el email —eso ya no se deshace— y
//    redirige a `/auth/callback?code=…`.
// 3. El callback intenta canjear el código y GoTrue responde
//    `422 flow_state_expired`: el flow state caduca antes que el enlace.
// 4. Resultado sin este módulo: correo confirmado, cuenta viva, CERO sesión,
//    CERO organización —`completeOrganizationSignup()` solo corría en el
//    callback— y una pantalla de login con `?error=auth` que ni siquiera
//    pintaba mensaje. La cuenta quedaba a medias para siempre.
//
// La regla nueva: el callback es el camino RÁPIDO, no el único. Si falla por
// flow state, el login lo cuenta en claro («tu correo ya está confirmado»), y
// el PRIMER login detecta por la metadata que el alta quedó a medias y la
// completa. La idempotencia vive en SQL (la RPC devuelve la organización
// existente y, desde la 052, un advisory lock serializa las carreras).

// ── Códigos de fallo del canje que NO invalidan la confirmación ─────────────
//
// Cuando el canje muere por el flow state, `/verify` ya corrió: el correo
// QUEDÓ confirmado. Decir «enlace inválido» sería mentira; lo correcto es
// mandar a iniciar sesión.

export const FLOW_STATE_ERROR_CODES = new Set(['flow_state_expired', 'flow_state_not_found'])

export function isFlowStateError(code: string | null | undefined): boolean {
  return typeof code === 'string' && FLOW_STATE_ERROR_CODES.has(code)
}

/** Destinos del callback cuando el canje falla. Rutas internas y constantes. */
export const EMAIL_CONFIRMED_LOGIN_PATH = '/login?aviso=email-confirmado'
export const AUTH_ERROR_LOGIN_PATH = '/login?error=auth'

export function callbackFailureRedirect(code: string | null | undefined): string {
  return isFlowStateError(code) ? EMAIL_CONFIRMED_LOGIN_PATH : AUTH_ERROR_LOGIN_PATH
}

// ── Lo que la pantalla de login debe contar ─────────────────────────────────

export interface LoginNotice {
  tone: 'info' | 'error'
  text: string
}

export const LOGIN_NOTICES = {
  emailConfirmado: {
    tone: 'info',
    text: 'Tu correo ya está confirmado. Inicia sesión para completar tu cuenta.',
  },
  enlaceInvalido: {
    tone: 'error',
    text: 'El enlace no es válido o ha caducado. Inicia sesión o solicita uno nuevo desde «He olvidado mi contraseña».',
  },
} as const satisfies Record<string, LoginNotice>

/**
 * Traduce los parámetros de la URL de login a un aviso pintable, o a ninguno.
 *
 * Solo entiende valores de una lista cerrada: cualquier otra cosa en la URL se
 * ignora, así que no hay forma de inyectar texto en la pantalla.
 */
export function loginNoticeFor(params: {
  aviso?: string | null
  error?: string | null
}): LoginNotice | null {
  if (params.aviso === 'email-confirmado') return LOGIN_NOTICES.emailConfirmado
  if (params.error === 'auth') return LOGIN_NOTICES.enlaceInvalido
  return null
}

// ── Detección de alta a medias ──────────────────────────────────────────────

/** Marca que `completeOrganizationSignup` deja en la metadata al terminar. */
export const ONBOARDING_COMPLETED_KEY = 'onboarding_completed_at'

/**
 * ¿Esta cuenta registró una empresa que aún no se ha materializado?
 *
 * Regla deliberadamente conservadora: solo dispara cuando hay un nombre de
 * empresa REAL en la metadata y la marca de completado no existe. Una cuenta
 * invitada por un administrador no lleva `company` en la metadata, así que
 * nunca dispara ahí; y una metadata incompleta o manipulada, como mucho,
 * provoca una llamada a una acción que valida todo de nuevo y falla en seco
 * sin escribir nada.
 */
export function needsOnboardingCompletion(
  metadata: Record<string, unknown> | null | undefined,
): boolean {
  if (!metadata) return false
  const company = metadata.company
  if (typeof company !== 'string' || company.trim().length === 0) return false
  return !metadata[ONBOARDING_COMPLETED_KEY]
}

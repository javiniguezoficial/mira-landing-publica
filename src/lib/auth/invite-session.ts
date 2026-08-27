// Cierre del flujo de invitación de Supabase Auth.
//
// Módulo PURO: no importa Supabase, ni React, ni el navegador. Solo interpreta
// lo que llega en la URL y decide a dónde hay que ir. Así se puede probar
// exhaustivamente sin montar una sesión real.
//
// ═══════════════════════════════════════════════════════════════════════════
// EL FALLO QUE CORRIGE, Y POR QUÉ SOLO PASABA CON LAS INVITACIONES
// ═══════════════════════════════════════════════════════════════════════════
//
// Pulsar «Aceptar invitación» terminaba en
//
//   /login?error=auth#access_token=…
//
// Ese `#access_token=…` es la pista entera. Supabase tiene dos formas de
// devolver la sesión después de validar el enlace de un correo:
//
//   PKCE      vuelve con  ?code=…      → el SERVIDOR lo canjea
//   implícito vuelve con  #access_token=…&refresh_token=…  → solo el NAVEGADOR
//
// PKCE exige que el navegador guarde un «code verifier» ANTES de empezar. Se
// crea cuando la petición sale del propio navegador. Y ahí está la asimetría:
//
//   · recuperar contraseña  `resetPasswordForEmail()` se llama desde un
//                           componente de cliente → hay verifier → PKCE →
//                           vuelve `?code=` → `/auth/callback` lo canjea. FUNCIONA.
//
//   · confirmar alta        `signUp()` también desde el navegador → igual.
//
//   · INVITACIÓN            `admin.inviteUserByEmail()` se llama desde el
//                           SERVIDOR. La persona invitada no ha visitado nada
//                           todavía: su navegador no tiene ningún verifier.
//                           Supabase no puede usar PKCE y devuelve la sesión en
//                           el FRAGMENTO.
//
// Y el fragmento de una URL NO SE ENVÍA NUNCA AL SERVIDOR: es cosa del
// navegador. `/auth/callback` es un Route Handler —servidor puro—, así que veía
// la petición sin `code`, la daba por inválida y redirigía a `/login?error=auth`.
// El navegador, al seguir esa redirección, ARRASTRA el fragmento original
// porque el destino no traía uno propio (RFC 7231 §7.1.2). De ahí el
// `/login?error=auth#access_token=…` exacto que se vio en QA: un enlace que
// funcionaba perfectamente, tratado como un error por un servidor que no podía
// verlo.
//
// ── La corrección ────────────────────────────────────────────────────────
//
// La invitación deja de pasar por el Route Handler y aterriza en una pantalla
// de CLIENTE, que sí puede leer el fragmento. Recuperación y confirmación de
// alta siguen yendo al callback exactamente igual que hasta ahora: son flujos
// PKCE y funcionan. No se unifican, porque no son lo mismo.

/** Rutas internas admitidas como destino final. Cerrada a propósito. */
export const INVITE_NEXT_PATH = '/actualizar-password'

export interface AuthFragment {
  accessToken: string | null
  refreshToken: string | null
  /** `invite`, `recovery`, `signup`… tal y como lo manda Supabase. */
  type: string | null
  /** Presente cuando el enlace ha caducado o ya se usó. */
  error: string | null
  errorCode: string | null
  errorDescription: string | null
}

const VACIO: AuthFragment = {
  accessToken: null,
  refreshToken: null,
  type: null,
  error: null,
  errorCode: null,
  errorDescription: null,
}

/**
 * Lee el fragmento (`#a=1&b=2`) o la query de la URL de retorno.
 *
 * Acepta las dos porque Supabase usa el fragmento para el flujo implícito y la
 * query para los errores de algunos casos. Quien llama pasa las dos y se queda
 * con la que traiga algo.
 *
 * No lanza nunca: una entrada corrupta devuelve todo a `null`, y quien llama lo
 * trata como «enlace inválido». Un error de análisis no puede tumbar la
 * pantalla en la que alguien está intentando entrar por primera vez.
 */
export function parseAuthFragment(raw: string | null | undefined): AuthFragment {
  if (typeof raw !== 'string') return VACIO

  const limpio = raw.replace(/^[#?]/, '')
  if (limpio.length === 0) return VACIO

  let params: URLSearchParams
  try {
    params = new URLSearchParams(limpio)
  } catch {
    return VACIO
  }

  const valor = (clave: string) => {
    const v = params.get(clave)
    return v !== null && v.trim().length > 0 ? v : null
  }

  return {
    accessToken: valor('access_token'),
    refreshToken: valor('refresh_token'),
    type: valor('type'),
    error: valor('error'),
    errorCode: valor('error_code'),
    errorDescription: valor('error_description'),
  }
}

/** ¿Trae este fragmento una sesión utilizable? */
export function hasSessionTokens(fragment: AuthFragment): boolean {
  return Boolean(fragment.accessToken && fragment.refreshToken)
}

// ═══════════════════════════════════════════════════════════════════════════
// Qué hacer con lo que ha llegado
// ═══════════════════════════════════════════════════════════════════════════

export type InviteOutcome =
  /** Hay sesión en el fragmento: establecerla y seguir. */
  | { kind: 'session'; accessToken: string; refreshToken: string }
  /** Ha llegado un `?code=`: es PKCE, hay que canjearlo. */
  | { kind: 'code'; code: string }
  /** Supabase dice que el enlace ya no vale. */
  | { kind: 'expired'; reason: string }
  /** No hay nada aprovechable. */
  | { kind: 'invalid' }

/**
 * Decide qué hacer con la URL de retorno de una invitación.
 *
 * El orden importa: primero el ERROR explícito de Supabase —si dice que el
 * enlace caducó, da igual lo demás—, después la sesión, después el código.
 */
export function resolveInvite(
  fragmentRaw: string | null | undefined,
  queryRaw: string | null | undefined,
): InviteOutcome {
  const fragmento = parseAuthFragment(fragmentRaw)
  const query = parseAuthFragment(queryRaw)

  const error = fragmento.error ?? query.error
  const errorCode = fragmento.errorCode ?? query.errorCode
  if (error) {
    return { kind: 'expired', reason: errorCode ?? error }
  }

  if (hasSessionTokens(fragmento)) {
    return {
      kind: 'session',
      accessToken: fragmento.accessToken!,
      refreshToken: fragmento.refreshToken!,
    }
  }

  // `?code=` es el camino PKCE. Una invitación no debería traerlo —se envía
  // desde el servidor y no hay verifier—, pero si la configuración de Supabase
  // cambiara algún día, aquí no se pierde: se intenta canjear.
  let code: string | null = null
  try {
    code = new URLSearchParams((queryRaw ?? '').replace(/^[#?]/, '')).get('code')
  } catch {
    code = null
  }
  if (code && code.trim().length > 0) return { kind: 'code', code }

  return { kind: 'invalid' }
}

// ═══════════════════════════════════════════════════════════════════════════
// Mensajes
// ═══════════════════════════════════════════════════════════════════════════

export const INVITE_MESSAGES = {
  expirado:
    'Este enlace de invitación ya no es válido. Puede haber caducado o haberse usado antes. ' +
    'Pide a tu contacto en MIRA que te envíe uno nuevo.',
  invalido:
    'No hemos podido validar el enlace de invitación. Ábrelo de nuevo desde el correo original.',
  fallo:
    'No hemos podido completar la invitación. Vuelve a intentarlo o pide un enlace nuevo.',
} as const

export function inviteErrorMessage(outcome: InviteOutcome): string {
  if (outcome.kind === 'expired') return INVITE_MESSAGES.expirado
  if (outcome.kind === 'invalid') return INVITE_MESSAGES.invalido
  return INVITE_MESSAGES.fallo
}

/**
 * Descripción SANITIZADA para el registro del servidor o de la consola.
 *
 * Nunca incluye el token: solo qué clase de retorno ha llegado y, cuando lo
 * hay, el código de error de Supabase, que no es secreto. Un `access_token` en
 * un log es una sesión completa a disposición de quien lea ese log.
 */
export function describeInviteOutcome(outcome: InviteOutcome): string {
  switch (outcome.kind) {
    case 'session':
      return 'invitación: sesión recibida en el fragmento'
    case 'code':
      return 'invitación: código PKCE recibido en la query'
    case 'expired':
      return `invitación: enlace no válido (${outcome.reason})`
    default:
      return 'invitación: la URL de retorno no traía sesión ni código'
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Motivo de la pantalla de contraseña
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Por qué se está pidiendo una contraseña.
 *
 * ── Esto NO es una comprobación de seguridad ─────────────────────────────
 *
 * Llega por la URL y solo elige el TEXTO de la pantalla. No concede permisos,
 * no salta validaciones y no cambia lo que se escribe: quien decide si la
 * contraseña se puede cambiar es la SESIÓN, que ya está establecida. Un valor
 * manipulado como mucho enseña el rótulo equivocado.
 *
 * Se valida igualmente contra una lista cerrada para que no se pueda inyectar
 * texto arbitrario en la pantalla.
 */
export const PASSWORD_REASONS = ['invitacion', 'recuperacion'] as const
export type PasswordReason = (typeof PASSWORD_REASONS)[number]

export const DEFAULT_PASSWORD_REASON: PasswordReason = 'recuperacion'

export function normalizePasswordReason(raw: unknown): PasswordReason {
  if (typeof raw !== 'string') return DEFAULT_PASSWORD_REASON
  return PASSWORD_REASONS.find((r) => r === raw) ?? DEFAULT_PASSWORD_REASON
}

export const PASSWORD_COPY: Record<
  PasswordReason,
  { title: string; intro: string; cta: string; done: string }
> = {
  invitacion: {
    title: 'Crea tu contraseña',
    intro: 'Ya casi está. Elige una contraseña para tu cuenta de MIRA Pricing y entra por primera vez.',
    cta: 'Crear contraseña y entrar',
    done: '¡Cuenta activada! Te llevamos a MIRA Pricing…',
  },
  recuperacion: {
    title: 'Nueva contraseña',
    intro: 'Elige una contraseña nueva para tu cuenta de MIRA Pricing.',
    cta: 'Guardar contraseña',
    done: '¡Contraseña actualizada! Te llevamos a MIRA Pricing…',
  },
}

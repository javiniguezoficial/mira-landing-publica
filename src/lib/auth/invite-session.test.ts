// Cierre del flujo de invitación (hotfix).
//
// ═══════════════════════════════════════════════════════════════════════════
// LA INCIDENCIA
// ═══════════════════════════════════════════════════════════════════════════
//
// Pulsar «Aceptar invitación» terminaba en
//
//   /login?error=auth#access_token=…
//
// El enlace era VÁLIDO. Lo que fallaba era dónde aterrizaba: `/auth/callback`
// es un Route Handler —servidor— y la sesión de una invitación llega en el
// FRAGMENTO de la URL, que el navegador nunca envía al servidor.
//
// Recuperación y confirmación de alta no se veían afectadas porque las inicia
// el navegador: hay «code verifier», Supabase usa PKCE y vuelven con `?code=`,
// que el servidor sí ve. Son flujos distintos y siguen siéndolo.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PASSWORD_REASON,
  INVITE_MESSAGES,
  INVITE_NEXT_PATH,
  PASSWORD_COPY,
  PASSWORD_REASONS,
  describeInviteOutcome,
  hasSessionTokens,
  inviteErrorMessage,
  normalizePasswordReason,
  parseAuthFragment,
  resolveInvite,
} from './invite-session'
import {
  INVITE_LANDING_PATH,
  RECOVERY_NEXT_PATH,
  SIGNUP_NEXT_PATH,
  buildInviteRedirectUrl,
  buildRecoveryRedirectUrl,
  buildSignupRedirectUrl,
  normalizeBaseUrl,
} from './redirect-urls'

function fuente(...ruta: string[]): string {
  return readFileSync(join(process.cwd(), 'src', ...ruta), 'utf8')
}
function sinComentarios(t: string): string {
  return t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

const DEMO = 'https://demo.mirapricing.com'
/** Lo que Supabase devuelve de verdad en una invitación (flujo implícito). */
const FRAGMENTO_REAL =
  '#access_token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.FICTICIO&expires_at=1787000000' +
  '&expires_in=3600&refresh_token=abc123refresh&token_type=bearer&type=invite'

// ═══════════════════════════════════════════════════════════════════════════
// INVITE — el caso que fallaba
// ═══════════════════════════════════════════════════════════════════════════

describe('INVITE · el fragmento real de Supabase', () => {
  it('se lee la sesión que venía en el fragmento', () => {
    const f = parseAuthFragment(FRAGMENTO_REAL)
    expect(f.accessToken).toBeTruthy()
    expect(f.refreshToken).toBe('abc123refresh')
    expect(f.type).toBe('invite')
    expect(hasSessionTokens(f)).toBe(true)
  })

  it('un enlace válido resuelve en SESIÓN, no en error', () => {
    const r = resolveInvite(FRAGMENTO_REAL, '')
    expect(r.kind).toBe('session')
    if (r.kind === 'session') {
      expect(r.accessToken.length).toBeGreaterThan(10)
      expect(r.refreshToken).toBe('abc123refresh')
    }
  })

  it('hacen falta LOS DOS tokens: con uno solo no hay sesión', () => {
    expect(resolveInvite('#access_token=solo', '').kind).toBe('invalid')
    expect(resolveInvite('#refresh_token=solo', '').kind).toBe('invalid')
  })

  it('el destino tras validar es interno y CONSTANTE', () => {
    expect(INVITE_NEXT_PATH).toBe('/actualizar-password')
    expect(INVITE_NEXT_PATH.startsWith('/')).toBe(true)
    expect(INVITE_NEXT_PATH.startsWith('//')).toBe(false)
  })

  it('la invitación NO pasa por /auth/callback', () => {
    const url = buildInviteRedirectUrl(DEMO)
    expect(url).toBe(`${DEMO}${INVITE_LANDING_PATH}`)
    expect(url).not.toContain('/auth/callback')
    expect(url).not.toContain('next=')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// RECOVERY y CONFIRM SIGNUP — no se han tocado
// ═══════════════════════════════════════════════════════════════════════════

describe('RECOVERY · sigue exactamente igual', () => {
  it('sigue yendo a /auth/callback con su `next`', () => {
    expect(buildRecoveryRedirectUrl(DEMO)).toBe(
      `${DEMO}/auth/callback?next=${encodeURIComponent(RECOVERY_NEXT_PATH)}`,
    )
  })

  it('su destino final sigue siendo /actualizar-password', () => {
    expect(RECOVERY_NEXT_PATH).toBe('/actualizar-password')
  })

  it('el callback sigue canjeando `?code=` para PKCE', () => {
    const callback = sinComentarios(fuente('app', 'auth', 'callback', 'route.ts'))
    expect(callback).toContain('exchangeCodeForSession(code)')
    expect(callback).toContain("searchParams.get('code')")
  })

  // La pantalla es la misma, pero el copy por defecto es el de recuperación.
  it('sin `motivo`, el texto es el de recuperación de siempre', () => {
    expect(DEFAULT_PASSWORD_REASON).toBe('recuperacion')
    expect(normalizePasswordReason(undefined)).toBe('recuperacion')
    expect(PASSWORD_COPY.recuperacion.title).toBe('Nueva contraseña')
  })
})

describe('CONFIRM SIGNUP · sigue exactamente igual', () => {
  it('sigue yendo a /auth/callback con su `next`', () => {
    expect(buildSignupRedirectUrl(DEMO)).toBe(
      `${DEMO}/auth/callback?next=${encodeURIComponent(SIGNUP_NEXT_PATH)}`,
    )
  })

  it('su destino sigue siendo el dashboard', () => {
    expect(SIGNUP_NEXT_PATH).toBe('/app/dashboard')
  })

  it('el callback sigue completando el alta pendiente', () => {
    const callback = sinComentarios(fuente('app', 'auth', 'callback', 'route.ts'))
    expect(callback).toContain('completeOrganizationSignup()')
  })
})

describe('los tres flujos tienen destinos DISTINTOS', () => {
  // Unificarlos sería volver al fallo: el callback no puede leer un fragmento.
  it('invitación por un lado; recuperación y alta por el callback', () => {
    const destinos = new Set([
      buildInviteRedirectUrl(DEMO),
      buildRecoveryRedirectUrl(DEMO),
      buildSignupRedirectUrl(DEMO),
    ])
    expect(destinos.size).toBe(3)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Errores
// ═══════════════════════════════════════════════════════════════════════════

describe('enlaces que ya no valen', () => {
  it('token caducado', () => {
    const r = resolveInvite(
      '#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired',
      '',
    )
    expect(r.kind).toBe('expired')
    if (r.kind === 'expired') expect(r.reason).toBe('otp_expired')
    expect(inviteErrorMessage(r)).toBe(INVITE_MESSAGES.expirado)
  })

  it('invitación ya usada: el error manda sobre cualquier token residual', () => {
    const r = resolveInvite('#error=access_denied&error_code=otp_expired&access_token=x&refresh_token=y', '')
    expect(r.kind).toBe('expired')
  })

  it('el error también se lee si Supabase lo manda en la query', () => {
    expect(resolveInvite('', '?error=access_denied&error_code=otp_expired').kind).toBe('expired')
  })

  it('token inválido o URL sin nada aprovechable', () => {
    for (const vacio of ['', '#', '?', null, undefined, '#loquesea', '#=&=&']) {
      expect(resolveInvite(vacio, '').kind, String(vacio)).toBe('invalid')
    }
    expect(inviteErrorMessage({ kind: 'invalid' })).toBe(INVITE_MESSAGES.invalido)
  })

  it('una entrada corrupta no lanza: devuelve todo a null', () => {
    for (const raro of ['#%%%', '#a=%E0%A4%A', '#'.repeat(50)]) {
      expect(() => parseAuthFragment(raro)).not.toThrow()
      expect(() => resolveInvite(raro, raro)).not.toThrow()
    }
  })

  it('`?code=` se acepta como respaldo si algún día llegara por PKCE', () => {
    const r = resolveInvite('', '?code=abc-123')
    expect(r.kind).toBe('code')
    if (r.kind === 'code') expect(r.code).toBe('abc-123')
  })

  it('los mensajes de error explican qué hacer, sin jerga', () => {
    for (const m of Object.values(INVITE_MESSAGES)) {
      expect(m.length).toBeGreaterThan(40)
      expect(m).not.toContain('token')
      expect(m).not.toContain('PKCE')
      expect(m).not.toContain('fragment')
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Seguridad
// ═══════════════════════════════════════════════════════════════════════════

describe('el token no se filtra por ningún lado', () => {
  it('la descripción para el log NUNCA contiene el token', () => {
    const r = resolveInvite(FRAGMENTO_REAL, '')
    const texto = describeInviteOutcome(r)
    expect(texto).not.toContain('eyJ')
    expect(texto).not.toContain('abc123refresh')
    if (r.kind === 'session') {
      expect(texto).not.toContain(r.accessToken)
      expect(texto).not.toContain(r.refreshToken)
    }
  })

  it('ninguna descripción de ningún desenlace lleva token', () => {
    for (const r of [
      resolveInvite(FRAGMENTO_REAL, ''),
      resolveInvite('', '?code=abc-123'),
      resolveInvite('#error=access_denied&error_code=otp_expired', ''),
      resolveInvite('', ''),
    ]) {
      expect(describeInviteOutcome(r)).not.toMatch(/eyJ|abc123refresh|abc-123/)
    }
  })

  const PANTALLA = sinComentarios(fuente('components', 'landing', 'AcceptInvitePage.tsx'))

  it('la pantalla no registra el token ni el mensaje de error del SDK', () => {
    expect(PANTALLA).toContain('describeInviteOutcome(resultado)')
    expect(PANTALLA).not.toMatch(/console\.(info|log|error)\([^)]*accessToken/)
    expect(PANTALLA).not.toMatch(/console\.(info|log|error)\([^)]*resultado\.access/)
    // Del fallo del SDK se registra el `name`, no el `message`, que puede
    // describir el token.
    expect(PANTALLA).toContain('${fallo.name}')
    expect(PANTALLA).not.toContain('fallo.message')
  })

  it('el token no se persiste a mano: se usa `setSession` del SDK', () => {
    expect(PANTALLA).toContain('supabase.auth.setSession')
    expect(PANTALLA).not.toContain('localStorage')
    expect(PANTALLA).not.toContain('sessionStorage')
    expect(PANTALLA).not.toContain('document.cookie')
  })

  it('el fragmento se borra de la barra de direcciones', () => {
    expect(PANTALLA).toContain('history.replaceState')
    expect(PANTALLA).toContain('function limpiarFragmento')
  })

  it('el token NUNCA se mete en una query propia', () => {
    // `access_token=` es la forma de PARÁMETRO; `access_token:` es la propiedad
    // del objeto que se le pasa a `setSession`, que sí tiene que estar. La
    // distinción es el `=` frente al `:`.
    expect(PANTALLA).not.toContain('access_token=')
    expect(PANTALLA).not.toContain('refresh_token=')
    // Lo único que viaja en la query propia es el motivo del copy.
    expect(PANTALLA).toContain('?motivo=invitacion')
  })

  // El destino es una constante del módulo: no sale de la URL.
  it('no hay redirect abierto: el destino no viene del enlace', () => {
    expect(PANTALLA).toContain('router.replace(`${INVITE_NEXT_PATH}?motivo=invitacion`)')
    expect(PANTALLA).not.toMatch(/router\.(push|replace)\([^)]*searchParams/)
    expect(PANTALLA).not.toMatch(/router\.(push|replace)\([^)]*location\.(hash|search)/)
  })

  it('el callback ya no puede arrastrar el fragmento a la página de error', () => {
    const callback = sinComentarios(fuente('app', 'auth', 'callback', 'route.ts'))
    expect(callback).toContain('redirigirAErrorSinFragmento')
    expect(callback).toMatch(/Location: `\$\{ruta\}#`/)
  })

  it('el destino de la invitación no admite host inalcanzable', () => {
    for (const malo of ['https://0.0.0.0:3000', 'http://0.0.0.0', '', 'undefined', null]) {
      expect(buildInviteRedirectUrl(malo as string | null), String(malo)).toBeNull()
    }
  })

  // `0.0.0.0` no es alcanzable desde ningún sitio, así que se rechaza en
  // CUALQUIER entorno. `localhost` en cambio es la base correcta en desarrollo
  // y solo se rechaza en producción — esa regla vive en `normalizeBaseUrl` y se
  // comprueba a ese nivel, donde el entorno se puede pasar como parámetro.
  it('ningún destino generado contiene jamás 0.0.0.0', () => {
    for (const base of [DEMO, 'https://0.0.0.0:3000', 'http://0.0.0.0', null, '']) {
      const url = buildInviteRedirectUrl(base as string | null)
      if (url !== null) expect(url, String(base)).not.toContain('0.0.0.0')
    }
  })

  it('en PRODUCCIÓN, localhost queda descartado como base', () => {
    expect(normalizeBaseUrl('http://localhost:3000', true)).toBeNull()
    expect(normalizeBaseUrl('http://127.0.0.1:3000', true)).toBeNull()
    expect(normalizeBaseUrl('https://0.0.0.0:3000', true)).toBeNull()
    // Y la base real de la demo sí pasa.
    expect(normalizeBaseUrl(DEMO, true)).toBe(DEMO)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// El `motivo` de la pantalla de contraseña
// ═══════════════════════════════════════════════════════════════════════════

describe('copy según el motivo', () => {
  it('invitación dice CREAR, recuperación dice NUEVA', () => {
    expect(PASSWORD_COPY.invitacion.title).toBe('Crea tu contraseña')
    expect(PASSWORD_COPY.invitacion.cta).toContain('Crear')
    expect(PASSWORD_COPY.recuperacion.title).toBe('Nueva contraseña')
  })

  it('a nadie invitado se le dice «restablece»: no tenía contraseña', () => {
    const texto = Object.values(PASSWORD_COPY.invitacion).join(' ').toLowerCase()
    expect(texto).not.toContain('restablec')
    expect(texto).not.toContain('recuperar')
  })

  // Llega por la URL: se valida contra una lista cerrada para que no se pueda
  // inyectar texto arbitrario en la pantalla.
  it('un `motivo` manipulado cae al valor por defecto', () => {
    for (const malo of ['<script>', 'admin', '', null, 7, {}, 'INVITACION']) {
      expect(normalizePasswordReason(malo), String(malo)).toBe('recuperacion')
    }
    expect(normalizePasswordReason('invitacion')).toBe('invitacion')
    expect([...PASSWORD_REASONS]).toEqual(['invitacion', 'recuperacion'])
  })

  it('el `motivo` NO concede nada: solo elige texto', () => {
    const pantalla = sinComentarios(fuente('components', 'landing', 'UpdatePasswordPage.tsx'))
    // Quien autoriza el cambio es `updateUser`, contra la sesión.
    expect(pantalla).toContain('supabase.auth.updateUser({ password })')
    expect(pantalla).not.toMatch(/if \(reason[^)]*\)\s*\{[^}]*updateUser/)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Que la invitación conserva lo que el administrador ya asignó
// ═══════════════════════════════════════════════════════════════════════════

describe('la membership y las capacidades no se tocan al aceptar', () => {
  const PANTALLA = sinComentarios(fuente('components', 'landing', 'AcceptInvitePage.tsx'))
  const PASSWORD = sinComentarios(fuente('components', 'landing', 'UpdatePasswordPage.tsx'))

  // Se crearon al invitar. Aceptar la invitación solo establece la sesión y la
  // contraseña: si tocara pertenencias podría deshacer lo que el admin decidió.
  it('ninguna de las dos pantallas escribe en organization_members', () => {
    for (const [nombre, codigo] of [['invitación', PANTALLA], ['contraseña', PASSWORD]] as const) {
      expect(codigo, nombre).not.toContain('organization_members')
      expect(codigo, nombre).not.toContain('can_buy')
      expect(codigo, nombre).not.toContain('can_sell')
      expect(codigo, nombre).not.toContain('org_role')
    }
  })

  it('la pantalla de contraseña solo lee el rol para elegir a dónde ir', () => {
    expect(PASSWORD).toContain("select('role')")
    expect(PASSWORD).not.toMatch(/\.update\(|\.insert\(|\.delete\(/)
  })
})

// URLs de retorno de los correos de Supabase Auth (Bloque 2).
//
// El fallo que se corrige: `signUp()` no pasaba `emailRedirectTo`, así que el
// enlace del correo de confirmación usaba la «Site URL» global del panel —una
// sola para todos los entornos— y se saltaba `/auth/callback`, que es donde se
// completa el alta de la empresa.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  AUTH_CALLBACK_PATH,
  RECOVERY_NEXT_PATH,
  SIGNUP_NEXT_PATH,
  buildAuthRedirectUrl,
  buildRecoveryRedirectUrl,
  buildSignupRedirectUrl,
  isPubliclyReachableHost,
  normalizeBaseUrl,
} from './redirect-urls'

describe('normalizeBaseUrl', () => {
  it('quita las barras finales', () => {
    expect(normalizeBaseUrl('https://app.ejemplo.com/')).toBe('https://app.ejemplo.com')
    expect(normalizeBaseUrl('https://app.ejemplo.com///')).toBe('https://app.ejemplo.com')
  })

  it('admite http para desarrollo local', () => {
    expect(normalizeBaseUrl('http://localhost:3000')).toBe('http://localhost:3000')
  })

  it('FAIL-CLOSED: ante una base inservible devuelve null, no un dominio inventado', () => {
    for (const malo of ['', '   ', 'undefined', 'no-es-una-url', null, undefined]) {
      expect(normalizeBaseUrl(malo as string | null), String(malo)).toBeNull()
    }
  })
})

describe('buildSignupRedirectUrl', () => {
  it('pasa SIEMPRE por /auth/callback', () => {
    const url = buildSignupRedirectUrl('https://app.ejemplo.com')
    expect(url).toContain(AUTH_CALLBACK_PATH)
    // Es donde se canjea el código y se crea la empresa del recién registrado.
  })

  it('lleva el destino final como parámetro `next` codificado', () => {
    expect(buildSignupRedirectUrl('https://app.ejemplo.com')).toBe(
      `https://app.ejemplo.com/auth/callback?next=${encodeURIComponent(SIGNUP_NEXT_PATH)}`,
    )
  })

  it('con base sin barra final o con ella produce lo mismo', () => {
    expect(buildSignupRedirectUrl('https://app.ejemplo.com/')).toBe(
      buildSignupRedirectUrl('https://app.ejemplo.com'),
    )
  })

  it('nunca produce `undefined/...`', () => {
    // Era exactamente lo que salía al interpolar la variable en crudo.
    expect(buildSignupRedirectUrl(undefined)).toBeNull()
    expect(buildSignupRedirectUrl('')).toBeNull()
  })
})

describe('buildRecoveryRedirectUrl', () => {
  it('apunta a la pantalla de actualizar contraseña', () => {
    expect(buildRecoveryRedirectUrl('https://app.ejemplo.com')).toBe(
      `https://app.ejemplo.com/auth/callback?next=${encodeURIComponent(RECOVERY_NEXT_PATH)}`,
    )
  })

  it('sin base configurada devuelve null y quien llama omite el parámetro', () => {
    expect(buildRecoveryRedirectUrl(null)).toBeNull()
  })
})

describe('buildAuthRedirectUrl — construcción segura', () => {
  it('el destino se codifica, no se concatena en crudo', () => {
    const url = buildAuthRedirectUrl('https://app.ejemplo.com', '/app/dashboard')
    expect(url).toContain('next=%2Fapp%2Fdashboard')
  })

  it('el host SIEMPRE es el de la base, nunca el del destino', () => {
    // Aunque alguien pasara algo con pinta de URL como `next`, el destino viaja
    // codificado dentro del parámetro y `/auth/callback` solo admite rutas
    // internas (ver `destinoSeguro`). El host no se puede cambiar desde aquí.
    const url = buildAuthRedirectUrl('https://app.ejemplo.com', 'https://malicioso.com')
    expect(url!.startsWith('https://app.ejemplo.com/auth/callback?')).toBe(true)
    expect(url).not.toContain('//malicioso.com')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// HOTFIX — ningún enlace público puede salir con un host inalcanzable
// ═══════════════════════════════════════════════════════════════════════════
//
// Incidencia real: el cliente recibió un enlace que terminaba en
// `https://0.0.0.0:3000/login?error=auth` y el navegador respondió
// `ERR_ADDRESS_INVALID`. `0.0.0.0` es la dirección de escucha del contenedor
// (`ENV HOSTNAME="0.0.0.0"` en el Dockerfile), no un destino.

const PROD = true
const DEV = false

describe('isPubliclyReachableHost', () => {
  // Una dirección comodín no es alcanzable desde ningún sitio, tampoco desde
  // la propia máquina: no hay motivo para admitirla en ningún entorno.
  it('0.0.0.0 y equivalentes se rechazan SIEMPRE, también en desarrollo', () => {
    for (const host of ['0.0.0.0', '::', '[::]', '0']) {
      expect(isPubliclyReachableHost(host, PROD), `${host} en prod`).toBe(false)
      expect(isPubliclyReachableHost(host, DEV), `${host} en dev`).toBe(false)
    }
  })

  it('localhost es válido en desarrollo y NO en producción', () => {
    for (const host of ['localhost', '127.0.0.1', '::1', '[::1]']) {
      expect(isPubliclyReachableHost(host, DEV), `${host} en dev`).toBe(true)
      expect(isPubliclyReachableHost(host, PROD), `${host} en prod`).toBe(false)
    }
  })

  it('un dominio real pasa en los dos entornos', () => {
    for (const host of ['demo.mirapricing.com', 'mirapricing.com', 'app.ejemplo.com']) {
      expect(isPubliclyReachableHost(host, PROD), host).toBe(true)
      expect(isPubliclyReachableHost(host, DEV), host).toBe(true)
    }
  })

  it('no distingue mayúsculas ni espacios sobrantes', () => {
    expect(isPubliclyReachableHost('  0.0.0.0 ', DEV)).toBe(false)
    expect(isPubliclyReachableHost('LOCALHOST', PROD)).toBe(false)
    expect(isPubliclyReachableHost('', DEV)).toBe(false)
  })
})

describe('normalizeBaseUrl — el host tiene que existir de verdad', () => {
  it('rechaza 0.0.0.0 con cualquier esquema y puerto', () => {
    for (const base of [
      'https://0.0.0.0:3000',
      'http://0.0.0.0:3000',
      'https://0.0.0.0',
      'http://0.0.0.0:3000/',
    ]) {
      expect(normalizeBaseUrl(base, PROD), base).toBeNull()
      expect(normalizeBaseUrl(base, DEV), base).toBeNull()
    }
  })

  it('rechaza el puerto interno con localhost EN PRODUCCIÓN', () => {
    expect(normalizeBaseUrl('http://localhost:3000', PROD)).toBeNull()
    expect(normalizeBaseUrl('http://127.0.0.1:3000', PROD)).toBeNull()
  })

  it('pero lo sigue admitiendo en desarrollo, que es donde hace falta', () => {
    expect(normalizeBaseUrl('http://localhost:3000', DEV)).toBe('http://localhost:3000')
  })

  it('la base de la demo funciona tal cual', () => {
    expect(normalizeBaseUrl('https://demo.mirapricing.com', PROD)).toBe('https://demo.mirapricing.com')
    expect(normalizeBaseUrl('https://demo.mirapricing.com/', PROD)).toBe('https://demo.mirapricing.com')
  })
})

describe('los enlaces de los correos con la configuración de la demo', () => {
  const DEMO = 'https://demo.mirapricing.com'

  it('alta: URL exacta, con su paso por /auth/callback', () => {
    expect(buildSignupRedirectUrl(DEMO)).toBe(
      `${DEMO}/auth/callback?next=${encodeURIComponent(SIGNUP_NEXT_PATH)}`,
    )
  })

  it('recuperación de contraseña: URL exacta', () => {
    expect(buildRecoveryRedirectUrl(DEMO)).toBe(
      `${DEMO}/auth/callback?next=${encodeURIComponent(RECOVERY_NEXT_PATH)}`,
    )
  })

  // FAIL-CLOSED: es mejor omitir `emailRedirectTo` —y que Supabase use su Site
  // URL, que Javier controla— que mandar a alguien a una dirección rota.
  it('con una base inalcanzable NO se construye enlace: se devuelve null', () => {
    for (const malo of ['https://0.0.0.0:3000', 'http://0.0.0.0', '', 'undefined', null]) {
      expect(buildSignupRedirectUrl(malo as string | null), String(malo)).toBeNull()
      expect(buildRecoveryRedirectUrl(malo as string | null), String(malo)).toBeNull()
    }
  })

  it('NINGÚN enlace generado contiene jamás 0.0.0.0', () => {
    const candidatos = [DEMO, 'https://0.0.0.0:3000', 'http://localhost:3000', null, '']
    for (const base of candidatos) {
      for (const url of [buildSignupRedirectUrl(base), buildRecoveryRedirectUrl(base)]) {
        if (url !== null) expect(url, String(base)).not.toContain('0.0.0.0')
      }
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// El handler del callback no puede volver a nombrar un dominio
// ═══════════════════════════════════════════════════════════════════════════

describe('/auth/callback — redirige con rutas relativas', () => {
  const RUTA = join(process.cwd(), 'src', 'app', 'auth', 'callback', 'route.ts')
  const codigo = readFileSync(RUTA, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

  // Esta era LA línea del fallo.
  it('ya no deriva el `origin` de la petición', () => {
    expect(codigo).not.toContain('origin')
  })

  it('no usa `NextResponse.redirect`, que exige URL absoluta', () => {
    expect(codigo).not.toContain('NextResponse.redirect')
  })

  it('la cabecera Location lleva una ruta interna, sin esquema ni host', () => {
    expect(codigo).toContain('Location: ruta')
    // Dos salidas desde el hotfix de invitaciones: la normal y la de error, que
    // además corta el fragmento heredado. Se comprueban las dos.
    const destinos = [
      ...codigo.matchAll(/redirigirA(?:ErrorSinFragmento)?\(\s*'([^']+)'\s*\)/g),
    ].map((m) => m[1])
    expect(destinos.length).toBeGreaterThan(0)
    for (const d of destinos) {
      expect(d.startsWith('/'), d).toBe(true)
      expect(d.startsWith('//'), d).toBe(false)
      expect(d).not.toContain('://')
    }
  })

  // Un `access_token` que se hereda en la URL de una pantalla de error es una
  // sesión completa en la barra de direcciones. Ver la explicación larga en el
  // propio handler.
  it('la salida de error corta el fragmento heredado', () => {
    expect(codigo).toContain('redirigirAErrorSinFragmento')
    expect(codigo).toMatch(/Location: `\$\{ruta\}#`/)
    expect(codigo).not.toMatch(/return redirigirA\('\/login/)
  })

  it('sigue validando `next` para que nadie salte a un dominio ajeno', () => {
    expect(codigo).toContain('destinoSeguro')
    expect(codigo).toMatch(/startsWith\('\/\/'\)/)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Ningún fallback a un host interno en TODO el código de la aplicación
// ═══════════════════════════════════════════════════════════════════════════

describe('no queda ningún fallback a un host interno', () => {
  it('nadie usa `?? \'http://localhost...\'` como base', () => {
    // `src/lib/constants.ts` exportaba `APP_URL` con ese fallback. Era código
    // muerto, y esa clase de fallback es justo lo que rompió el enlace.
    const constantes = readFileSync(join(process.cwd(), 'src', 'lib', 'constants.ts'), 'utf8')
    expect(constantes).not.toMatch(/\?\?\s*['"]http:\/\/localhost/)
    expect(constantes).not.toMatch(/^export const APP_URL/m)
  })
})

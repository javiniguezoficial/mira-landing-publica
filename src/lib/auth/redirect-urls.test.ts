// URLs de retorno de los correos de Supabase Auth (Bloque 2).
//
// El fallo que se corrige: `signUp()` no pasaba `emailRedirectTo`, así que el
// enlace del correo de confirmación usaba la «Site URL» global del panel —una
// sola para todos los entornos— y se saltaba `/auth/callback`, que es donde se
// completa el alta de la empresa.

import { describe, expect, it } from 'vitest'
import {
  AUTH_CALLBACK_PATH,
  RECOVERY_NEXT_PATH,
  SIGNUP_NEXT_PATH,
  buildAuthRedirectUrl,
  buildRecoveryRedirectUrl,
  buildSignupRedirectUrl,
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

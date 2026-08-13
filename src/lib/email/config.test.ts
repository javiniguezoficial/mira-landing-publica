// Configuración de la capa de email (Bloque 2).
//
// La propiedad que fijan estos tests: SIN CONFIGURACIÓN NO SE INVENTA NADA.
// Ni remitente, ni dominio, ni buzón interno. Y lo que falta se nombra por su
// variable, nunca por su valor.

import { describe, expect, it } from 'vitest'
import {
  EMAIL_ENV_VARS,
  isPlausibleEmail,
  normalizeAppUrl,
  normalizeLogoUrl,
  parseFromAddress,
  resolveEmailConfig,
  resolveSupportInbox,
} from './config'

const COMPLETO = {
  RESEND_API_KEY: 're_clave_de_prueba',
  EMAIL_FROM: 'MIRA <soporte@ejemplo.com>',
  NEXT_PUBLIC_APP_URL: 'https://app.ejemplo.com',
}

describe('resolveEmailConfig — qué es obligatorio', () => {
  it('con las tres obligatorias, resuelve', () => {
    const r = resolveEmailConfig(COMPLETO)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.config.from).toEqual({ email: 'soporte@ejemplo.com', name: 'MIRA' })
    expect(r.config.appUrl).toBe('https://app.ejemplo.com')
  })

  it('sin entorno, nombra LAS TRES variables que faltan', () => {
    const r = resolveEmailConfig({})
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.missing).toEqual([
      EMAIL_ENV_VARS.apiKey,
      EMAIL_ENV_VARS.from,
      EMAIL_ENV_VARS.appUrl,
    ])
  })

  it('falta solo la clave', () => {
    const r = resolveEmailConfig({ ...COMPLETO, RESEND_API_KEY: '' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.missing).toEqual([EMAIL_ENV_VARS.apiKey])
  })

  it('un remitente mal escrito cuenta como AUSENTE, no como válido', () => {
    for (const malo of ['sin-arroba', 'a@b', 'con espacio@x.com', '']) {
      const r = resolveEmailConfig({ ...COMPLETO, EMAIL_FROM: malo })
      expect(r.ok, malo).toBe(false)
      if (r.ok) continue
      expect(r.missing).toContain(EMAIL_ENV_VARS.from)
    }
  })

  it('`missing` lleva NOMBRES de variable, nunca valores', () => {
    const r = resolveEmailConfig({ RESEND_API_KEY: 're_secreto_no_debe_aparecer' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.missing.join(' ')).not.toContain('re_secreto_no_debe_aparecer')
  })
})

describe('opcionales: sin ellas se envía igual', () => {
  it('sin buzón interno la configuración sigue siendo válida', () => {
    const r = resolveEmailConfig(COMPLETO)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.config.supportInbox).toBeNull()
  })

  it('un buzón interno inválido NO se acepta a medias', () => {
    const r = resolveEmailConfig({ ...COMPLETO, SUPPORT_NOTIFICATION_EMAIL: 'no-es-un-correo' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.config.supportInbox).toBeNull()
  })

  it('sin logotipo la configuración sigue siendo válida', () => {
    const r = resolveEmailConfig(COMPLETO)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.config.logoUrl).toBeNull()
  })
})

describe('parseFromAddress', () => {
  it('admite dirección suelta y con nombre', () => {
    expect(parseFromAddress('soporte@ejemplo.com')).toEqual({ email: 'soporte@ejemplo.com' })
    expect(parseFromAddress('MIRA <soporte@ejemplo.com>')).toEqual({
      email: 'soporte@ejemplo.com',
      name: 'MIRA',
    })
  })

  it('quita las comillas del nombre', () => {
    expect(parseFromAddress('"MIRA Soporte" <a@b.com>')).toEqual({
      email: 'a@b.com',
      name: 'MIRA Soporte',
    })
  })

  it('rechaza lo que no es una dirección', () => {
    for (const malo of [null, undefined, '', '   ', 'MIRA <no-valido>', 'a@b']) {
      expect(parseFromAddress(malo as string | null)).toBeNull()
    }
  })
})

describe('normalizeLogoUrl — solo https absoluta', () => {
  it('acepta https', () => {
    expect(normalizeLogoUrl('https://cdn.ejemplo.com/logo.png')).toBe(
      'https://cdn.ejemplo.com/logo.png',
    )
  })

  it('rechaza http, rutas relativas y basura', () => {
    // http lo bloquean muchos clientes por contenido mixto; una ruta relativa
    // no tiene origen contra el que resolverse fuera de la aplicación.
    for (const malo of ['http://cdn.ejemplo.com/logo.png', '/logo.png', 'logo.png', '', null]) {
      expect(normalizeLogoUrl(malo as string | null), String(malo)).toBeNull()
    }
  })
})

describe('normalizeAppUrl', () => {
  it('quita la barra final para que los enlaces no lleven //', () => {
    expect(normalizeAppUrl('https://app.ejemplo.com/')).toBe('https://app.ejemplo.com')
    expect(normalizeAppUrl('https://app.ejemplo.com///')).toBe('https://app.ejemplo.com')
  })

  it('admite http para desarrollo local', () => {
    expect(normalizeAppUrl('http://localhost:3000')).toBe('http://localhost:3000')
  })

  it('rechaza lo que no es URL', () => {
    for (const malo of ['', '   ', 'no-es-una-url', null, undefined]) {
      expect(normalizeAppUrl(malo as string | null), String(malo)).toBeNull()
    }
  })
})

describe('resolveSupportInbox — precedencia', () => {
  it('la variable de entorno manda sobre platform_settings', () => {
    expect(resolveSupportInbox('env@ejemplo.com', 'ajustes@ejemplo.com')).toBe('env@ejemplo.com')
  })

  it('sin variable, cae a platform_settings', () => {
    expect(resolveSupportInbox(null, 'ajustes@ejemplo.com')).toBe('ajustes@ejemplo.com')
  })

  it('sin ninguna de las dos, NULL — no se inventa ninguna dirección', () => {
    expect(resolveSupportInbox(null, null)).toBeNull()
    expect(resolveSupportInbox(null, undefined)).toBeNull()
    expect(resolveSupportInbox('', '')).toBeNull()
  })

  it('un valor inválido no se usa: se pasa al siguiente de la lista', () => {
    expect(resolveSupportInbox('no-valido', 'ajustes@ejemplo.com')).toBe('ajustes@ejemplo.com')
    expect(resolveSupportInbox('no-valido', 'tampoco')).toBeNull()
  })
})

describe('isPlausibleEmail', () => {
  it('acepta lo razonable y rechaza lo evidente', () => {
    expect(isPlausibleEmail('a@b.com')).toBe(true)
    expect(isPlausibleEmail('nombre.apellido@sub.dominio.es')).toBe(true)
    for (const malo of ['', '  ', 'a@b', 'sin-arroba', 'con espacio@b.com', null, undefined]) {
      expect(isPlausibleEmail(malo as string | null), String(malo)).toBe(false)
    }
  })
})

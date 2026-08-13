// Configuración SMTP de la capa de email (Bloque 2 · ajuste final).
//
// La propiedad que fijan estos tests: SIN CONFIGURACIÓN NO SE INVENTA NADA.
// Ni servidor, ni credenciales, ni remitente, ni buzón interno. Y lo que falta
// se nombra por su VARIABLE, nunca por su valor — muy en particular
// `SMTP_PASSWORD`.

import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SMTP_PORT,
  EMAIL_ENV_VARS,
  isPlausibleEmail,
  normalizeAppUrl,
  normalizeLogoUrl,
  parseFromAddress,
  parseSmtpPort,
  parseSmtpSecure,
  resolveEmailConfig,
  resolveSupportInbox,
} from './config'

/** Entorno mínimo válido. La contraseña es ficticia y no se parece a ninguna real. */
const COMPLETO = {
  SMTP_HOST: 'smtp.ejemplo.com',
  SMTP_USER: 'soporte@ejemplo.com',
  SMTP_PASSWORD: 'contrasena-de-prueba',
  EMAIL_FROM: 'MIRA <soporte@ejemplo.com>',
  NEXT_PUBLIC_APP_URL: 'https://app.ejemplo.com',
}

describe('resolveEmailConfig — qué es obligatorio', () => {
  it('con las obligatorias, resuelve', () => {
    const r = resolveEmailConfig(COMPLETO)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.config.smtp.host).toBe('smtp.ejemplo.com')
    expect(r.config.smtp.user).toBe('soporte@ejemplo.com')
    expect(r.config.from).toEqual({ email: 'soporte@ejemplo.com', name: 'MIRA' })
    expect(r.config.appUrl).toBe('https://app.ejemplo.com')
  })

  it('sin entorno, nombra TODAS las que faltan', () => {
    const r = resolveEmailConfig({})
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.missing).toEqual([
      EMAIL_ENV_VARS.smtpHost,
      EMAIL_ENV_VARS.smtpUser,
      EMAIL_ENV_VARS.smtpPassword,
      EMAIL_ENV_VARS.from,
      EMAIL_ENV_VARS.appUrl,
    ])
  })

  it('falta solo SMTP_PASSWORD → se omite el envío', () => {
    const r = resolveEmailConfig({ ...COMPLETO, SMTP_PASSWORD: undefined })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.missing).toEqual([EMAIL_ENV_VARS.smtpPassword])
  })

  it('falta solo SMTP_HOST → se omite el envío', () => {
    const r = resolveEmailConfig({ ...COMPLETO, SMTP_HOST: '' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.missing).toEqual([EMAIL_ENV_VARS.smtpHost])
  })

  it('falta solo SMTP_USER → se omite el envío', () => {
    const r = resolveEmailConfig({ ...COMPLETO, SMTP_USER: '   ' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.missing).toEqual([EMAIL_ENV_VARS.smtpUser])
  })

  it('un remitente mal escrito cuenta como AUSENTE, no como válido', () => {
    for (const malo of ['sin-arroba', 'a@b', 'con espacio@x.com', '']) {
      const r = resolveEmailConfig({ ...COMPLETO, EMAIL_FROM: malo })
      expect(r.ok, malo).toBe(false)
      if (r.ok) continue
      expect(r.missing).toContain(EMAIL_ENV_VARS.from)
    }
  })

  it('la contraseña NO se recorta: puede empezar o acabar con espacio', () => {
    const r = resolveEmailConfig({ ...COMPLETO, SMTP_PASSWORD: '  con espacios  ' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.config.smtp.password).toBe('  con espacios  ')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// El secreto no se filtra
// ═══════════════════════════════════════════════════════════════════════════

describe('SMTP_PASSWORD nunca aparece en la salida de error', () => {
  it('`missing` lleva NOMBRES de variable, nunca valores', () => {
    const r = resolveEmailConfig({ SMTP_PASSWORD: 'secreto-que-no-debe-aparecer' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    const texto = JSON.stringify(r)
    expect(texto).not.toContain('secreto-que-no-debe-aparecer')
    // Y sí nombra la variable que falta, que es lo accionable.
    expect(r.missing).toContain(EMAIL_ENV_VARS.smtpHost)
  })

  it('serializar el resultado de error no expone ningún valor del entorno', () => {
    const r = resolveEmailConfig({
      SMTP_HOST: 'servidor-interno.ejemplo.com',
      SMTP_USER: 'usuario-real@ejemplo.com',
      SMTP_PASSWORD: 'otra-secreta',
    })
    expect(r.ok).toBe(false)
    if (r.ok) return
    const texto = JSON.stringify(r)
    for (const valor of ['servidor-interno.ejemplo.com', 'usuario-real@ejemplo.com', 'otra-secreta']) {
      expect(texto).not.toContain(valor)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Puerto y seguridad
// ═══════════════════════════════════════════════════════════════════════════

describe('parseSmtpPort', () => {
  it('sin valor usa el defecto 465', () => {
    expect(parseSmtpPort(undefined)).toBe(DEFAULT_SMTP_PORT)
    expect(parseSmtpPort(null)).toBe(DEFAULT_SMTP_PORT)
    expect(parseSmtpPort('')).toBe(DEFAULT_SMTP_PORT)
    expect(DEFAULT_SMTP_PORT).toBe(465)
  })

  it('acepta puertos válidos', () => {
    expect(parseSmtpPort('465')).toBe(465)
    expect(parseSmtpPort('587')).toBe(587)
    expect(parseSmtpPort(' 25 ')).toBe(25)
  })

  it('un puerto inválido se distingue de «no configurado» y bloquea el envío', () => {
    for (const malo of ['0', '65536', '-1', 'abc', '46.5', '4 6 5']) {
      expect(parseSmtpPort(malo), malo).toBeNull()
    }
    const r = resolveEmailConfig({ ...COMPLETO, SMTP_PORT: 'abc' })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.missing).toContain(EMAIL_ENV_VARS.smtpPort)
  })
})

describe('parseSmtpSecure', () => {
  it('sin valor se DEDUCE del puerto', () => {
    // Evita la combinación que más falla en cPanel: 465 con secure=false, que
    // se queda esperando hasta agotar el tiempo.
    expect(parseSmtpSecure(undefined, 465)).toBe(true)
    expect(parseSmtpSecure(undefined, 587)).toBe(false)
    expect(parseSmtpSecure('', 465)).toBe(true)
  })

  it('admite las formas habituales de escribir un booleano', () => {
    for (const si of ['true', 'TRUE', '1', 'yes', 'si', 'sí', ' True ']) {
      expect(parseSmtpSecure(si, 587), si).toBe(true)
    }
    for (const no of ['false', 'FALSE', '0', 'no', ' No ']) {
      expect(parseSmtpSecure(no, 465), no).toBe(false)
    }
  })

  it('un valor no reconocido cae en la deducción, no en `false`', () => {
    expect(parseSmtpSecure('quizá', 465)).toBe(true)
    expect(parseSmtpSecure('quizá', 587)).toBe(false)
  })

  it('la configuración completa refleja el puerto y la seguridad', () => {
    const r = resolveEmailConfig({ ...COMPLETO, SMTP_PORT: '587' })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.config.smtp.port).toBe(587)
    expect(r.config.smtp.secure).toBe(false)

    const r2 = resolveEmailConfig({ ...COMPLETO, SMTP_PORT: '587', SMTP_SECURE: 'true' })
    expect(r2.ok).toBe(true)
    if (!r2.ok) return
    expect(r2.config.smtp.secure).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Opcionales
// ═══════════════════════════════════════════════════════════════════════════

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

  it('EMAIL_FROM puede NO coincidir con SMTP_USER', () => {
    // En cPanel es habitual autenticarse con una cuenta y enviar como alias.
    const r = resolveEmailConfig({
      ...COMPLETO,
      SMTP_USER: 'buzon@ejemplo.com',
      EMAIL_FROM: 'MIRA <clientes@ejemplo.com>',
    })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.config.smtp.user).toBe('buzon@ejemplo.com')
    expect(r.config.from.email).toBe('clientes@ejemplo.com')
  })
})

describe('normalizeLogoUrl — solo https absoluta', () => {
  it('acepta https', () => {
    expect(normalizeLogoUrl('https://cdn.ejemplo.com/logo.png')).toBe(
      'https://cdn.ejemplo.com/logo.png',
    )
  })

  it('rechaza http, rutas relativas y basura', () => {
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

// Proveedor SMTP (Bloque 2 · ajuste final).
//
// nodemailer está MOCKEADO en su totalidad: estos tests no abren ningún socket
// y no se conectan a ningún servidor. Lo que se comprueba es qué se le pasa al
// transporte, qué se devuelve ante un fallo, y —lo más importante— que la
// contraseña no sale por ninguna parte.

import { beforeEach, describe, expect, it, vi } from 'vitest'

/** Opciones que nodemailer recibiría al crear el transporte. */
interface OpcionesTransporte {
  host: string
  port: number
  secure: boolean
  auth: { user: string; pass: string }
  connectionTimeout: number
  greetingTimeout: number
  socketTimeout: number
}

const sendMail = vi.fn()
const createTransport = vi.fn<(opciones: OpcionesTransporte) => { sendMail: typeof sendMail }>(
  () => ({ sendMail }),
)

vi.mock('nodemailer', () => ({
  default: { createTransport },
  createTransport,
}))

const { createSmtpProvider, describeSmtpError, formatAddress, resetTransporterCache } =
  await import('./smtp')
import type { EmailMessage } from './types'
import type { SmtpConfig } from './config'

const SMTP: SmtpConfig = {
  host: 'smtp.ejemplo.com',
  port: 465,
  secure: true,
  user: 'buzon@ejemplo.com',
  password: 'contrasena-de-prueba',
}

const MENSAJE: EmailMessage = {
  to: 'cliente@ejemplo.com',
  subject: 'Asunto',
  html: '<p>hola</p>',
  text: 'hola',
  tag: 'support.ticket.answered.user',
}

const FROM = { email: 'soporte@ejemplo.com', name: 'MIRA' }

beforeEach(() => {
  sendMail.mockReset()
  createTransport.mockClear()
  resetTransporterCache()
})

describe('envío correcto', () => {
  it('devuelve `sent` y pasa el mensaje completo al transporte', async () => {
    sendMail.mockResolvedValue({ messageId: 'abc' })

    const r = await createSmtpProvider(SMTP).send(MENSAJE, FROM)

    expect(r.status).toBe('sent')
    expect(r.tag).toBe('support.ticket.answered.user')
    expect(sendMail).toHaveBeenCalledTimes(1)

    const enviado = sendMail.mock.calls[0][0]
    expect(enviado.to).toBe('cliente@ejemplo.com')
    expect(enviado.subject).toBe('Asunto')
    expect(enviado.html).toBe('<p>hola</p>')
    expect(enviado.text).toBe('hola')
    // Versión en texto SIEMPRE, no solo HTML: puntúa mejor en los filtros.
    expect(enviado.text).toBeTruthy()
  })

  it('el remitente es EMAIL_FROM, no SMTP_USER', async () => {
    // En cPanel es habitual autenticarse con un buzón y enviar como alias.
    sendMail.mockResolvedValue({})

    await createSmtpProvider(SMTP).send(MENSAJE, FROM)

    expect(sendMail.mock.calls[0][0].from).toBe('MIRA <soporte@ejemplo.com>')
    expect(sendMail.mock.calls[0][0].from).not.toContain('buzon@ejemplo.com')
  })

  it('configura el transporte con host, puerto y modo seguro', async () => {
    sendMail.mockResolvedValue({})

    await createSmtpProvider(SMTP).send(MENSAJE, FROM)

    const opciones = createTransport.mock.calls[0][0]
    expect(opciones.host).toBe('smtp.ejemplo.com')
    expect(opciones.port).toBe(465)
    expect(opciones.secure).toBe(true)
    // Con tiempos de espera: un correo no puede retener una Server Action.
    expect(opciones.connectionTimeout).toBeGreaterThan(0)
    expect(opciones.socketTimeout).toBeGreaterThan(0)
  })

  it('reutiliza el transporte entre envíos con la misma configuración', async () => {
    sendMail.mockResolvedValue({})
    const provider = createSmtpProvider(SMTP)

    await provider.send(MENSAJE, FROM)
    await provider.send(MENSAJE, FROM)

    // Abrir una conexión TLS por correo sería un desperdicio.
    expect(createTransport).toHaveBeenCalledTimes(1)
    expect(sendMail).toHaveBeenCalledTimes(2)
  })

  it('crea un transporte nuevo si cambia la configuración', async () => {
    sendMail.mockResolvedValue({})

    await createSmtpProvider(SMTP).send(MENSAJE, FROM)
    await createSmtpProvider({ ...SMTP, host: 'otro.ejemplo.com' }).send(MENSAJE, FROM)

    expect(createTransport).toHaveBeenCalledTimes(2)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Fallos
// ═══════════════════════════════════════════════════════════════════════════

describe('el fallo se convierte en `failed`, nunca en excepción', () => {
  it('un error de autenticación no se propaga', async () => {
    sendMail.mockRejectedValue(Object.assign(new Error('Invalid login'), { code: 'EAUTH' }))

    // La aserción real es que esto NO lanza.
    const r = await createSmtpProvider(SMTP).send(MENSAJE, FROM)

    expect(r.status).toBe('failed')
    expect(r.detail).toContain('EAUTH')
    expect(r.tag).toBe(MENSAJE.tag)
  })

  it('traduce los códigos que de verdad distinguen un problema de otro', () => {
    const casos: [string, string][] = [
      ['EAUTH', 'autenticación'],
      ['ECONNECTION', 'conectar'],
      ['ESOCKET', 'socket'],
      ['ETIMEDOUT', 'sin respuesta'],
      ['EENVELOPE', 'rechazados'],
    ]
    for (const [code, esperado] of casos) {
      expect(describeSmtpError({ code }), code).toContain(esperado)
    }
  })

  it('un error sin código no rompe la traducción', () => {
    expect(describeSmtpError(new Error('vaya'))).toContain('desconocido')
    expect(describeSmtpError(null)).toContain('desconocido')
    expect(describeSmtpError(undefined)).toContain('desconocido')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// El secreto no se filtra
// ═══════════════════════════════════════════════════════════════════════════

describe('la contraseña SMTP no sale nunca', () => {
  it('no aparece en el resultado de un envío correcto', async () => {
    sendMail.mockResolvedValue({})
    const r = await createSmtpProvider(SMTP).send(MENSAJE, FROM)
    expect(JSON.stringify(r)).not.toContain(SMTP.password)
  })

  it('no aparece en el resultado de un fallo', async () => {
    sendMail.mockRejectedValue(
      Object.assign(new Error(`535 auth failed for ${SMTP.password}`), { code: 'EAUTH' }),
    )

    const r = await createSmtpProvider(SMTP).send(MENSAJE, FROM)

    // El `message` de la excepción puede llevar la línea de autenticación
    // completa: por eso se traduce el CÓDIGO y no se propaga el texto.
    expect(JSON.stringify(r)).not.toContain(SMTP.password)
    expect(r.detail).not.toContain('535')
  })

  it('`describeSmtpError` ignora el mensaje y usa solo el código', () => {
    const detalle = describeSmtpError(
      Object.assign(new Error('pass=contrasena-de-prueba user=buzon@ejemplo.com'), {
        code: 'EAUTH',
      }),
    )
    expect(detalle).not.toContain('contrasena-de-prueba')
    expect(detalle).not.toContain('buzon@ejemplo.com')
  })
})

describe('formatAddress', () => {
  it('con nombre y sin nombre', () => {
    expect(formatAddress({ email: 'a@b.com', name: 'MIRA' })).toBe('MIRA <a@b.com>')
    expect(formatAddress({ email: 'a@b.com' })).toBe('a@b.com')
  })
})

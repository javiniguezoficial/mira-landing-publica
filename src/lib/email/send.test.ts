// Despacho de correo (Bloque 2).
//
// La propiedad central que fijan estos tests: `deliver()` NUNCA LANZA. Es lo
// que permite que una notificación falle sin llevarse por delante el ticket que
// la originó.
//
// El proveedor SIEMPRE está mockeado: aquí no se llama a ningún servicio real.

import { describe, expect, it, vi } from 'vitest'
import { deliver } from './send'
import type {
  EmailAddress,
  EmailDeliveryResult,
  EmailMessage,
  EmailProvider,
} from './types'
import type { EmailConfig } from './config'

const CONFIG: EmailConfig = {
  apiKey: 're_clave_de_prueba',
  from: { email: 'soporte@ejemplo.com', name: 'MIRA' },
  supportInbox: 'interno@ejemplo.com',
  logoUrl: null,
  appUrl: 'https://app.ejemplo.com',
}

const MENSAJE: EmailMessage = {
  to: 'destinatario@ejemplo.com',
  subject: 'Asunto de prueba',
  html: '<p>hola</p>',
  text: 'hola',
  tag: 'support.ticket.created.user',
}

/** Proveedor que registra lo que recibe y devuelve lo que se le indique. */
function proveedorFalso(resultado: Partial<EmailDeliveryResult> = {}) {
  const recibido: { message: EmailMessage; from: EmailAddress }[] = []
  const provider: EmailProvider = {
    name: 'falso',
    async send(message, from) {
      recibido.push({ message, from })
      return {
        status: 'sent',
        tag: message.tag,
        detail: 'ok',
        ...resultado,
      } as EmailDeliveryResult
    },
  }
  return { provider, recibido }
}

describe('deliver — camino feliz', () => {
  it('envía con el remitente de la configuración y devuelve `sent`', async () => {
    const { provider, recibido } = proveedorFalso()

    const r = await deliver(MENSAJE, { provider, config: CONFIG })

    expect(r.status).toBe('sent')
    expect(r.tag).toBe('support.ticket.created.user')
    expect(recibido).toHaveLength(1)
    expect(recibido[0].message.to).toBe('destinatario@ejemplo.com')
    expect(recibido[0].from).toEqual(CONFIG.from)
  })
})

describe('deliver — sin configuración se OMITE, no falla', () => {
  it('devuelve `skipped` y nombra las variables que faltan', async () => {
    const espia = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { provider, recibido } = proveedorFalso()

    // Sin `config` explícita, `deliver` resuelve el entorno. En el entorno de
    // test no hay variables de correo, así que debe omitir.
    const r = await deliver(MENSAJE, { provider })

    expect(r.status).toBe('skipped')
    expect(r.missing).toContain('RESEND_API_KEY')
    // Lo importante: NO se ha llamado al proveedor.
    expect(recibido).toHaveLength(0)

    espia.mockRestore()
  })

  it('`skipped` NO es `failed`: son dos problemas distintos', async () => {
    const espia = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const r = await deliver(MENSAJE, { provider: proveedorFalso().provider })
    expect(r.status).not.toBe('failed')
    espia.mockRestore()
  })
})

describe('deliver — el fallo del proveedor NO se propaga', () => {
  it('un proveedor que devuelve `failed` produce `failed`, sin lanzar', async () => {
    const espia = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { provider } = proveedorFalso({ status: 'failed', detail: 'resend respondió 500' })

    const r = await deliver(MENSAJE, { provider, config: CONFIG })

    expect(r.status).toBe('failed')
    expect(r.detail).toContain('500')
    espia.mockRestore()
  })

  it('un proveedor que LANZA se convierte en `failed`, no en excepción', async () => {
    const espia = vi.spyOn(console, 'error').mockImplementation(() => {})
    const provider: EmailProvider = {
      name: 'explosivo',
      async send() {
        throw new Error('el servicio se ha caído')
      },
    }

    // La aserción real es que esto NO lanza.
    const r = await deliver(MENSAJE, { provider, config: CONFIG })

    expect(r.status).toBe('failed')
    expect(r.tag).toBe(MENSAJE.tag)
    espia.mockRestore()
  })

  it('nunca deja escapar el mensaje interno de la excepción', async () => {
    const espia = vi.spyOn(console, 'error').mockImplementation(() => {})
    const provider: EmailProvider = {
      name: 'explosivo',
      async send() {
        throw new Error('clave re_secreta_1234 inválida')
      },
    }

    const r = await deliver(MENSAJE, { provider, config: CONFIG })

    expect(r.detail).not.toContain('re_secreta_1234')
    espia.mockRestore()
  })
})

describe('deliver — los registros no filtran contenido del cliente', () => {
  it('no se registra el asunto ni el cuerpo del mensaje', async () => {
    const lineas: string[] = []
    const espia = vi.spyOn(console, 'info').mockImplementation((...args) => {
      lineas.push(args.join(' '))
    })
    const { provider } = proveedorFalso()

    await deliver(
      { ...MENSAJE, subject: 'ASUNTO CONFIDENCIAL', html: 'CUERPO CONFIDENCIAL', text: 'CUERPO CONFIDENCIAL' },
      { provider, config: CONFIG },
    )

    const todo = lineas.join('\n')
    expect(todo).not.toContain('ASUNTO CONFIDENCIAL')
    expect(todo).not.toContain('CUERPO CONFIDENCIAL')
    // Sí se registran etiqueta y destinatario, que es lo que permite diagnosticar.
    expect(todo).toContain('support.ticket.created.user')

    espia.mockRestore()
  })

  it('nunca se registra la clave de API', async () => {
    const lineas: string[] = []
    const espia = vi.spyOn(console, 'info').mockImplementation((...args) => {
      lineas.push(args.join(' '))
    })
    const { provider } = proveedorFalso()

    await deliver(MENSAJE, { provider, config: CONFIG })

    expect(lineas.join('\n')).not.toContain(CONFIG.apiKey)
    espia.mockRestore()
  })
})

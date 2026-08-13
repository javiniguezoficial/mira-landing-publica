// Notificaciones de Soporte (Bloque 2).
//
// Fijan A QUIÉN se escribe y cuándo NO se escribe a nadie. El envío está
// mockeado: aquí no sale ninguna petición de red.
//
// La propiedad de seguridad que cierran: el destinatario del aviso de respuesta
// es SIEMPRE el que le pasa la acción —resuelto en servidor desde
// `support_tickets.user_id`—, y si no hay destinatario NO se busca ninguno
// alternativo. Un correo de soporte enviado «a quien sea» sería una fuga.

import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { EmailMessage } from './types'

const enviados: EmailMessage[] = []

vi.mock('./send', async () => {
  const real = await vi.importActual<typeof import('./send')>('./send')
  return {
    ...real,
    deliver: vi.fn(async (message: EmailMessage) => {
      enviados.push(message)
      return { status: 'sent' as const, tag: message.tag, detail: 'mock' }
    }),
    loadEmailConfig: vi.fn(() => ({
      ok: true as const,
      config: {
        smtp: {
          host: 'smtp.ejemplo.com', port: 465, secure: true,
          user: 'soporte@ejemplo.com', password: 'contrasena-de-prueba',
        },
        from: { email: 'soporte@ejemplo.com', name: 'MIRA' },
        supportInbox: null,
        logoUrl: null,
        appUrl: 'https://app.ejemplo.com',
      },
    })),
  }
})

const { notifyTicketAnswered, notifyTicketCreated, categoryLabel, ticketStatusLabel } = await import(
  './support'
)
const { loadEmailConfig } = await import('./send')

const SIN_CONFIG = { ok: false as const, missing: ['SMTP_HOST', 'SMTP_PASSWORD'] }
const CON_CONFIG = {
  ok: true as const,
  config: {
    smtp: {
      host: 'smtp.ejemplo.com', port: 465, secure: true,
      user: 'soporte@ejemplo.com', password: 'contrasena-de-prueba',
    },
    from: { email: 'soporte@ejemplo.com', name: 'MIRA' },
    supportInbox: null as string | null,
    logoUrl: null as string | null,
    appUrl: 'https://app.ejemplo.com',
  },
}

beforeEach(() => {
  enviados.length = 0
  vi.mocked(loadEmailConfig).mockReturnValue(CON_CONFIG)
})

const TICKET = {
  subject: 'No puedo ver los precios',
  message: 'No me carga la sección.',
  category: 'prices',
  priority: 'high',
  requesterEmail: 'cliente@ejemplo.com',
  organizationName: 'Acme S.L.',
  platformSupportEmail: null,
}

// ═══════════════════════════════════════════════════════════════════════════
// Ticket creado
// ═══════════════════════════════════════════════════════════════════════════

describe('notifyTicketCreated — destinatarios', () => {
  it('confirma a quien abre el ticket, en SU propia dirección', async () => {
    await notifyTicketCreated(TICKET)

    const alUsuario = enviados.filter((m) => m.tag === 'support.ticket.created.user')
    expect(alUsuario).toHaveLength(1)
    expect(alUsuario[0].to).toBe('cliente@ejemplo.com')
    expect(alUsuario[0].subject).toContain('No puedo ver los precios')
  })

  it('sin buzón interno configurado NO se inventa ninguno', async () => {
    const espia = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await notifyTicketCreated(TICKET)

    expect(enviados.filter((m) => m.tag === 'support.ticket.created.internal')).toHaveLength(0)
    // Y la confirmación al usuario sí se ha enviado: son independientes.
    expect(enviados.filter((m) => m.tag === 'support.ticket.created.user')).toHaveLength(1)

    espia.mockRestore()
  })

  it('usa `platform_settings.support_email` como respaldo del buzón interno', async () => {
    await notifyTicketCreated({ ...TICKET, platformSupportEmail: 'ajustes@ejemplo.com' })

    const interno = enviados.filter((m) => m.tag === 'support.ticket.created.internal')
    expect(interno).toHaveLength(1)
    expect(interno[0].to).toBe('ajustes@ejemplo.com')
  })

  it('la variable de entorno manda sobre platform_settings', async () => {
    vi.mocked(loadEmailConfig).mockReturnValue({
      ...CON_CONFIG,
      config: { ...CON_CONFIG.config, supportInbox: 'env@ejemplo.com' },
    })

    await notifyTicketCreated({ ...TICKET, platformSupportEmail: 'ajustes@ejemplo.com' })

    const interno = enviados.filter((m) => m.tag === 'support.ticket.created.internal')
    expect(interno[0].to).toBe('env@ejemplo.com')
  })

  it('sin correo del solicitante se omite su confirmación, no se sustituye', async () => {
    const espia = vi.spyOn(console, 'warn').mockImplementation(() => {})

    await notifyTicketCreated({ ...TICKET, requesterEmail: null })

    expect(enviados.filter((m) => m.tag === 'support.ticket.created.user')).toHaveLength(0)
    espia.mockRestore()
  })

  it('sin configuración de correo no se llama al proveedor NI se lanza', async () => {
    const espia = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.mocked(loadEmailConfig).mockReturnValue(SIN_CONFIG)

    const r = await notifyTicketCreated(TICKET)

    expect(enviados).toHaveLength(0)
    expect(r).toEqual({ user: null, internal: null })
    espia.mockRestore()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Ticket respondido
// ═══════════════════════════════════════════════════════════════════════════

describe('notifyTicketAnswered — destinatario', () => {
  const RESPUESTA = {
    subject: 'No puedo ver los precios',
    response: 'Ya está corregido.',
    status: 'resolved',
    recipientEmail: 'cliente@ejemplo.com',
  }

  it('escribe SOLO al destinatario que le pasa la acción', async () => {
    await notifyTicketAnswered(RESPUESTA)

    expect(enviados).toHaveLength(1)
    expect(enviados[0].to).toBe('cliente@ejemplo.com')
    expect(enviados[0].tag).toBe('support.ticket.answered.user')
    expect(enviados[0].subject).toContain('MIRA ha respondido')
    expect(enviados[0].html).toContain('Ya está corregido')
  })

  it('sin destinatario NO se envía a nadie — no se busca alternativa', async () => {
    const espia = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const r = await notifyTicketAnswered({ ...RESPUESTA, recipientEmail: null })

    expect(enviados).toHaveLength(0)
    expect(r).toBeNull()
    espia.mockRestore()
  })

  it('sin configuración de correo no se llama al proveedor NI se lanza', async () => {
    const espia = vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.mocked(loadEmailConfig).mockReturnValue(SIN_CONFIG)

    const r = await notifyTicketAnswered(RESPUESTA)

    expect(enviados).toHaveLength(0)
    expect(r).toBeNull()
    espia.mockRestore()
  })

  it('el correo NO lleva contenido de ningún otro ticket', async () => {
    await notifyTicketAnswered(RESPUESTA)

    // La plantilla solo recibe asunto y respuesta; no hay ningún identificador
    // con el que pudiera ir a buscar otra fila.
    expect(enviados[0].html).toContain('No puedo ver los precios')
    expect(enviados[0].html).not.toContain('otro-ticket')
  })
})

describe('etiquetas visibles', () => {
  it('traducen los valores del CHECK y caen a un valor seguro', () => {
    expect(categoryLabel('prices')).toBe('Precios')
    expect(categoryLabel('rfq')).toBe('Cotizaciones')
    expect(categoryLabel('valor-desconocido')).toBe('Otro')
    expect(categoryLabel(null)).toBe('Otro')

    expect(ticketStatusLabel('in_progress')).toBe('En proceso')
    expect(ticketStatusLabel(null)).toBe('Abierto')
  })
})

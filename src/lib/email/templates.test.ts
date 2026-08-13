// Plantillas transaccionales (Bloque 2).
//
// Fijan tres cosas: que el contenido pedido está, que el texto libre de una
// persona no puede inyectar marcado, y que el correo NO lleva enlaces con
// identificadores de ticket dentro.

import { describe, expect, it } from 'vitest'
import {
  escapeHtml,
  renderTicketAnsweredForUser,
  renderTicketCreatedForUser,
  renderTicketCreatedInternal,
} from './templates'

const APP = 'https://app.ejemplo.com'

describe('escapeHtml', () => {
  it('escapa los cinco caracteres que importan', () => {
    expect(escapeHtml('<script>alert("x")</script>')).toBe(
      '&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;',
    )
    expect(escapeHtml("O'Neill & hijos")).toBe('O&#39;Neill &amp; hijos')
  })

  it('tolera null y undefined', () => {
    expect(escapeHtml(null)).toBe('')
    expect(escapeHtml(undefined)).toBe('')
  })
})

describe('confirmación al usuario', () => {
  const base = {
    subject: 'No puedo ver los precios',
    message: 'Buenas,\n\nno me carga la sección.',
    categoryLabel: 'Precios',
    appUrl: APP,
    logoUrl: null,
  }

  it('incluye asunto, categoría, mensaje y CTA a Ayuda', () => {
    const r = renderTicketCreatedForUser(base)
    expect(r.subject).toContain('No puedo ver los precios')
    expect(r.html).toContain('No puedo ver los precios')
    expect(r.html).toContain('Precios')
    expect(r.html).toContain('no me carga la sección')
    expect(r.html).toContain(`${APP}/app/ayuda`)
  })

  it('trae versión en texto plano equivalente', () => {
    const r = renderTicketCreatedForUser(base)
    expect(r.text).toContain('No puedo ver los precios')
    expect(r.text).toContain(`${APP}/app/ayuda`)
    expect(r.text).not.toContain('<')
  })

  it('sin logotipo usa el nombre en texto, sin dejar un <img> roto', () => {
    const r = renderTicketCreatedForUser({ ...base, logoUrl: null })
    expect(r.html).not.toContain('<img')
    expect(r.html).toContain('MIRA')
  })

  it('con logotipo pinta la imagen', () => {
    const r = renderTicketCreatedForUser({ ...base, logoUrl: 'https://cdn.ejemplo.com/l.png' })
    expect(r.html).toContain('<img src="https://cdn.ejemplo.com/l.png"')
  })

  it('NO inyecta marcado desde el asunto ni el mensaje', () => {
    const r = renderTicketCreatedForUser({
      ...base,
      subject: '<img src=x onerror=alert(1)>',
      message: '</div><script>robar()</script>',
    })
    expect(r.html).not.toContain('<img src=x')
    expect(r.html).not.toContain('<script>')
    expect(r.html).toContain('&lt;script&gt;')
  })
})

describe('aviso interno', () => {
  const base = {
    subject: 'Alta de usuario',
    message: 'Necesito añadir a un compañero.',
    categoryLabel: 'Cuenta',
    priorityLabel: 'Alta',
    requesterEmail: 'cliente@ejemplo.com',
    organizationName: 'Acme S.L.',
    appUrl: APP,
    logoUrl: null,
  }

  it('lleva quién, de qué empresa y con qué prioridad', () => {
    const r = renderTicketCreatedInternal(base)
    expect(r.html).toContain('cliente@ejemplo.com')
    expect(r.html).toContain('Acme S.L.')
    expect(r.html).toContain('Alta')
    expect(r.html).toContain(`${APP}/admin/soporte`)
  })

  it('el asunto se distingue de un correo de cliente', () => {
    expect(renderTicketCreatedInternal(base).subject).toContain('[Soporte MIRA]')
  })

  it('sin solicitante ni organización no rompe: pone un guion', () => {
    const r = renderTicketCreatedInternal({ ...base, requesterEmail: null, organizationName: null })
    expect(r.html).toContain('—')
  })
})

describe('aviso de respuesta al usuario', () => {
  const base = {
    subject: 'No puedo ver los precios',
    response: 'Ya está corregido. Vuelve a entrar y dinos si sigue igual.',
    statusLabel: 'Resuelto',
    appUrl: APP,
    logoUrl: null,
  }

  it('avisa de que MIRA ha respondido e incluye la respuesta', () => {
    const r = renderTicketAnsweredForUser(base)
    expect(r.subject).toContain('MIRA ha respondido')
    expect(r.html).toContain('Ya está corregido')
    expect(r.html).toContain('Resuelto')
  })

  it('el CTA lleva a Ayuda, NO a un ticket por identificador', () => {
    const r = renderTicketAnsweredForUser(base)
    expect(r.html).toContain(`${APP}/app/ayuda`)
    // Un enlace con el id dentro invitaría a probar identificadores ajenos, y
    // el correo es reenviable. Se lleva a la pantalla, donde manda RLS.
    expect(r.html).not.toMatch(/\/app\/ayuda\/[0-9a-f-]{8,}/)
  })

  it('NO inyecta marcado desde la respuesta del administrador', () => {
    const r = renderTicketAnsweredForUser({ ...base, response: '<script>x()</script>' })
    expect(r.html).not.toContain('<script>x()')
    expect(r.html).toContain('&lt;script&gt;')
  })
})

// Plantillas transaccionales de MIRA (Bloque 2).
//
// Módulo PURO: entra un objeto de datos, sale `{ subject, html, text }`. No
// consulta nada, no envía nada y no conoce al proveedor.
//
// ── Por qué HTML a mano y con estilos en línea ─────────────────────────────
//
// Porque un cliente de correo no es un navegador: Outlook y Gmail eliminan las
// hojas de estilo, no admiten flexbox ni grid de forma fiable, y el ancho hay
// que fijarlo con tablas. Cualquier framework moderno se vería roto justo en
// los dos clientes que más usa el cliente objetivo.
//
// ── Qué NO llevan estos correos ───────────────────────────────────────────
//
//   · imágenes en base64 ni adjuntos — inflan el mensaje y disparan el spam;
//   · datos de otra organización — cada plantilla recibe SOLO su ticket;
//   · enlaces a un recurso concreto por identificador — el CTA lleva a Ayuda,
//     y allí RLS decide qué puede ver esa persona. Un enlace con el id del
//     ticket dentro invitaría a probar identificadores ajenos.

/** Paleta MIRA, en literales: en un correo no hay variables CSS que valgan. */
const COLOR = {
  magenta: '#C2185B',
  ink: '#1E1B2E',
  slate: '#64748B',
  line: '#E7E5EE',
  canvas: '#F8F7FB',
  white: '#FFFFFF',
} as const

/**
 * Escapa lo que escribió una persona antes de meterlo en el HTML.
 *
 * El asunto, el mensaje y la respuesta son texto libre. Sin esto, un ticket
 * cuyo asunto contuviera `<img onerror=…>` inyectaría marcado en el correo que
 * recibe otra persona. Se escapan los cinco caracteres que importan.
 */
export function escapeHtml(raw: string | null | undefined): string {
  if (typeof raw !== 'string') return ''
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Conserva los saltos de línea del texto original dentro del HTML. */
function parrafos(raw: string): string {
  return escapeHtml(raw)
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px;">${p.replace(/\n/g, '<br />')}</p>`)
    .join('')
}

export interface RenderedEmail {
  subject: string
  html: string
  text: string
}

interface LayoutInput {
  title: string
  logoUrl: string | null
  bodyHtml: string
  cta?: { label: string; url: string }
  footerNote?: string
}

/**
 * Envoltorio común: cabecera con la marca, cuerpo, CTA y pie.
 *
 * Con `logoUrl` se pinta la imagen; sin ella, el nombre en texto. Nunca se deja
 * un `<img>` apuntando a una URL que no existe: un icono roto en la cabecera da
 * peor impresión que no tener logotipo.
 */
function layout({ title, logoUrl, bodyHtml, cta, footerNote }: LayoutInput): string {
  const marca = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="MIRA" width="96" style="display:block;border:0;height:auto;max-width:96px;" />`
    : `<span style="font-size:24px;font-weight:700;letter-spacing:-0.5px;color:${COLOR.magenta};">MIRA</span>`

  const botonCta = cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 8px;">
         <tr><td style="border-radius:12px;background:${COLOR.magenta};">
           <a href="${escapeHtml(cta.url)}" style="display:inline-block;padding:12px 24px;font-family:Helvetica,Arial,sans-serif;font-size:14px;font-weight:700;color:${COLOR.white};text-decoration:none;">${escapeHtml(cta.label)}</a>
         </td></tr>
       </table>`
    : ''

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:${COLOR.canvas};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${COLOR.canvas};padding:32px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:${COLOR.white};border:1px solid ${COLOR.line};border-radius:16px;">
        <tr><td style="padding:28px 32px 0;">${marca}</td></tr>
        <tr><td style="padding:20px 32px 32px;font-family:Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:${COLOR.ink};">
          <h1 style="margin:0 0 16px;font-size:19px;line-height:1.35;color:${COLOR.ink};">${escapeHtml(title)}</h1>
          ${bodyHtml}
          ${botonCta}
        </td></tr>
        <tr><td style="padding:0 32px 28px;font-family:Helvetica,Arial,sans-serif;font-size:12px;line-height:1.5;color:${COLOR.slate};border-top:1px solid ${COLOR.line};padding-top:16px;">
          ${footerNote ? `<p style="margin:0 0 8px;">${escapeHtml(footerNote)}</p>` : ''}
          <p style="margin:0;">MIRA · Inteligencia de mercado</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
}

/** Bloque citado, para distinguir el mensaje original de la respuesta. */
function cita(titulo: string, contenido: string): string {
  return `<div style="margin:16px 0;padding:14px 16px;background:${COLOR.canvas};border-left:3px solid ${COLOR.line};border-radius:0 8px 8px 0;">
    <p style="margin:0 0 8px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:${COLOR.slate};">${escapeHtml(titulo)}</p>
    <div style="font-size:14px;color:${COLOR.ink};">${parrafos(contenido)}</div>
  </div>`
}

// ── 1 · Confirmación al usuario que abre un ticket ─────────────────────────

export interface TicketCreatedInput {
  subject: string
  message: string
  categoryLabel: string
  appUrl: string
  logoUrl: string | null
}

export function renderTicketCreatedForUser(input: TicketCreatedInput): RenderedEmail {
  const ayuda = `${input.appUrl}/app/ayuda`

  const html = layout({
    title: 'Hemos recibido tu solicitud',
    logoUrl: input.logoUrl,
    bodyHtml:
      `<p style="margin:0 0 12px;">Gracias por escribirnos. Tu solicitud ha quedado registrada y el equipo de MIRA la revisará lo antes posible.</p>
       <p style="margin:0 0 4px;"><strong>Asunto:</strong> ${escapeHtml(input.subject)}</p>
       <p style="margin:0 0 12px;"><strong>Categoría:</strong> ${escapeHtml(input.categoryLabel)}</p>
       ${cita('Tu mensaje', input.message)}
       <p style="margin:12px 0 0;">Te avisaremos por correo en cuanto tengamos una respuesta. También puedes consultarla en cualquier momento desde tu área de Ayuda.</p>`,
    cta: { label: 'Ver mis solicitudes', url: ayuda },
    footerNote: 'Este mensaje es automático: no hace falta que respondas a este correo.',
  })

  const text = [
    'Hemos recibido tu solicitud',
    '',
    'Gracias por escribirnos. Tu solicitud ha quedado registrada y el equipo de MIRA la revisará lo antes posible.',
    '',
    `Asunto: ${input.subject}`,
    `Categoría: ${input.categoryLabel}`,
    '',
    'Tu mensaje:',
    input.message,
    '',
    `Consulta el estado en: ${ayuda}`,
    '',
    'Este mensaje es automático: no hace falta que respondas a este correo.',
    'MIRA · Inteligencia de mercado',
  ].join('\n')

  return { subject: `Hemos recibido tu solicitud: ${input.subject}`, html, text }
}

// ── 2 · Aviso interno de ticket nuevo ──────────────────────────────────────

export interface TicketInternalInput {
  subject: string
  message: string
  categoryLabel: string
  priorityLabel: string
  /** Quién lo abre. Se identifica por correo, que es lo que hace falta para responder. */
  requesterEmail: string | null
  organizationName: string | null
  appUrl: string
  logoUrl: string | null
}

export function renderTicketCreatedInternal(input: TicketInternalInput): RenderedEmail {
  const panel = `${input.appUrl}/admin/soporte`

  const html = layout({
    title: 'Nuevo ticket de soporte',
    logoUrl: input.logoUrl,
    bodyHtml:
      `<p style="margin:0 0 4px;"><strong>Asunto:</strong> ${escapeHtml(input.subject)}</p>
       <p style="margin:0 0 4px;"><strong>Categoría:</strong> ${escapeHtml(input.categoryLabel)} · <strong>Prioridad:</strong> ${escapeHtml(input.priorityLabel)}</p>
       <p style="margin:0 0 4px;"><strong>Organización:</strong> ${escapeHtml(input.organizationName ?? '—')}</p>
       <p style="margin:0 0 12px;"><strong>Solicitante:</strong> ${escapeHtml(input.requesterEmail ?? '—')}</p>
       ${cita('Mensaje', input.message)}`,
    cta: { label: 'Abrir en el panel', url: panel },
    footerNote: 'Aviso interno de la plataforma MIRA.',
  })

  const text = [
    'Nuevo ticket de soporte',
    '',
    `Asunto: ${input.subject}`,
    `Categoría: ${input.categoryLabel} · Prioridad: ${input.priorityLabel}`,
    `Organización: ${input.organizationName ?? '—'}`,
    `Solicitante: ${input.requesterEmail ?? '—'}`,
    '',
    'Mensaje:',
    input.message,
    '',
    `Panel: ${panel}`,
  ].join('\n')

  return { subject: `[Soporte MIRA] ${input.subject}`, html, text }
}

// ── 3 · Aviso al usuario cuando MIRA responde ──────────────────────────────

export interface TicketAnsweredInput {
  subject: string
  response: string
  statusLabel: string
  appUrl: string
  logoUrl: string | null
}

export function renderTicketAnsweredForUser(input: TicketAnsweredInput): RenderedEmail {
  const ayuda = `${input.appUrl}/app/ayuda`

  const html = layout({
    title: 'MIRA ha respondido a tu solicitud',
    logoUrl: input.logoUrl,
    bodyHtml:
      `<p style="margin:0 0 12px;">El equipo de MIRA ha respondido a tu solicitud.</p>
       <p style="margin:0 0 4px;"><strong>Asunto:</strong> ${escapeHtml(input.subject)}</p>
       <p style="margin:0 0 12px;"><strong>Estado:</strong> ${escapeHtml(input.statusLabel)}</p>
       ${cita('Respuesta de MIRA', input.response)}
       <p style="margin:12px 0 0;">Puedes consultar el histórico completo de tus solicitudes desde tu área de Ayuda.</p>`,
    cta: { label: 'Ver la respuesta en MIRA', url: ayuda },
    footerNote: 'Este mensaje es automático: no hace falta que respondas a este correo.',
  })

  const text = [
    'MIRA ha respondido a tu solicitud',
    '',
    `Asunto: ${input.subject}`,
    `Estado: ${input.statusLabel}`,
    '',
    'Respuesta de MIRA:',
    input.response,
    '',
    `Ver en MIRA: ${ayuda}`,
    '',
    'Este mensaje es automático: no hace falta que respondas a este correo.',
    'MIRA · Inteligencia de mercado',
  ].join('\n')

  return { subject: `MIRA ha respondido: ${input.subject}`, html, text }
}

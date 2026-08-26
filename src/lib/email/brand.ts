// Identidad visual de los correos de MIRA Pricing.
//
// Módulo PURO y sin dependencias: solo produce cadenas. Lo usan las plantillas
// de Supabase Auth (`auth-templates.ts`), que se generan aquí y se pegan en el
// panel de Supabase.
//
// ═══════════════════════════════════════════════════════════════════════════
// POR QUÉ ESTE ARCHIVO EXISTE, SI YA HABÍA UN `layout()` EN templates.ts
// ═══════════════════════════════════════════════════════════════════════════
//
// Por dos motivos, y el segundo es el que manda:
//
//   1. `layout()` no se exporta, y los correos de Auth NO son correos que
//      enviemos nosotros: son plantillas que vive en el panel de Supabase y que
//      llevan marcadores Go (`{{ .ConfirmationURL }}`). Necesitan generarse a
//      texto y pegarse, no renderizarse en tiempo de ejecución.
//
//   2. `templates.ts` tiene cambios sin cerrar del bloque de Soporte. Tocarlo
//      ahora mezclaría los dos trabajos. Este módulo es nuevo y no lo toca.
//
// Cuando Soporte se cierre, `templates.ts` puede pasar a usar este archivo y
// quedar una sola definición de la marca. Hasta entonces conviven, y por eso
// los colores de aquí son los REALES de la aplicación —ver abajo—.

/**
 * Paleta. Son los tokens de `globals.css`, no una aproximación.
 *
 * ── Una desviación encontrada al auditar ──────────────────────────────────
 *
 * `templates.ts` usa `#C2185B` como magenta. La aplicación usa `#D6006E`. Son
 * magentas distintos: los correos de soporte no salían con el color de la
 * marca. Aquí se usa el de la aplicación, que es el bueno. Alinear el otro
 * queda para cuando se cierre Soporte y no haya riesgo de mezclar.
 */
export const BRAND = {
  magenta: '#D6006E',
  magentaDeep: '#B80560',
  magentaSoft: '#FCE4EF',
  ink: '#1A1230',
  slate: '#5B5470',
  slateSoft: '#8B849E',
  canvas: '#F6F4FA',
  line: '#ECE6F4',
  white: '#FFFFFF',
} as const

export const BRAND_NAME = 'MIRA Pricing'
export const BRAND_TAGLINE =
  'Plataforma profesional para inteligencia de mercados, precios y gestión de cotizaciones.'
export const TRANSACTIONAL_NOTICE =
  'Este es un correo transaccional relacionado con tu cuenta.'

/**
 * Pila de fuentes del sistema.
 *
 * Sin fuentes web a propósito: `@font-face` y `<link>` a Google Fonts los
 * ignoran o los bloquean Outlook, Gmail y la mayoría de clientes de escritorio.
 * Una pila del sistema se ve nítida en todos y no depende de que cargue nada.
 */
const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"

/** Escapa lo que pueda venir de fuera antes de meterlo en el HTML. */
export function escapeHtml(raw: string | null | undefined): string {
  if (typeof raw !== 'string') return ''
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export interface BrandedEmailInput {
  /** Título grande dentro de la tarjeta. */
  title: string
  /** Uno o más párrafos. Ya deben venir listos para pintar. */
  paragraphs: string[]
  cta: { label: string; url: string }
  /** Aviso pequeño bajo el botón. Opcional. */
  note?: string | null
  /**
   * Texto de vista previa: lo que se lee en la bandeja de entrada junto al
   * asunto, antes de abrir. Si no se pone, los clientes cogen las primeras
   * palabras del HTML —que suelen ser basura— y el correo parece descuidado.
   */
  preheader: string
  /** URL absoluta https del logotipo. Sin ella se usa el nombre en texto. */
  logoUrl?: string | null
  /** Enlace del pie. Opcional. */
  siteUrl?: string | null
}

/**
 * El armazón compartido por todos los correos.
 *
 * ── Por qué tablas y estilos en línea, en 2026 ───────────────────────────
 *
 * Porque el correo no es la web. Outlook de escritorio renderiza con el motor
 * de Word: no admite `flex`, ni `grid`, ni `position`, y descarta buena parte
 * de las hojas de estilo. Gmail elimina el `<style>` en algunos contextos.
 * Tablas anidadas con `style=` en cada celda es lo único que se ve igual en
 * todas partes, y por eso lo usan también Stripe, Linear o Vercel.
 *
 * ── Qué se ha evitado a propósito ────────────────────────────────────────
 *
 *   · imágenes para el texto o el botón — muchos clientes las bloquean por
 *     defecto y el correo quedaría vacío;
 *   · fuentes web — ver `FONT`;
 *   · `border-radius` como única señal de que algo es un botón — Outlook lo
 *     ignora y el botón sigue leyéndose porque tiene fondo y relleno;
 *   · media queries como base — se usan solo para AJUSTAR en móvil, y el
 *     diseño ya funciona sin ellas.
 */
export function renderBrandedEmail(input: BrandedEmailInput): string {
  const cabecera = input.logoUrl
    ? `<img src="${escapeHtml(input.logoUrl)}" alt="${escapeHtml(BRAND_NAME)}" width="150" style="display:block;border:0;outline:none;text-decoration:none;height:auto;max-width:150px;">`
    : `<span style="font-family:${FONT};font-size:21px;font-weight:700;letter-spacing:-0.3px;color:${BRAND.white};">MIRA<span style="color:${BRAND.magentaSoft};font-weight:500;"> Pricing</span></span>`

  const parrafos = input.paragraphs
    .map(
      (p) =>
        `<p style="margin:0 0 16px;font-family:${FONT};font-size:16px;line-height:26px;color:${BRAND.slate};">${p}</p>`,
    )
    .join('')

  const nota = input.note
    ? `<p style="margin:24px 0 0;font-family:${FONT};font-size:14px;line-height:22px;color:${BRAND.slateSoft};">${input.note}</p>`
    : ''

  const enlaceSitio = input.siteUrl
    ? `<p style="margin:12px 0 0;font-family:${FONT};font-size:12px;line-height:18px;color:${BRAND.slateSoft};"><a href="${escapeHtml(input.siteUrl)}" style="color:${BRAND.slateSoft};text-decoration:underline;">${escapeHtml(input.siteUrl.replace(/^https?:\/\//, ''))}</a></p>`
    : ''

  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="es">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="x-apple-disable-message-reformatting" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title>${escapeHtml(input.title)}</title>
<style type="text/css">
  /* Solo AJUSTES para pantallas pequeñas: el diseño ya funciona sin esto. */
  @media only screen and (max-width:620px) {
    .mira-wrap { width:100% !important; }
    .mira-pad  { padding-left:24px !important; padding-right:24px !important; }
    .mira-h1   { font-size:22px !important; line-height:30px !important; }
    .mira-btn  { display:block !important; text-align:center !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;width:100%;background-color:${BRAND.canvas};-webkit-font-smoothing:antialiased;">

<!-- Vista previa de la bandeja de entrada. Invisible en el cuerpo del correo. -->
<div style="display:none;font-size:1px;color:${BRAND.canvas};line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(input.preheader)}&nbsp;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;&#8199;&#65279;&#847;</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${BRAND.canvas};">
  <tr>
    <td align="center" style="padding:32px 12px 40px;">

      <table role="presentation" class="mira-wrap" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;">

        <!-- Cabecera de marca -->
        <tr>
          <td align="left" style="background-color:${BRAND.ink};border-radius:14px 14px 0 0;padding:24px 32px;">
            ${cabecera}
          </td>
        </tr>

        <!-- Tarjeta -->
        <tr>
          <td class="mira-pad" style="background-color:${BRAND.white};border-left:1px solid ${BRAND.line};border-right:1px solid ${BRAND.line};padding:36px 32px 32px;">

            <h1 class="mira-h1" style="margin:0 0 18px;font-family:${FONT};font-size:25px;line-height:33px;font-weight:700;letter-spacing:-0.4px;color:${BRAND.ink};">${escapeHtml(input.title)}</h1>

            ${parrafos}

            <!-- Botón: tabla, no un <a> suelto, para que Outlook lo pinte igual -->
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 0;">
              <tr>
                <td align="center" bgcolor="${BRAND.magenta}" style="background-color:${BRAND.magenta};border-radius:10px;">
                  <a class="mira-btn" href="${input.cta.url}" target="_blank" rel="noopener" style="display:inline-block;padding:14px 30px;font-family:${FONT};font-size:16px;font-weight:700;line-height:20px;color:${BRAND.white};text-decoration:none;border-radius:10px;">${escapeHtml(input.cta.label)}</a>
                </td>
              </tr>
            </table>

            ${nota}

            <!-- Enlace en claro: hay clientes que bloquean o rompen el botón -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 0;">
              <tr><td style="border-top:1px solid ${BRAND.line};font-size:0;line-height:0;">&nbsp;</td></tr>
            </table>
            <p style="margin:20px 0 0;font-family:${FONT};font-size:13px;line-height:20px;color:${BRAND.slateSoft};">
              Si el botón no funciona, copia y pega esta dirección en tu navegador:
            </p>
            <p style="margin:6px 0 0;font-family:${FONT};font-size:13px;line-height:20px;word-break:break-all;">
              <a href="${input.cta.url}" target="_blank" rel="noopener" style="color:${BRAND.magenta};text-decoration:underline;">${input.cta.url}</a>
            </p>

          </td>
        </tr>

        <!-- Pie -->
        <tr>
          <td class="mira-pad" align="left" style="background-color:${BRAND.white};border:1px solid ${BRAND.line};border-top:none;border-radius:0 0 14px 14px;padding:22px 32px 26px;">
            <p style="margin:0;font-family:${FONT};font-size:13px;line-height:20px;font-weight:700;color:${BRAND.ink};">${escapeHtml(BRAND_NAME)}</p>
            <p style="margin:4px 0 0;font-family:${FONT};font-size:12px;line-height:19px;color:${BRAND.slateSoft};">${escapeHtml(BRAND_TAGLINE)}</p>
            <p style="margin:14px 0 0;font-family:${FONT};font-size:12px;line-height:19px;color:${BRAND.slateSoft};">${escapeHtml(TRANSACTIONAL_NOTICE)}</p>
            ${enlaceSitio}
          </td>
        </tr>

      </table>

    </td>
  </tr>
</table>

</body>
</html>`
}

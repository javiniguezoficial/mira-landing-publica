// Plantillas de los correos de Supabase Auth, con la marca de MIRA Pricing.
//
// ═══════════════════════════════════════════════════════════════════════════
// LO PRIMERO QUE HAY QUE ENTENDER DE ESTE ARCHIVO
// ═══════════════════════════════════════════════════════════════════════════
//
// Estos correos NO los envía la aplicación. Los envía Supabase, desde su propio
// servidor de correo y con las plantillas que están guardadas en su panel
// (Authentication → Emails). Nuestro `nodemailer` y nuestras variables
// `SMTP_*` no intervienen en absoluto: eso solo mueve los correos de Soporte.
//
// Por tanto este módulo no envía nada. GENERA el HTML que hay que PEGAR en el
// panel. Que viva en el repositorio es lo que hace la marca mantenible: el
// texto y el diseño se revisan como código, se prueban, y `npm run
// email:auth-templates` vuelve a producir los ficheros para pegar.
//
// ═══════════════════════════════════════════════════════════════════════════
// LOS MARCADORES
// ═══════════════════════════════════════════════════════════════════════════
//
// Supabase procesa las plantillas con `text/template` de Go. Las variables
// disponibles —comprobadas contra la documentación oficial— son:
//
//   {{ .ConfirmationURL }}  enlace de acción, ya con su token. ES EL IMPORTANTE
//   {{ .Token }}            código OTP de 6 dígitos
//   {{ .TokenHash }}        versión con hash, para construir enlaces a mano
//   {{ .SiteURL }}          la Site URL del proyecto
//   {{ .RedirectTo }}       el `redirectTo` que pidió la aplicación
//   {{ .Email }}            dirección actual
//   {{ .NewEmail }}         dirección nueva (solo en el cambio de correo)
//   {{ .Data }}             metadatos del usuario
//
// ── La regla que no se puede romper ──────────────────────────────────────
//
// `{{ .ConfirmationURL }}` se escribe TAL CUAL, sin escapar y sin envolver.
// Es lo que lleva el token de un solo uso; tocarlo rompe la autenticación. Por
// eso el armazón de marca no le aplica `escapeHtml`: es una URL que genera
// Supabase, no texto de una persona.
//
// ── Qué NO se toca ───────────────────────────────────────────────────────
//
// Nada del flujo. No cambian ni las redirecciones, ni los tokens, ni la Site
// URL, ni el `redirectTo` que ya envía la aplicación desde
// `lib/auth/redirect-urls.ts`. Esto es exclusivamente presentación.

import { renderBrandedEmail } from './brand'

/** El marcador de Supabase para el enlace de acción. Literal, sin escapar. */
export const CONFIRMATION_URL = '{{ .ConfirmationURL }}'

export interface AuthEmailTemplate {
  /** Identificador interno y nombre del fichero que se genera. */
  key: string
  /** Cómo se llama la plantilla en el panel de Supabase. */
  supabaseTemplate: string
  /** Asunto, para pegar en el campo «Subject heading». */
  subject: string
  /** Cuerpo, para pegar en «Message body». */
  html: string
  /** Si la aplicación dispara hoy este correo. */
  enUso: boolean
}

export interface AuthTemplateOptions {
  /** URL absoluta https del logotipo. Sin ella, el nombre en texto. */
  logoUrl?: string | null
  /** Base pública, para el enlace del pie. */
  siteUrl?: string | null
}

/**
 * Las cinco plantillas.
 *
 * El tono es el mismo en todas: español profesional, directo, sin literatura.
 * Cada una dice QUÉ ha pasado, QUÉ hay que hacer y —cuando importa— qué pasa
 * si no has sido tú.
 */
export function buildAuthEmailTemplates(options: AuthTemplateOptions = {}): AuthEmailTemplate[] {
  const marca = { logoUrl: options.logoUrl ?? null, siteUrl: options.siteUrl ?? null }

  return [
    {
      key: 'confirm-signup',
      supabaseTemplate: 'Confirm signup',
      subject: 'Activa tu acceso a MIRA Pricing',
      enUso: true,
      html: renderBrandedEmail({
        ...marca,
        preheader: 'Confirma tu correo para activar tu cuenta en MIRA Pricing.',
        title: 'Activa tu acceso a MIRA Pricing',
        paragraphs: [
          'Hemos recibido tu solicitud de acceso. Confirma tu correo para activar tu cuenta y empezar a trabajar con mercados, precios y cotizaciones desde un único entorno.',
        ],
        cta: { label: 'Confirmar cuenta', url: CONFIRMATION_URL },
        note: 'Si no has solicitado esta cuenta, puedes ignorar este correo: no se activará nada.',
      }),
    },

    {
      key: 'reset-password',
      supabaseTemplate: 'Reset Password',
      subject: 'Restablece tu contraseña de MIRA Pricing',
      enUso: true,
      html: renderBrandedEmail({
        ...marca,
        preheader: 'Crea una nueva contraseña para tu cuenta de MIRA Pricing.',
        title: 'Restablece tu contraseña',
        paragraphs: [
          'Hemos recibido una solicitud para restablecer la contraseña de tu cuenta en MIRA Pricing. Si has sido tú, usa el botón inferior para crear una nueva contraseña.',
        ],
        cta: { label: 'Crear nueva contraseña', url: CONFIRMATION_URL },
        note: 'Si no has solicitado este cambio, puedes ignorar este correo. Tu contraseña actual seguirá funcionando.',
      }),
    },

    {
      key: 'change-email',
      supabaseTemplate: 'Change Email Address',
      subject: 'Confirma tu nueva dirección de correo',
      // La aplicación no dispara hoy este flujo: `updateUser()` solo cambia la
      // contraseña. Se deja preparado para que, el día que se añada, el correo
      // no salga con el aspecto por defecto de Supabase.
      enUso: false,
      html: renderBrandedEmail({
        ...marca,
        preheader: 'Confirma el cambio de correo de tu cuenta de MIRA Pricing.',
        title: 'Confirma tu nueva dirección de correo',
        paragraphs: [
          'Estás actualizando el correo asociado a tu cuenta de MIRA Pricing. Confirma el cambio para completar la actualización.',
          // Enseñar las dos direcciones es lo que convierte este correo en una
          // salvaguarda: si alguien no reconoce la dirección nueva, lo ve aquí.
          'La cuenta pasará de <strong>{{ .Email }}</strong> a <strong>{{ .NewEmail }}</strong>.',
        ],
        cta: { label: 'Confirmar cambio', url: CONFIRMATION_URL },
        note: 'Si no has pedido este cambio, ignora este correo y avisa a soporte: tu dirección actual no se modificará.',
      }),
    },

    {
      key: 'invite-user',
      supabaseTemplate: 'Invite user',
      subject: 'Te han invitado a MIRA Pricing',
      // Sí está en uso: `createOrganizationForNewOwner` da de alta al
      // propietario de una organización con `admin.inviteUserByEmail`.
      enUso: true,
      html: renderBrandedEmail({
        ...marca,
        preheader: 'Activa tu cuenta y empieza a trabajar en MIRA Pricing.',
        title: 'Te han invitado a MIRA Pricing',
        paragraphs: [
          'Has sido invitado a acceder a MIRA Pricing. Desde la plataforma podrás consultar mercados, gestionar precios y colaborar en procesos de cotización.',
          'Acepta la invitación para establecer tu contraseña y entrar por primera vez.',
        ],
        cta: { label: 'Aceptar invitación', url: CONFIRMATION_URL },
        note: 'Si no esperabas esta invitación, puedes ignorar este correo.',
      }),
    },

    {
      key: 'magic-link',
      supabaseTemplate: 'Magic Link',
      subject: 'Tu enlace de acceso a MIRA Pricing',
      // No implementado: no hay ninguna llamada a `signInWithOtp` en el
      // proyecto. Se deja con la marca por coherencia, para que activar el
      // acceso por enlace algún día no traiga de vuelta el diseño por defecto.
      enUso: false,
      html: renderBrandedEmail({
        ...marca,
        preheader: 'Enlace de acceso seguro a tu cuenta de MIRA Pricing.',
        title: 'Accede a tu cuenta',
        paragraphs: [
          'Usa el siguiente enlace para acceder de forma segura a tu cuenta de MIRA Pricing.',
        ],
        cta: { label: 'Acceder a MIRA Pricing', url: CONFIRMATION_URL },
        note: 'El enlace caduca en poco tiempo y solo puede usarse una vez. Si no has solicitado el acceso, ignora este correo.',
      }),
    },
  ]
}

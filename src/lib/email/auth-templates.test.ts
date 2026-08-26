// Plantillas de correo de Supabase Auth (bloque de marca).
//
// ═══════════════════════════════════════════════════════════════════════════
// ESTE ARCHIVO ADEMÁS *GENERA* LAS PLANTILLAS
// ═══════════════════════════════════════════════════════════════════════════
//
// Los ficheros de `docs/auth-emails/` son lo que se pega en el panel de
// Supabase. Podrían generarse con un script aparte, pero entonces nada
// impediría que el HTML pegado y el código se separaran con el tiempo — y como
// el panel no está en el repositorio, esa desviación sería invisible.
//
// Aquí se resuelven las dos cosas a la vez, con el patrón de FICHERO DORADO:
//
//   · en modo normal, COMPRUEBA que los ficheros de `docs/auth-emails/`
//     coinciden exactamente con lo que produce el código. Si alguien cambia el
//     copy y no regenera, el test falla y dice cómo arreglarlo;
//   · con `UPDATE_EMAIL_TEMPLATES=1`, los REESCRIBE.
//
//     npm run email:auth-templates
//
// Cero dependencias nuevas: usa el vitest que ya está en el proyecto.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BRAND, BRAND_NAME, BRAND_TAGLINE, TRANSACTIONAL_NOTICE } from './brand'
import { CONFIRMATION_URL, buildAuthEmailTemplates } from './auth-templates'

const SALIDA = join(process.cwd(), 'docs', 'auth-emails')
const REGENERAR = process.env.UPDATE_EMAIL_TEMPLATES === '1'

// El logotipo y la base se congelan al generar: las plantillas viven en
// Supabase y no pueden leer nuestras variables de entorno.
const OPCIONES = {
  logoUrl: process.env.MIRA_EMAIL_LOGO_URL?.trim() || null,
  siteUrl: 'https://demo.mirapricing.com',
}

const PLANTILLAS = buildAuthEmailTemplates(OPCIONES)

// ═══════════════════════════════════════════════════════════════════════════
// Cobertura: las cinco, y las que de verdad se usan
// ═══════════════════════════════════════════════════════════════════════════

describe('las plantillas cubiertas', () => {
  it('son las cinco pedidas, con su nombre exacto del panel de Supabase', () => {
    expect(PLANTILLAS.map((t) => t.supabaseTemplate).sort()).toEqual([
      'Change Email Address',
      'Confirm signup',
      'Invite user',
      'Magic Link',
      'Reset Password',
    ])
  })

  // Auditado sobre el código: `signUp()`, `resetPasswordForEmail()` y
  // `admin.inviteUserByEmail()` sí se llaman. El cambio de correo y el magic
  // link no existen todavía en la aplicación.
  it('marca cuáles dispara hoy la aplicación', () => {
    const enUso = PLANTILLAS.filter((t) => t.enUso).map((t) => t.supabaseTemplate).sort()
    expect(enUso).toEqual(['Confirm signup', 'Invite user', 'Reset Password'])
  })

  it('cada una trae asunto y cuerpo', () => {
    for (const t of PLANTILLAS) {
      expect(t.subject.length, t.key).toBeGreaterThan(10)
      expect(t.html.length, t.key).toBeGreaterThan(1000)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// LO INNEGOCIABLE: no romper Auth
// ═══════════════════════════════════════════════════════════════════════════

describe('los tokens de Supabase llegan intactos', () => {
  it('TODAS llevan {{ .ConfirmationURL }} literal, sin escapar', () => {
    for (const t of PLANTILLAS) {
      expect(t.html, t.key).toContain('{{ .ConfirmationURL }}')
      // Si se hubiera escapado, los puntos y llaves saldrían como entidades y
      // Go no sustituiría nada: el enlace llegaría literalmente roto.
      expect(t.html, t.key).not.toContain('&#123;')
      expect(t.html, t.key).not.toContain('{{ .ConfirmationURL }}'.replace(/\./g, '&#46;'))
    }
  })

  it('el enlace aparece en el botón Y en claro, para cuando el botón falla', () => {
    // Hay clientes que bloquean o rompen el botón; sin la versión en texto, la
    // persona se queda sin forma de continuar. Tres apariciones: el `href` del
    // botón, el `href` del enlace de respaldo y su texto visible.
    for (const t of PLANTILLAS) {
      const veces = t.html.split(CONFIRMATION_URL).length - 1
      expect(veces, t.key).toBe(3)
    }
    // Y el respaldo va acompañado de la instrucción, no suelto.
    for (const t of PLANTILLAS) {
      expect(t.html, t.key).toContain('copia y pega esta dirección en tu navegador')
    }
  })

  it('no se inventa ninguna variable que Supabase no defina', () => {
    // Set comprobado contra la documentación oficial.
    const permitidas = new Set([
      'ConfirmationURL', 'Token', 'TokenHash', 'SiteURL', 'RedirectTo',
      'Email', 'NewEmail', 'OldEmail', 'Data',
    ])
    for (const t of PLANTILLAS) {
      for (const m of t.html.matchAll(/\{\{\s*\.([A-Za-z]+)\s*\}\}/g)) {
        expect(permitidas.has(m[1]), `${t.key}: {{ .${m[1]} }}`).toBe(true)
      }
    }
  })

  it('el cambio de correo enseña la dirección vieja y la nueva', () => {
    const t = PLANTILLAS.find((x) => x.key === 'change-email')!
    expect(t.html).toContain('{{ .Email }}')
    expect(t.html).toContain('{{ .NewEmail }}')
  })

  // Los marcadores solo tienen sentido en la plantilla que los recibe.
  it('ninguna otra plantilla usa {{ .NewEmail }}', () => {
    for (const t of PLANTILLAS.filter((x) => x.key !== 'change-email')) {
      expect(t.html, t.key).not.toContain('{{ .NewEmail }}')
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Robustez del HTML para clientes de correo
// ═══════════════════════════════════════════════════════════════════════════

describe('el HTML aguanta en clientes de correo reales', () => {
  it('nada de CSS externo, fuentes web ni JavaScript', () => {
    for (const t of PLANTILLAS) {
      expect(t.html, t.key).not.toContain('<script')
      expect(t.html, t.key).not.toContain('<link')
      expect(t.html, t.key).not.toContain('@font-face')
      expect(t.html, t.key).not.toContain('fonts.googleapis')
    }
  })

  // Outlook de escritorio renderiza con el motor de Word: ignora flex y grid.
  it('no depende de layout moderno', () => {
    for (const t of PLANTILLAS) {
      expect(t.html, t.key).not.toContain('display:flex')
      expect(t.html, t.key).not.toContain('display:grid')
      expect(t.html, t.key).not.toContain('position:absolute')
    }
  })

  it('la maquetación es con tablas y estilos en línea', () => {
    for (const t of PLANTILLAS) {
      expect(t.html, t.key).toContain('role="presentation"')
      expect(t.html, t.key).toContain('cellpadding="0"')
    }
  })

  it('el botón lleva fondo en el atributo y en el estilo', () => {
    // `bgcolor` es lo que respetan los clientes que descartan `style`.
    for (const t of PLANTILLAS) {
      expect(t.html, t.key).toContain(`bgcolor="${BRAND.magenta}"`)
      expect(t.html, t.key).toContain(`background-color:${BRAND.magenta}`)
    }
  })

  it('el ancho es de 600 px y se adapta en móvil', () => {
    for (const t of PLANTILLAS) {
      expect(t.html, t.key).toContain('max-width:600px')
      expect(t.html, t.key).toContain('@media only screen and (max-width:620px)')
      expect(t.html, t.key).toContain('name="viewport"')
    }
  })

  it('cada correo trae su texto de vista previa', () => {
    for (const t of PLANTILLAS) {
      expect(t.html, t.key).toMatch(/display:none;font-size:1px/)
    }
  })

  it('sin logotipo se usa el nombre en texto, no una imagen rota', () => {
    const sinLogo = buildAuthEmailTemplates({ logoUrl: null })
    for (const t of sinLogo) {
      expect(t.html, t.key).not.toContain('<img')
      expect(t.html, t.key).toContain('MIRA')
    }
  })

  it('con logotipo, la imagen lleva alt y ancho', () => {
    const conLogo = buildAuthEmailTemplates({ logoUrl: 'https://cdn.ejemplo.com/mira.png' })
    for (const t of conLogo) {
      expect(t.html, t.key).toContain('alt="MIRA Pricing"')
      expect(t.html, t.key).toContain('width="150"')
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Marca y copy
// ═══════════════════════════════════════════════════════════════════════════

describe('marca y copy', () => {
  it('el nombre y el pie son iguales en las cinco', () => {
    for (const t of PLANTILLAS) {
      expect(t.html, t.key).toContain(BRAND_NAME)
      expect(t.html, t.key).toContain(BRAND_TAGLINE)
      expect(t.html, t.key).toContain(TRANSACTIONAL_NOTICE)
    }
  })

  it('usa el magenta REAL de la aplicación', () => {
    // `templates.ts` usa #C2185B, que no es el color de la marca. Aquí se usa
    // el token de `globals.css`.
    expect(BRAND.magenta).toBe('#D6006E')
    expect(BRAND.ink).toBe('#1A1230')
  })

  it('los títulos y CTA son los acordados', () => {
    const esperado: Record<string, [string, string]> = {
      'confirm-signup': ['Activa tu acceso a MIRA Pricing', 'Confirmar cuenta'],
      'reset-password': ['Restablece tu contraseña', 'Crear nueva contraseña'],
      'change-email': ['Confirma tu nueva dirección de correo', 'Confirmar cambio'],
      'invite-user': ['Te han invitado a MIRA Pricing', 'Aceptar invitación'],
      'magic-link': ['Accede a tu cuenta', 'Acceder a MIRA Pricing'],
    }
    for (const t of PLANTILLAS) {
      const [titulo, cta] = esperado[t.key]
      expect(t.html, t.key).toContain(titulo)
      expect(t.html, t.key).toContain(`>${cta}</a>`)
    }
  })

  it('nada de texto por defecto de Supabase ni en inglés', () => {
    for (const t of PLANTILLAS) {
      for (const generico of [
        'Reset your password', 'Confirm your signup', 'Follow this link',
        'Magic Link', 'You have been invited', 'Change your email',
      ]) {
        expect(t.html, `${t.key} / ${generico}`).not.toContain(generico)
      }
    }
  })

  it('los avisos de «si no has sido tú» están donde importan', () => {
    for (const key of ['reset-password', 'change-email', 'confirm-signup', 'invite-user']) {
      const t = PLANTILLAS.find((x) => x.key === key)!
      expect(t.html.toLowerCase(), key).toMatch(/si no (has|esperabas)/)
    }
  })

  it('los asuntos son concretos y nombran la marca donde toca', () => {
    for (const t of PLANTILLAS) {
      expect(t.subject.length, t.key).toBeLessThan(60) // no se corta en móvil
      expect(t.subject, t.key).not.toContain('{{')      // un asunto no lleva tokens
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Ficheros dorados: lo del repositorio es lo que produce el código
// ═══════════════════════════════════════════════════════════════════════════

describe('docs/auth-emails está al día', () => {
  it('cada plantilla coincide con su fichero generado', () => {
    if (REGENERAR) {
      mkdirSync(SALIDA, { recursive: true })
      for (const t of PLANTILLAS) writeFileSync(join(SALIDA, `${t.key}.html`), t.html, 'utf8')
      writeFileSync(join(SALIDA, 'README.md'), indiceMarkdown(), 'utf8')
    }

    for (const t of PLANTILLAS) {
      const ruta = join(SALIDA, `${t.key}.html`)
      expect(existsSync(ruta), `falta ${t.key}.html — ejecuta \`npm run email:auth-templates\``).toBe(true)
      expect(
        readFileSync(ruta, 'utf8'),
        `${t.key}.html no coincide con el código — ejecuta \`npm run email:auth-templates\``,
      ).toBe(t.html)
    }
  })
})

function indiceMarkdown(): string {
  return [
    '# Plantillas de correo de Supabase Auth — MIRA Pricing',
    '',
    '> **Generado automáticamente. No editar a mano.**',
    '> El contenido se cambia en `src/lib/email/auth-templates.ts` y se regenera con',
    '> `npm run email:auth-templates`. Un test comprueba que estos ficheros y el',
    '> código no se separen.',
    '',
    `Logotipo: ${OPCIONES.logoUrl ?? '_sin logotipo — se usa el nombre en texto_'}`,
    `Enlace del pie: ${OPCIONES.siteUrl}`,
    '',
    '## Cómo se pegan',
    '',
    'Panel de Supabase → **Authentication → Emails**. Para cada plantilla:',
    'el asunto va en «Subject heading» y el contenido íntegro del `.html` en',
    '«Message body».',
    '',
    '| Plantilla en Supabase | Asunto | Fichero | ¿La usa la app hoy? |',
    '|---|---|---|---|',
    ...PLANTILLAS.map(
      (t) => `| ${t.supabaseTemplate} | ${t.subject} | [\`${t.key}.html\`](./${t.key}.html) | ${t.enUso ? '**Sí**' : 'No — preparada'} |`,
    ),
    '',
  ].join('\n')
}

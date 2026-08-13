// Contrato de las Server Actions de Soporte (Bloque 2).
//
// En Next.js toda función exportada de un archivo `'use server'` es un ENDPOINT
// invocable desde el navegador. Estos tests leen el CÓDIGO FUENTE de
// `actions/support.ts` y fijan las propiedades que no se pueden comprobar con
// una llamada suelta: el orden de las operaciones y qué no se hace nunca.
//
// Misma técnica que `lib/audit/actions.test.ts`, que ya se usa en el proyecto
// para el mismo fin sobre las acciones de administración.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function fuente(...ruta: string[]): string {
  return readFileSync(join(process.cwd(), 'src', ...ruta), 'utf8')
}

function sinComentarios(texto: string): string {
  return texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

const SOPORTE = fuente('lib', 'actions', 'support.ts')
const CODIGO = sinComentarios(SOPORTE)

/** Cuerpo de una función exportada, para razonar sobre el ORDEN interno. */
function cuerpoDe(nombre: string): string {
  const inicio = CODIGO.indexOf(`export async function ${nombre}`)
  expect(inicio, `no se encuentra ${nombre}`).toBeGreaterThan(-1)
  const siguiente = CODIGO.indexOf('export async function ', inicio + 1)
  return CODIGO.slice(inicio, siguiente === -1 ? undefined : siguiente)
}

// ═══════════════════════════════════════════════════════════════════════════
// Autorización
// ═══════════════════════════════════════════════════════════════════════════

describe('cada acción exige su guard', () => {
  it('las acciones de administración exigen platform_admin', () => {
    for (const accion of ['updateTicketStatus', 'updateTicketResponse']) {
      expect(cuerpoDe(accion), accion).toContain('requirePlatformAdmin')
    }
  })

  it('crear ticket exige sesión, y DELIBERADAMENTE no más', () => {
    const cuerpo = cuerpoDe('submitSupportTicket')
    expect(cuerpo).toContain('requireSession')
    // Excepción documentada: soporte debe seguir abierto a una cuenta
    // suspendida, porque es la vía por la que puede reclamar. Endurecer esto
    // sería una regresión, no una corrección.
    expect(cuerpo).not.toContain('requireMembership(')
    expect(cuerpo).not.toContain('requireCommercialCapability')
  })

  it('`organization_id` se calcula en servidor, nunca se lee del formulario', () => {
    const cuerpo = cuerpoDe('submitSupportTicket')
    expect(cuerpo).toContain('resolveMembership(context)')
    expect(cuerpo).not.toMatch(/formData\.get\(\s*['"]organization_id['"]\s*\)/)
  })

  it('`user_id` del ticket es el de la sesión, no un parámetro', () => {
    const cuerpo = cuerpoDe('submitSupportTicket')
    expect(cuerpo).toContain('user_id: userId')
    expect(cuerpo).not.toMatch(/formData\.get\(\s*['"]user_id['"]\s*\)/)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// El correo NUNCA compromete la operación principal
// ═══════════════════════════════════════════════════════════════════════════

describe('primero se guarda, después se avisa', () => {
  it('en la creación, la notificación va DESPUÉS del insert', () => {
    const cuerpo = cuerpoDe('submitSupportTicket')
    const insert = cuerpo.indexOf('.insert(')
    const aviso = cuerpo.indexOf('notifyTicketCreated')
    expect(insert).toBeGreaterThan(-1)
    expect(aviso).toBeGreaterThan(insert)
  })

  it('en la respuesta, la notificación va DESPUÉS del update', () => {
    const cuerpo = cuerpoDe('updateTicketResponse')
    const update = cuerpo.indexOf('.update(')
    const aviso = cuerpo.indexOf('notifyTicketAnswered')
    expect(update).toBeGreaterThan(-1)
    expect(aviso).toBeGreaterThan(update)
  })

  it('toda notificación va envuelta en `notificar`, que absorbe cualquier fallo', () => {
    for (const accion of ['submitSupportTicket', 'updateTicketResponse']) {
      const cuerpo = cuerpoDe(accion)
      if (!cuerpo.includes('notify')) continue
      expect(cuerpo, accion).toContain('await notificar(')
    }
  })

  it('el resultado del envío NUNCA se devuelve a la interfaz', () => {
    // Si el `return` dependiera del correo, un proveedor caído haría creer que
    // el ticket no se ha guardado — y la persona lo volvería a enviar.
    for (const accion of ['submitSupportTicket', 'updateTicketResponse']) {
      const cuerpo = cuerpoDe(accion)
      expect(cuerpo, accion).not.toMatch(/return\s*{[^}]*notify/)
      expect(cuerpo, accion).not.toMatch(/if\s*\(\s*\w*[Ee]mail\w*\s*\)\s*return\s*{\s*error/)
    }
  })

  it('`notificar` captura y solo registra: no relanza', () => {
    const helper = CODIGO.slice(
      CODIGO.indexOf('async function notificar('),
      CODIGO.indexOf('async function resolverCorreoDePropietario('),
    )
    expect(helper).toContain('try')
    expect(helper).toContain('catch')
    expect(helper).not.toContain('throw')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Destinatario y contenido: nada se toma del navegador
// ═══════════════════════════════════════════════════════════════════════════

describe('el aviso de respuesta no se fía del formulario', () => {
  it('el ticket se RELEE de la base antes de escribir', () => {
    const cuerpo = cuerpoDe('updateTicketResponse')
    const lectura = cuerpo.indexOf("select('id, user_id, subject, admin_response')")
    const update = cuerpo.indexOf('.update(')
    expect(lectura).toBeGreaterThan(-1)
    expect(lectura).toBeLessThan(update)
  })

  it('el destinatario sale de `previo.user_id`, no de un campo del formulario', () => {
    const cuerpo = cuerpoDe('updateTicketResponse')
    expect(cuerpo).toContain('resolverCorreoDePropietario(previo.user_id')
    expect(cuerpo).not.toMatch(/formData\.get\(\s*['"](user_id|email|recipient)['"]\s*\)/)
  })

  it('el asunto del correo sale de la base, no del formulario', () => {
    const cuerpo = cuerpoDe('updateTicketResponse')
    expect(cuerpo).toContain('subject: (previo.subject')
  })

  it('un identificador inexistente NO se salda con un «guardado» silencioso', () => {
    const cuerpo = cuerpoDe('updateTicketResponse')
    expect(cuerpo).toContain('.select(')
    expect(cuerpo).toMatch(/actualizado\.length === 0/)
  })

  it('no se reenvía correo si la respuesta no ha cambiado', () => {
    const cuerpo = cuerpoDe('updateTicketResponse')
    expect(cuerpo).toContain('hayRespuestaNueva')
    expect(cuerpo).toContain('textoNuevo !== textoAnterior')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Errores: qué se enseña y qué no
// ═══════════════════════════════════════════════════════════════════════════

describe('no se filtra nada interno a la interfaz', () => {
  it('ninguna acción devuelve `error.message` de PostgreSQL', () => {
    // `updateTicketResponse` lo hacía: devolvía el mensaje crudo del driver.
    expect(CODIGO).not.toMatch(/return\s*{\s*error:\s*error\.message\s*}/)
  })

  it('el detalle técnico se registra en servidor, no se devuelve', () => {
    for (const accion of ['submitSupportTicket', 'updateTicketResponse']) {
      expect(cuerpoDe(accion), accion).toContain('console.error')
    }
  })
})

describe('el cliente privilegiado está acotado', () => {
  it('solo se usa para resolver el correo del propietario', () => {
    const usos = (CODIGO.match(/createSupabaseAdminClient/g) ?? []).length
    expect(usos).toBe(2) // el import y la llamada dentro del helper
    expect(CODIGO).toContain('async function resolverCorreoDePropietario(')
  })

  it('NUNCA se usa para leer ni escribir tickets', () => {
    const helper = CODIGO.slice(CODIGO.indexOf('async function resolverCorreoDePropietario('))
    const cuerpoHelper = helper.slice(0, helper.indexOf('\n}\n') + 3)
    expect(cuerpoHelper).toContain('auth.admin.getUserById')
    expect(cuerpoHelper).not.toContain('support_tickets')
    expect(cuerpoHelper).not.toContain('.update(')
    expect(cuerpoHelper).not.toContain('.insert(')
  })

  it('no se usa `listUsers`: no hay enumeración de cuentas', () => {
    expect(CODIGO).not.toContain('listUsers')
  })
})

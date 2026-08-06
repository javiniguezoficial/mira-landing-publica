// Semántica de la UX de administración de usuarios y equipo.
//
// ADVERTENCIA: esto NO renderiza componentes. El proyecto no tiene entorno DOM.
// Lee el CÓDIGO FUENTE y fija las decisiones de maquetación que un refactor
// descuidado desharía sin romper ni el build ni TypeScript — y que son
// exactamente las que se detectaron mal en las pruebas manuales.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function fuente(...ruta: string[]): string {
  return readFileSync(join(process.cwd(), 'src', ...ruta), 'utf8')
}

/** El archivo sin comentarios: «esto ya no está» debe mirar el código. */
function sinComentarios(texto: string): string {
  return texto
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

const FICHA_USUARIO = fuente('app', 'admin', 'usuarios', '[id]', 'page.tsx')
const FICHA_CLIENTE = fuente('app', 'admin', 'clientes', '[id]', 'page.tsx')
const TARJETA_ASIGNAR = fuente('components', 'admin', 'users', 'AssignOrganizationCard.tsx')
const TABLA_MIEMBROS = fuente('components', 'admin', 'users', 'MembersTable.tsx')

// ═══════════════════════════════════════════════════════════════════════════
// 1. Asignación: el título y el texto dependen del estado
// ═══════════════════════════════════════════════════════════════════════════

describe('1. bloque de asignación', () => {
  it('el título se calcula, no está escrito a mano', () => {
    expect(FICHA_USUARIO).toContain('assignmentSectionTitle(user.memberships.length)')
    expect(sinComentarios(FICHA_USUARIO)).not.toContain('title="Asignar a una organización"')
  })

  it('el texto aclaratorio también depende del número de pertenencias', () => {
    expect(FICHA_USUARIO).toContain('assignmentSectionHelp(user.memberships.length)')
  })

  // Un solo sitio donde vive la redacción: si la página y el formulario la
  // repitieran, acabarían diciendo cosas distintas de la misma acción.
  it('los textos vienen del módulo puro, que es donde se prueban', () => {
    expect(FICHA_USUARIO).toContain("from '@/lib/users/assignment-copy'")
    expect(TARJETA_ASIGNAR).toContain("from '@/lib/users/assignment-copy'")
  })
})

describe('2. advertencia de propiedad', () => {
  it('se pinta la advertencia y su casilla de confirmación', () => {
    expect(TARJETA_ASIGNAR).toContain('OWNER_ASSIGNMENT_WARNING')
    expect(TARJETA_ASIGNAR).toContain('OWNER_ASSIGNMENT_ACKNOWLEDGEMENT')
  })

  // Solo para `owner`: pedirla en `admin` o `member` la convertiría en un
  // trámite que se marca sin leer.
  it('solo aparece cuando el rol elegido es propietario', () => {
    expect(TARJETA_ASIGNAR).toContain('requiresOwnerConfirmation(role)')
    expect(TARJETA_ASIGNAR).toContain('{exigeConfirmacion && org && (')
  })

  it('se anuncia con `role="alert"`, no como texto decorativo', () => {
    const desde = TARJETA_ASIGNAR.indexOf('{exigeConfirmacion && org && (')
    expect(TARJETA_ASIGNAR.slice(desde, desde + 400)).toContain('role="alert"')
  })

  it('el botón queda bloqueado hasta marcar la casilla', () => {
    expect(TARJETA_ASIGNAR).toContain('disabled={pending || !orgId || bloqueadoPorConfirmacion}')
  })

  // El botón deshabilitado no impide enviar el formulario con Intro, así que la
  // misma condición se comprueba en el manejador.
  it('el envío también se comprueba en el manejador, no solo en el botón', () => {
    const codigo = sinComentarios(TARJETA_ASIGNAR)
    const desde = codigo.indexOf('function handleSubmit')
    const cuerpo = codigo.slice(desde, codigo.indexOf('startTransition', desde))
    expect(cuerpo).toContain('bloqueadoPorConfirmacion')
  })

  // Una casilla marcada que sobrevive a un cambio de rol o de empresa ya no
  // confirma lo que dice confirmar.
  it('la confirmación se reinicia al cambiar de rol o de organización', () => {
    expect((TARJETA_ASIGNAR.match(/setOwnerAck\(false\)/g) ?? []).length).toBeGreaterThanOrEqual(3)
  })

  // La advertencia informa; no relaja nada.
  it('NO se ha tocado la protección: owner solo si la organización no tiene', () => {
    expect(TARJETA_ASIGNAR).toContain('const puedeSerPropietario = !!org && !org.hasOwner')
    expect(TARJETA_ASIGNAR).toContain('{puedeSerPropietario && (')
    expect(TARJETA_ASIGNAR).toContain('Esta organización ya tiene propietario.')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 3. Ancho del bloque de miembros
// ═══════════════════════════════════════════════════════════════════════════
//
// El problema: la página entera estaba dentro de `max-w-4xl` (896 px) y la
// tabla tiene SIETE columnas, así que aparecía scroll horizontal incluso en
// escritorio.

describe('3. ancho de la ficha de cliente', () => {
  it('el contenedor externo ya no impone el ancho estrecho', () => {
    expect(sinComentarios(FICHA_CLIENTE)).not.toContain(
      '<div className="w-full max-w-4xl space-y-6 p-4 md:p-6 xl:p-8">',
    )
    expect(FICHA_CLIENTE).toContain('<div className="w-full space-y-6 p-4 md:p-6 xl:p-8">')
  })

  // Las tarjetas de formulario conservan exactamente el ancho que tenían: el
  // cambio solo debía afectar al bloque de miembros.
  it('cabecera y tarjetas conservan `max-w-4xl`', () => {
    expect(FICHA_CLIENTE).toContain('<div className="max-w-4xl">')
    expect(FICHA_CLIENTE).toContain('<div className="max-w-4xl space-y-6">')
  })

  it('el bloque de miembros usa un contenedor más ancho', () => {
    expect(FICHA_CLIENTE).toContain('<div className="max-w-6xl">')
    const posAncho = FICHA_CLIENTE.indexOf('<div className="max-w-6xl">')
    const posTabla = FICHA_CLIENTE.indexOf('<MembersTable')
    expect(posAncho).toBeGreaterThan(-1)
    expect(posAncho).toBeLessThan(posTabla)
  })
})

describe('4. columnas de la tabla de miembros', () => {
  const COLUMNAS = ['Miembro', 'Email', 'Rol', 'Pertenencia', 'Capacidades', 'Incorporación']

  it('conserva las siete columnas', () => {
    for (const c of COLUMNAS) {
      expect(TABLA_MIEMBROS, c).toContain(`label: '${c}'`)
    }
    // La séptima es la de acciones, sin rótulo visible.
    expect(TABLA_MIEMBROS).toContain("label: '',")
  })

  it('la columna de acciones tiene texto accesible aunque no se vea', () => {
    expect(TABLA_MIEMBROS).toContain('<span className="sr-only">Acciones</span>')
    expect(TABLA_MIEMBROS).toContain('scope="col"')
  })

  // Nombre y correo son lo que de verdad se lee.
  it('nombre y correo se llevan casi la mitad del ancho', () => {
    expect(TABLA_MIEMBROS).toContain("width: 'w-[22%]'")
    expect(TABLA_MIEMBROS).toContain("width: 'w-[24%]'")
  })

  // La causa del scroll: la tabla exigía el ancho de su contenido más largo.
  it('NO hay min-width en la tabla ni en su contenedor', () => {
    const codigo = sinComentarios(TABLA_MIEMBROS)
    expect(codigo).not.toMatch(/min-w-\[/)
    expect(codigo).not.toContain('min-w-full')
    expect(codigo).not.toContain('min-w-max')
  })

  it('la tabla reparte el ancho disponible en lugar de imponerlo', () => {
    expect(TABLA_MIEMBROS).toContain('<table className="w-full table-fixed text-sm">')
  })

  // `nowrap` solo donde partir el contenido lo haría ilegible: los dos
  // desplegables, la fecha y los iconos de acción.
  it('quedan exactamente 4 celdas con `whitespace-nowrap`', () => {
    const codigo = sinComentarios(TABLA_MIEMBROS)
    const celdas = codigo.match(/<td className="whitespace-nowrap/g) ?? []
    expect(celdas).toHaveLength(4)
  })

  it('nombre, correo y capacidades pueden envolver', () => {
    const codigo = sinComentarios(TABLA_MIEMBROS)
    expect(codigo).toContain('break-words')
    expect(codigo).toContain('flex flex-wrap items-center gap-x-3 gap-y-1')
  })

  // Se conserva como red de seguridad para móvil: solo aparece scrollbar si el
  // contenido no cabe, y en escritorio ya cabe.
  it('el scroll horizontal sigue disponible para pantallas estrechas', () => {
    expect(TABLA_MIEMBROS).toContain('overflow-x-auto')
  })

  it('no se ha ocultado ninguna acción ni cambiado el comportamiento', () => {
    for (const accion of [
      'updateMembershipRole',
      'updateMembershipStatus',
      'updateMembershipCapabilities',
      'removeMembership',
    ]) {
      expect(TABLA_MIEMBROS, accion).toContain(accion)
    }
    expect(TABLA_MIEMBROS).toContain('aria-label={`Rol de ${fullName(member)}`}')
    expect(TABLA_MIEMBROS).toContain('Retirar de la organización')
  })
})

// Contador de respuestas en la navegación del portal cliente
// (Bloque 2 · ajuste final).
//
// Dos capas, probadas por separado:
//
//   1. el FORMATO del badge — `formatBadgeCount`, que ya existía para el aviso
//      de /admin y aquí se reutiliza sin cambiarlo;
//   2. el CONTRATO de la consulta — se lee el código fuente de
//      `queries/support.ts` para fijar el filtrado, igual que hace
//      `lib/support/actions-semantics.test.ts` con las Server Actions.
//
// Lo que NO se prueba aquí es RLS: la barrera real es la policy
// `client_select_own_tickets`, y su verificación vive en la base de datos.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { badgeAriaLabel, formatBadgeCount } from './badge'
import { countAnswered } from './ticket-view'

function fuente(...ruta: string[]): string {
  return readFileSync(join(process.cwd(), 'src', ...ruta), 'utf8')
}

function sinComentarios(texto: string): string {
  return texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

const QUERIES = fuente('lib', 'queries', 'support.ts')
const LAYOUT = fuente('app', 'app', 'layout.tsx')
const SHELL = fuente('components', 'app', 'AppShell.tsx')

// ═══════════════════════════════════════════════════════════════════════════
// Formato del badge
// ═══════════════════════════════════════════════════════════════════════════

describe('cuántas respuestas se muestran', () => {
  it('0 respuestas → NO se pinta badge', () => {
    // Un «0» permanente junto a Ayuda comunica lo mismo que no poner nada y
    // además parece un aviso.
    expect(formatBadgeCount(0)).toBeNull()
  })

  it('1 respuesta → badge «1»', () => {
    expect(formatBadgeCount(1)).toBe('1')
  })

  it('varias respuestas → el número correcto', () => {
    expect(formatBadgeCount(2)).toBe('2')
    expect(formatBadgeCount(7)).toBe('7')
    expect(formatBadgeCount(99)).toBe('99')
  })

  it('a partir de 100 se recorta a «99+»', () => {
    expect(formatBadgeCount(100)).toBe('99+')
  })

  it('FAIL-SAFE: un contador roto no pinta un aviso falso', () => {
    for (const malo of [-1, NaN, Infinity, null, undefined]) {
      expect(formatBadgeCount(malo as number), String(malo)).toBeNull()
    }
  })

  it('el texto accesible explica de qué es el número', () => {
    // «Ayuda 2» a secas no dice qué son esos dos para un lector de pantalla.
    expect(badgeAriaLabel('Ayuda', 0)).toBe('Ayuda')
    expect(badgeAriaLabel('Ayuda', 1)).toContain('1 ticket')
    expect(badgeAriaLabel('Ayuda', 3)).toContain('3 tickets')
  })
})

describe('el recuento coincide con lo que muestra la pantalla', () => {
  it('cuenta solo las solicitudes con respuesta real', () => {
    const conRespuesta = { admin_response: 'Hecho', status: 'resolved' }
    const sinRespuesta = { admin_response: null, status: 'open' }
    const enBlanco = { admin_response: '   ', status: 'open' }

    expect(countAnswered([])).toBe(0)
    expect(countAnswered([sinRespuesta, sinRespuesta])).toBe(0)
    expect(countAnswered([conRespuesta, sinRespuesta])).toBe(1)
    expect(countAnswered([conRespuesta, conRespuesta, sinRespuesta])).toBe(2)
    // Una respuesta en blanco no enciende el aviso.
    expect(countAnswered([enBlanco])).toBe(0)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Contrato de la consulta
// ═══════════════════════════════════════════════════════════════════════════

describe('getMyAnsweredTicketCount — aislamiento', () => {
  const codigo = sinComentarios(QUERIES)
  const cuerpo = codigo.slice(codigo.indexOf('export async function getMyAnsweredTicketCount'))

  it('filtra por el usuario de la SESIÓN, no por un parámetro', () => {
    // La función no recibe ningún identificador: lo saca de `getUser()`. Así no
    // hay forma de pedir el recuento de otra persona.
    expect(cuerpo).toContain('getMyAnsweredTicketCount(): Promise<number>')
    expect(cuerpo).toContain('auth.getUser()')
    expect(cuerpo).toContain(".eq('user_id', user.id)")
  })

  it('sin sesión devuelve 0 y no consulta nada', () => {
    expect(cuerpo).toContain('if (!user) return 0')
  })

  it('cuenta solo tickets CON respuesta', () => {
    expect(cuerpo).toContain(".not('admin_response', 'is', null)")
    expect(cuerpo).toContain(".neq('admin_response', '')")
  })

  it('no trae filas: solo el número', () => {
    // Se ejecuta en CADA navegación del portal. Traer contenido de tickets
    // para contarlos sería moverlos por la red sin motivo.
    expect(cuerpo).toContain('head: true')
    expect(cuerpo).toContain("count: 'exact'")
  })

  it('el filtro por usuario y el de la pantalla de Ayuda son el MISMO', () => {
    // Si el badge contara también los tickets de la organización —que la policy
    // permite leer— el usuario vería «3» y al entrar encontraría uno.
    const ayuda = sinComentarios(QUERIES)
    const cuerpoMisTickets = ayuda.slice(
      ayuda.indexOf('export async function getMyTickets'),
      ayuda.indexOf('export async function getPendingTicketCount'),
    )
    expect(cuerpoMisTickets).toContain(".eq('user_id', user.id)")
    expect(cuerpo).toContain(".eq('user_id', user.id)")
  })

  it('FAIL-SAFE: ante un error devuelve 0', () => {
    expect(cuerpo).toMatch(/if \(error\)[\s\S]{0,200}return 0/)
  })
})

describe('el contador se resuelve en SERVIDOR', () => {
  const layout = sinComentarios(LAYOUT)
  const shell = sinComentarios(SHELL)

  it('lo calcula el layout, no el navegador', () => {
    expect(layout).toContain('getMyAnsweredTicketCount')
    expect(layout).toContain('answeredTickets')
  })

  it('va en paralelo con los módulos: no encadena dos esperas', () => {
    expect(layout).toContain('Promise.all')
  })

  it('la barra lateral NO abre su propia consulta', () => {
    // Mismo criterio que el badge de /admin: baja como prop y no hay sondeo.
    expect(shell).not.toContain('getMyAnsweredTicketCount')
    expect(shell).not.toContain('setInterval')
    expect(shell).toContain('answeredTickets')
  })

  it('el aviso se cuelga de /app/ayuda', () => {
    expect(shell).toMatch(/'\/app\/ayuda'[\s\S]{0,80}badgeCount/)
  })
})

// Aviso de respuestas SIN LEER en la navegación del portal cliente
// (Bloque 2 · ajuste 041/042).
//
// Tres capas, probadas por separado:
//
//   1. el ESTADO de lectura — funciones puras de `ticket-view.ts`;
//   2. el FORMATO del badge — `formatBadgeCount`, reutilizado sin cambios del
//      aviso de /admin;
//   3. el CONTRATO de la consulta, la acción y el marcado — se lee el código
//      fuente, igual que hace `actions-semantics.test.ts` con las acciones.
//
// Lo que NO se prueba aquí es RLS ni el trigger: la autoridad son la policy
// `client_select_own_tickets`, el trigger `support_tickets_response_state` y la
// función `mark_my_support_responses_seen()`. Su comportamiento se verificó
// contra la base real con rollback forzado antes de escribir esto.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { badgeAriaLabel, formatBadgeCount } from './badge'
import { countAnswered, countUnread, isUnreadResponse, ticketListHint } from './ticket-view'

function fuente(...ruta: string[]): string {
  return readFileSync(join(process.cwd(), 'src', ...ruta), 'utf8')
}

function sinComentarios(texto: string): string {
  return texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

const QUERIES = fuente('lib', 'queries', 'support.ts')
const ACCIONES = fuente('lib', 'actions', 'support.ts')
const LAYOUT = fuente('app', 'app', 'layout.tsx')
const SHELL = fuente('components', 'app', 'AppShell.tsx')
const MARCADOR = fuente('components', 'app', 'support', 'MarkResponsesSeen.tsx')
const PAGINA = fuente('app', 'app', 'ayuda', 'page.tsx')

// Atajos para construir tickets en los estados que importan.
const SIN_RESPUESTA = { admin_response: null, status: 'open', admin_responded_at: null, response_seen_at: null }
const NUEVA = { admin_response: 'Hecho', status: 'resolved', admin_responded_at: '2026-08-14T10:00:00Z', response_seen_at: null }
const LEIDA = { admin_response: 'Hecho', status: 'resolved', admin_responded_at: '2026-08-14T10:00:00Z', response_seen_at: '2026-08-14T11:00:00Z' }

// ═══════════════════════════════════════════════════════════════════════════
// Estado de lectura
// ═══════════════════════════════════════════════════════════════════════════

describe('isUnreadResponse — qué cuenta como «sin leer»', () => {
  it('respondido y nunca visto → SIN LEER', () => {
    expect(isUnreadResponse(NUEVA)).toBe(true)
  })

  it('respondido y ya visto → leído', () => {
    expect(isUnreadResponse(LEIDA)).toBe(false)
  })

  it('sin respuesta NUNCA está «sin leer»', () => {
    expect(isUnreadResponse(SIN_RESPUESTA)).toBe(false)
    // Un ticket abierto sin contestar no es una notificación pendiente: es un
    // ticket esperando respuesta, que es lo contrario.
  })

  it('tolera entradas ausentes', () => {
    expect(isUnreadResponse(null)).toBe(false)
    expect(isUnreadResponse(undefined)).toBe(false)
  })

  it('se apoya en UNA sola columna, no en comparar dos fechas', () => {
    // PostgREST no compara columna con columna (comprobado: 400 22007), y por
    // eso 042 dejó `response_seen_at IS NULL` como único criterio. La interfaz
    // usa exactamente el mismo, para que no puedan divergir.
    const seenAnterior = { ...LEIDA, response_seen_at: '2020-01-01T00:00:00Z' }
    expect(isUnreadResponse(seenAnterior)).toBe(false)
  })
})

describe('countUnread', () => {
  it('0 sin leer', () => {
    expect(countUnread([])).toBe(0)
    expect(countUnread([SIN_RESPUESTA, LEIDA])).toBe(0)
  })

  it('1 sin leer', () => {
    expect(countUnread([NUEVA, LEIDA, SIN_RESPUESTA])).toBe(1)
  })

  it('varias sin leer', () => {
    expect(countUnread([NUEVA, NUEVA, LEIDA])).toBe(2)
    expect(countUnread([NUEVA, NUEVA, NUEVA])).toBe(3)
  })

  it('«tiene respuesta» y «sin leer» son cosas distintas', () => {
    const lista = [NUEVA, LEIDA, SIN_RESPUESTA]
    expect(countAnswered(lista)).toBe(2) // dos respondidas…
    expect(countUnread(lista)).toBe(1)   // …pero solo una sin leer
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Formato del badge
// ═══════════════════════════════════════════════════════════════════════════

describe('cómo se pinta el aviso', () => {
  it('0 sin leer → NO se pinta badge', () => {
    expect(formatBadgeCount(countUnread([LEIDA, SIN_RESPUESTA]))).toBeNull()
  })

  it('1 sin leer → badge «1»', () => {
    expect(formatBadgeCount(countUnread([NUEVA, LEIDA]))).toBe('1')
  })

  it('2 sin leer → badge «2»', () => {
    expect(formatBadgeCount(countUnread([NUEVA, NUEVA, LEIDA]))).toBe('2')
  })

  it('el badge BAJA cuando se leen', () => {
    const antes = [NUEVA, NUEVA]
    const despues = antes.map((t) => ({ ...t, response_seen_at: '2026-08-14T12:00:00Z' }))
    expect(formatBadgeCount(countUnread(antes))).toBe('2')
    expect(formatBadgeCount(countUnread(despues))).toBeNull()
  })

  it('FAIL-SAFE: un contador roto no pinta un aviso falso', () => {
    for (const malo of [-1, NaN, Infinity, null, undefined]) {
      expect(formatBadgeCount(malo as number), String(malo)).toBeNull()
    }
  })

  it('el texto accesible explica de qué es el número', () => {
    expect(badgeAriaLabel('Ayuda', 0)).toBe('Ayuda')
    expect(badgeAriaLabel('Ayuda', 1)).toContain('1 ticket')
    expect(badgeAriaLabel('Ayuda', 3)).toContain('3 tickets')
  })
})

describe('texto de ayuda del listado', () => {
  it('prioriza lo que requiere atención ahora', () => {
    expect(ticketListHint([NUEVA, LEIDA])).toContain('1 respuesta nueva')
    expect(ticketListHint([NUEVA, NUEVA])).toContain('2 respuestas nuevas')
  })

  it('sin nuevas, informa de las que ya tienen respuesta', () => {
    expect(ticketListHint([LEIDA, LEIDA])).toContain('2 de tus solicitudes')
  })

  it('sin ninguna respuesta, promete el aviso por correo', () => {
    expect(ticketListHint([SIN_RESPUESTA])).toContain('correo')
  })

  it('sin solicitudes no se dice nada', () => {
    expect(ticketListHint([])).toBe('')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Contrato de la consulta
// ═══════════════════════════════════════════════════════════════════════════

describe('getMyUnreadResponseCount — aislamiento', () => {
  const codigo = sinComentarios(QUERIES)
  const cuerpo = codigo.slice(codigo.indexOf('export async function getMyUnreadResponseCount'))

  it('filtra por el usuario de la SESIÓN, no por un parámetro', () => {
    expect(cuerpo).toContain('getMyUnreadResponseCount(): Promise<number>')
    expect(cuerpo).toContain('auth.getUser()')
    expect(cuerpo).toContain(".eq('user_id', user.id)")
  })

  it('sin sesión devuelve 0 y no consulta nada', () => {
    expect(cuerpo).toContain('if (!user) return 0')
  })

  it('cuenta solo respuestas SIN LEER', () => {
    expect(cuerpo).toContain(".not('admin_responded_at', 'is', null)")
    expect(cuerpo).toContain(".is('response_seen_at', null)")
  })

  it('NO usa comparación entre columnas, que PostgREST rechaza', () => {
    expect(cuerpo).not.toContain('response_seen_at.lt.admin_responded_at')
  })

  it('no trae filas: solo el número', () => {
    expect(cuerpo).toContain('head: true')
    expect(cuerpo).toContain("count: 'exact'")
  })

  it('el filtro por usuario y el de la pantalla de Ayuda son el MISMO', () => {
    // Si el badge contara también los tickets de la organización —que la policy
    // permite leer— el usuario vería «3» y al entrar encontraría uno.
    const misTickets = codigo.slice(
      codigo.indexOf('export async function getMyTickets'),
      codigo.indexOf('export async function getPendingTicketCount'),
    )
    expect(misTickets).toContain(".eq('user_id', user.id)")
    expect(cuerpo).toContain(".eq('user_id', user.id)")
  })

  it('FAIL-SAFE: ante un error devuelve 0', () => {
    expect(cuerpo).toMatch(/if \(error\)[\s\S]{0,250}return 0/)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Marcado de lectura
// ═══════════════════════════════════════════════════════════════════════════

describe('markMySupportResponsesSeen — cómo se marca', () => {
  const codigo = sinComentarios(ACCIONES)
  const cuerpo = codigo.slice(
    codigo.indexOf('export async function markMySupportResponsesSeen'),
    codigo.indexOf('export async function updateTicketStatus'),
  )

  it('exige sesión', () => {
    expect(cuerpo).toContain('requireSession')
  })

  it('usa la RPC, NO un UPDATE directo sobre la tabla', () => {
    // El cliente no tiene policy UPDATE sobre `support_tickets`, y no debe
    // tenerla: RLS actúa sobre la fila, no sobre la columna.
    expect(cuerpo).toContain("rpc('mark_my_support_responses_seen')")
    expect(cuerpo).not.toContain(".from('support_tickets')")
    expect(cuerpo).not.toContain('.update(')
  })

  it('la RPC no recibe NINGÚN identificador manipulable', () => {
    // Sin parámetros: el conjunto de filas lo decide `auth.uid()` en SQL.
    expect(cuerpo).toMatch(/rpc\('mark_my_support_responses_seen'\)/)
  })

  it('NO revalida: el badge baja en la siguiente navegación', () => {
    // Revalidar aquí volvería a montar la pantalla que se está mirando y
    // abriría la puerta a un ciclo render → acción → revalidate → render.
    expect(cuerpo).not.toContain('revalidatePath')
    expect(cuerpo).not.toContain('refrescarSoporte')
  })

  it('nunca lanza: la pantalla no se rompe si el marcado falla', () => {
    expect(cuerpo).toContain('try')
    expect(cuerpo).toContain('catch')
    expect(cuerpo).not.toContain('throw')
  })
})

describe('el disparo del marcado no genera escrituras innecesarias', () => {
  const marcador = sinComentarios(MARCADOR)

  it('con 0 sin leer NO se llama a la acción', () => {
    expect(marcador).toMatch(/unreadCount <= 0[\s\S]{0,40}return/)
  })

  it('una sola llamada por montaje, aunque el efecto se repita', () => {
    // Strict Mode ejecuta los efectos dos veces en desarrollo.
    expect(marcador).toContain('useRef')
    expect(marcador).toContain('yaLanzado.current')
  })

  it('no refresca la pantalla que la persona está leyendo', () => {
    expect(marcador).not.toContain('router.refresh')
    expect(marcador).not.toContain('useRouter')
  })

  it('el marcado se dispara SOLO en la pantalla donde se ven las respuestas', () => {
    // Una visita a otra ruta cualquiera no puede contar como lectura.
    expect(sinComentarios(PAGINA)).toContain('<MarkResponsesSeen')
    expect(sinComentarios(LAYOUT)).not.toContain('MarkResponsesSeen')
  })
})

describe('el contador se resuelve en SERVIDOR', () => {
  const layout = sinComentarios(LAYOUT)
  const shell = sinComentarios(SHELL)

  it('lo calcula el layout, no el navegador', () => {
    expect(layout).toContain('getMyUnreadResponseCount')
    expect(layout).toContain('unreadResponses')
  })

  it('va en paralelo con los módulos: no encadena dos esperas', () => {
    expect(layout).toContain('Promise.all')
  })

  it('la barra lateral NO abre su propia consulta', () => {
    expect(shell).not.toContain('getMyUnreadResponseCount')
    expect(shell).not.toContain('setInterval')
    expect(shell).toContain('unreadResponses')
  })

  it('el aviso se cuelga de /app/ayuda', () => {
    expect(shell).toMatch(/'\/app\/ayuda'[\s\S]{0,80}badgeCount/)
  })
})

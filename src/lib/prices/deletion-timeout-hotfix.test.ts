// Hotfix del borrado de precios: el `statement timeout` y lo que se enseña.
//
// ═══════════════════════════════════════════════════════════════════════════
// LA INCIDENCIA
// ═══════════════════════════════════════════════════════════════════════════
//
// Borrar más de ~40 precios —por selección o en masivo— terminaba en
// «canceling statement due to statement timeout». Con 682 precios era
// sistemático.
//
// La causa NO era la copia de seguridad, que es lo que se sospechaba. Era una
// clave foránea sin índice:
//
//   market_import_rows.imported_record_id → product_price_records(id)
//   ON DELETE SET NULL
//
// Por cada precio borrado, PostgreSQL tenía que localizar las filas de
// importación que lo referencian para ponerles la columna a NULL, y sin índice
// eso es un Seq Scan completo de 127.605 filas. Medido en la base real:
//
//   Seq Scan on market_import_rows (actual time=2225.222..2225.222 rows=0)
//     Rows Removed by Filter: 127605
//
// El rol `authenticated` —con el que entra la RPC por PostgREST— tiene
// `statement_timeout = 8s`. A ~200 ms por fila, el techo estaba en unas 40
// filas: exactamente el umbral reportado.
//
// ═══════════════════════════════════════════════════════════════════════════
// VERIFICACIÓN CONTRA LA BASE REAL
// ═══════════════════════════════════════════════════════════════════════════
//
// Con DELETE reales en transacciones REVERTIDAS (ningún dato perdido):
//
//   n        antes        después
//   1        220 ms        19 ms
//   10     2.068 ms        19 ms
//   40     3.453 ms        51 ms
//   100    (timeout)      185 ms
//   682    (timeout)      724 ms
//   1000   (timeout)      313 ms
//
// Y la RPC completa `apply_price_deletion` sobre fixtures creados y revertidos,
// con 50 precios TESTIGO fuera del filtro en cada tamaño:
//
//   n=1 · 10 · 40 · 100 · 500 · 1000
//   → borrados = seleccionados, testigos 50/50 intactos, auditoría completa,
//     estado `completed`, 17–233 ms.
//
// ADVERTENCIA, la de siempre: este archivo NO consulta la base. Lee el TEXTO
// del SQL versionado y prueba las funciones puras, para que un cambio futuro no
// deshaga en silencio ninguna de esas propiedades.

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  MENSAJE_GENERICO,
  SQLSTATE_TIMEOUT,
  SQLSTATES_CON_MENSAJE_PROPIO,
  mensajeDeConfirmacion,
} from './deletion-errors'

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations')

function migracion(prefijo: string): string {
  const nombre = readdirSync(MIGRATIONS_DIR).find((f) => f.includes(prefijo))
  if (!nombre) throw new Error(`Falta la migración ${prefijo}`)
  return readFileSync(join(MIGRATIONS_DIR, nombre), 'utf8')
}

function ejecutable(texto: string): string {
  return texto
    .split('\n')
    .map((l) => l.replace(/--.*$/, ''))
    .join('\n')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

const SQL_044 = ejecutable(migracion('_044_'))

// ═══════════════════════════════════════════════════════════════════════════
// La migración: los dos índices, y nada más
// ═══════════════════════════════════════════════════════════════════════════

describe('044 — índices de las FK del borrado', () => {
  it('indexa la FK que provocaba el timeout', () => {
    expect(SQL_044).toContain('create index if not exists idx_mir_imported_record on public.market_import_rows (imported_record_id)')
  })

  it('indexa también la FK inversa, que se dispara en el modo `import`', () => {
    expect(SQL_044).toContain('create index if not exists idx_ppr_import_row on public.product_price_records (import_row_id)')
  })

  // Las filas sin precio asociado no participan en la comprobación de la FK,
  // así que no tienen por qué ocupar sitio en el índice.
  it('son índices parciales', () => {
    expect(SQL_044).toContain('where imported_record_id is not null')
    expect(SQL_044).toContain('where import_row_id is not null')
  })

  // ── LA GARANTÍA DEL HOTFIX: cambia el MECANISMO, no los datos ──────────
  it('NO toca ni un dato, ni una tabla, ni una FK', () => {
    for (const prohibido of [
      'delete from', 'truncate', 'update public.', 'drop table', 'drop column',
      'alter column', 'add constraint', 'drop constraint', 'alter table',
    ]) {
      expect(SQL_044, prohibido).not.toContain(prohibido)
    }
  })

  // Subir el límite solo mueve el punto de ruptura: el coste es
  // O(precios × filas_de_importación) y las dos magnitudes crecen.
  it('NO sube el statement_timeout como atajo', () => {
    expect(SQL_044).not.toContain('statement_timeout')
    expect(SQL_044).not.toContain('alter role')
    expect(SQL_044).not.toContain('alter database')
  })

  it('deja las estadísticas al día para que el planificador use el índice', () => {
    expect(SQL_044).toContain('analyze public.market_import_rows')
    expect(SQL_044).toContain('analyze public.product_price_records')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// La auditoría no se toca: sigue habiendo copia íntegra de cada precio
// ═══════════════════════════════════════════════════════════════════════════

describe('la trazabilidad del borrado sigue intacta', () => {
  const SQL_035 = ejecutable(migracion('_035_market_price_deletion'))
  const SQL_036 = ejecutable(migracion('_036_'))

  it('cada precio borrado conserva su copia íntegra', () => {
    expect(SQL_035).toContain('original_data jsonb not null')
    expect(SQL_035).toContain('constraint mpdr_snapshot_object check (jsonb_typeof(original_data) = \'object\')')
  })

  // 036: si faltan copias, no se borra NADA. El hotfix no ha relajado esto.
  it('sigue sin borrarse nada si las copias están incompletas', () => {
    expect(SQL_036).toContain('copias de seguridad incompletas')
    expect(SQL_036).toContain('if v_copias <> v_batch.total_rows then')
  })

  it('el hotfix no elimina ninguna de esas comprobaciones', () => {
    expect(SQL_044).not.toContain('original_data')
    expect(SQL_044).not.toContain('apply_price_deletion')
    expect(SQL_044).not.toContain('market_price_deletion')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Qué se le enseña al administrador
// ═══════════════════════════════════════════════════════════════════════════

describe('mensajeDeConfirmacion', () => {
  // Esto es LITERALMENTE lo que el cliente vio en pantalla.
  it('el timeout deja de mostrar el texto crudo del motor', () => {
    const m = mensajeDeConfirmacion(SQLSTATE_TIMEOUT, 'canceling statement due to statement timeout')
    expect(m).not.toContain('canceling statement')
    expect(m).not.toContain('statement timeout')
  })

  // La RPC corre en UNA transacción: si se cancela, no queda nada a medias.
  // Decírselo evita que el administrador vaya a comprobar si borró la mitad.
  it('el mensaje de timeout dice que NO se ha borrado nada y qué hacer', () => {
    const m = mensajeDeConfirmacion(SQLSTATE_TIMEOUT, 'canceling statement due to statement timeout')
    expect(m).toContain('No se ha borrado ningún precio')
    expect(m).toContain('acota los filtros')
  })

  // Estos los levanta la RPC a propósito y están redactados para un
  // administrador: perderlos sería perder la explicación.
  it('los mensajes deliberados de la RPC pasan tal cual', () => {
    const propio = 'Copias de seguridad incompletas: el lote declara 682 precios y solo hay 680 copias.'
    expect(mensajeDeConfirmacion('23514', propio)).toBe(propio)
    expect(mensajeDeConfirmacion('42501', 'Solo un administrador de plataforma puede borrar precios.'))
      .toContain('administrador de plataforma')
    expect(mensajeDeConfirmacion('P0002', 'No se ha encontrado la operación.')).toContain('No se ha encontrado')
    expect(mensajeDeConfirmacion('22023', 'Esta operación ya no se puede confirmar (estado actual: completed).'))
      .toContain('ya no se puede confirmar')
  })

  it('son exactamente cuatro, y el timeout NO está entre ellos', () => {
    expect([...SQLSTATES_CON_MENSAJE_PROPIO].sort()).toEqual(['22023', '23514', '42501', 'P0002'])
    expect(SQLSTATES_CON_MENSAJE_PROPIO.has(SQLSTATE_TIMEOUT)).toBe(false)
  })

  // Cualquier otro código es del motor y no se le enseña a nadie.
  it('cualquier otro fallo cae en el mensaje genérico', () => {
    for (const code of ['57P01', '08006', '53300', 'XX000', '', undefined, null]) {
      expect(mensajeDeConfirmacion(code, 'deadlock detected on relation product_price_records'), String(code))
        .toBe(MENSAJE_GENERICO)
    }
  })

  it('el genérico no filtra nombres de tabla, de constraint ni SQLSTATE', () => {
    for (const filtrado of ['product_price_records', 'market_import_rows', 'constraint', 'relation', 'pg_']) {
      expect(MENSAJE_GENERICO.toLowerCase(), filtrado).not.toContain(filtrado)
    }
  })

  it('un código con mensaje propio pero SIN texto cae en el genérico', () => {
    expect(mensajeDeConfirmacion('23514', null)).toBe(MENSAJE_GENERICO)
    expect(mensajeDeConfirmacion('23514', '')).toBe(MENSAJE_GENERICO)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// La acción y la interfaz
// ═══════════════════════════════════════════════════════════════════════════

describe('la confirmación no puede devolver texto crudo del motor', () => {
  const ACCION = readFileSync(join(process.cwd(), 'src', 'lib', 'actions', 'price-deletions.ts'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')

  it('`applyDeletion` filtra el error por código, no lo reenvía', () => {
    const cuerpo = ACCION.slice(ACCION.indexOf('export async function applyDeletion'))
    expect(cuerpo).toContain('mensajeDeConfirmacion(error.code, error.message)')
    expect(cuerpo).not.toMatch(/error:\s*error\.message/)
  })

  it('el detalle técnico sigue registrándose en servidor', () => {
    const cuerpo = ACCION.slice(ACCION.indexOf('export async function applyDeletion'))
    expect(cuerpo).toContain('console.error')
  })

  // El helper es SÍNCRONO y `price-deletions.ts` es `'use server'`: en Next
  // todo export de un módulo así debe ser una función asíncrona, así que
  // tenerlo aquí rompería el build. Por eso vive en un módulo puro aparte.
  it('el helper NO se exporta desde el módulo `use server`', () => {
    expect(ACCION).toContain("'use server'")
    expect(ACCION).not.toMatch(/^export function mensajeDeConfirmacion/m)
    expect(ACCION).toContain("from '@/lib/prices/deletion-errors'")
  })
})

describe('la interfaz impide el doble borrado', () => {
  const WIZARD = readFileSync(
    join(process.cwd(), 'src', 'components', 'admin', 'prices', 'PriceDeletionWizard.tsx'),
    'utf8',
  )

  it('el botón se deshabilita mientras la operación está en curso', () => {
    expect(WIZARD).toContain('disabled={pending || !puedeConfirmar}')
  })

  it('y además la función sale antes si ya hay una en curso', () => {
    expect(WIZARD).toMatch(/if \(!batch \|\| pending \|\| batch\.status !== 'ready'\) return/)
  })

  it('se ve que está procesando, no parece que se haya quedado colgado', () => {
    expect(WIZARD).toContain('Eliminando…')
    expect(WIZARD).toContain('animate-spin')
  })

  // El cierre que de verdad cuenta está en la base: `for update` sobre el lote
  // y el estado `ready`, así que dos pestañas no pueden borrar dos veces.
  it('el cierre real es del servidor, y sigue ahí', () => {
    const SQL_036 = ejecutable(migracion('_036_'))
    expect(SQL_036).toContain('for update')
    expect(SQL_036).toContain("if v_batch.status <> 'ready' then")
  })
})

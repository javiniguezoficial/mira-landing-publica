// Validación de la actualización masiva (Fase 3.2).
//
// Aquí se fija lo que separa «se escribe» de «no se escribe». Cada caso feo de
// este fichero corresponde a una forma real de estropear el catálogo:
// identificar mal al proveedor, borrar sin querer, o dejar una taxonomía
// imposible.

import { describe, expect, it } from 'vitest'
import { CLEAR_TOKEN } from './types'
import type { ParsedUpdateRow } from './workbook'
import {
  collectSupplierIds,
  displayValue,
  parseBooleanCell,
  parseDecimal,
  planColumns,
  sameValue,
  validateTaxonomyChain,
  validateUpdateRow,
  validateUpdateRows,
  type ColumnPlan,
  type SupplierSnapshot,
  type TaxonomyCatalog,
} from './validation'

// ── Andamiaje ───────────────────────────────────────────────────────────────

const ID_A = '11111111-1111-1111-1111-111111111111'
const ID_B = '22222222-2222-2222-2222-222222222222'

const MERCADO = 'aaaaaaaa-0000-0000-0000-000000000001'
const MERCADO_2 = 'aaaaaaaa-0000-0000-0000-000000000002'
const CATEGORIA = 'bbbbbbbb-0000-0000-0000-000000000001'
const FAMILIA = 'cccccccc-0000-0000-0000-000000000001'
const SUBFAMILIA = 'dddddddd-0000-0000-0000-000000000001'

const TAXONOMIA: TaxonomyCatalog = {
  markets: new Set([MERCADO, MERCADO_2]),
  categories: new Map([[CATEGORIA, MERCADO]]),
  families: new Map([[FAMILIA, CATEGORIA]]),
  subfamilies: new Map([[SUBFAMILIA, FAMILIA]]),
}

function proveedor(over: Partial<SupplierSnapshot> = {}): SupplierSnapshot {
  return {
    id: ID_A,
    name: 'Agro Lleida SL',
    email: null,
    phone: null,
    website: null,
    tax_id: null,
    country: 'ES',
    region: 'Lleida',
    city: 'Balaguer',
    postal_code: null,
    address: null,
    latitude: 41.79,
    longitude: 0.81,
    produccion_value: null,
    produccion_unit: null,
    medida: null,
    notes: null,
    is_active: true,
    supplier_market_id: null,
    supplier_category_id: null,
    supplier_family_id: null,
    supplier_subfamily_id: null,
    ...over,
  }
}

/** Construye la fila leída a partir de un objeto legible, en orden de cabecera. */
function fila(headers: string[], valores: Record<string, string>, line = 2): ParsedUpdateRow {
  return {
    line,
    cells: headers.map((h) => ({ text: valores[h] ?? '', formula: false, error: false })),
  }
}

interface Escenario {
  headers: string[]
  plan: ColumnPlan
  suppliers: Map<string, SupplierSnapshot>
}

function escenario(headers: string[], snapshots: SupplierSnapshot[] = [proveedor()]): Escenario {
  return {
    headers,
    plan: planColumns(headers),
    suppliers: new Map(snapshots.map((s) => [s.id, s])),
  }
}

function contexto(e: Escenario) {
  return { plan: e.plan, suppliers: e.suppliers, taxonomy: TAXONOMIA }
}

function validar(e: Escenario, valores: Record<string, string>, line = 2) {
  return validateUpdateRow(fila(e.headers, valores, line), contexto(e))
}

/** Valida varias filas de golpe, que es como se procesa un fichero real. */
function validarFichero(e: Escenario, filas: Record<string, string>[]) {
  return validateUpdateRows(
    filas.map((v, i) => fila(e.headers, v, i + 2)),
    contexto(e),
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Plan de columnas
// ═══════════════════════════════════════════════════════════════════════════

describe('plan de columnas', () => {
  it('reparte cada cabecera en su papel', () => {
    const plan = planColumns([
      'ID interno', 'Nombre', 'Clasificación', 'Comentarios', 'Correo',
    ])
    expect(plan.idIndex).toBe(0)
    expect(plan.fields.map((f) => f.field)).toEqual(['name', 'email'])
    expect(plan.ignored).toEqual(['Clasificación'])
    expect(plan.unknown).toEqual(['Comentarios'])
    expect(plan.ambiguous).toEqual([])
  })

  it('el orden de las columnas no importa', () => {
    const plan = planColumns(['Correo', 'Nombre', 'ID interno'])
    expect(plan.idIndex).toBe(2)
    expect(plan.fields.map((f) => f.index)).toEqual([0, 1])
  })

  // Dos columnas para el mismo campo significa que hay dos valores candidatos
  // y ninguna forma honesta de elegir.
  it('denuncia columnas repetidas en lugar de quedarse con una', () => {
    const plan = planColumns(['ID interno', 'Correo', 'email'])
    expect(plan.ambiguous).toEqual(['email'])
  })

  it('detecta la falta del identificador', () => {
    expect(planColumns(['Nombre', 'Correo']).idIndex).toBeNull()
  })

  it('reúne los UUID candidatos sin repetir, para una sola consulta', () => {
    const plan = planColumns(['ID interno', 'Nombre'])
    const filas = [
      fila(['ID interno', 'Nombre'], { 'ID interno': ID_A }, 2),
      fila(['ID interno', 'Nombre'], { 'ID interno': ID_A.toUpperCase() }, 3),
      fila(['ID interno', 'Nombre'], { 'ID interno': 'no-es-un-uuid' }, 4),
      fila(['ID interno', 'Nombre'], { 'ID interno': ID_B }, 5),
    ]
    expect(collectSupplierIds(filas, plan).sort()).toEqual([ID_A, ID_B].sort())
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Identificación
// ═══════════════════════════════════════════════════════════════════════════

describe('identificación del proveedor', () => {
  const e = () => escenario(['ID interno', 'Correo'])

  it('sin ID la fila es inválida y lo dice claro', () => {
    const r = validar(e(), { Correo: 'a@b.com' })
    expect(r.status).toBe('invalid')
    expect(r.errors[0].column).toBe('ID interno')
    expect(r.errors[0].message).toContain('obligatorio')
  })

  it('un ID que no es UUID es inválido', () => {
    const r = validar(e(), { 'ID interno': 'AGRO-001', Correo: 'a@b.com' })
    expect(r.status).toBe('invalid')
    expect(r.supplierId).toBeNull()
  })

  // Es el caso que impide convertir esto en un importador encubierto.
  it('un UUID que no existe NO crea nada: queda inválido', () => {
    const r = validar(e(), { 'ID interno': ID_B, Correo: 'a@b.com' })
    expect(r.status).toBe('invalid')
    expect(r.changes).toEqual({})
    expect(r.errors[0].message).toContain('No se crea ninguno nuevo')
  })

  // `supplier_update_rows.supplier_id` tiene clave foránea contra `suppliers`:
  // guardar ahí un UUID inexistente haría fallar el INSERT y con él el batch
  // entero. El identificador se conserva en `raw_data` para el informe.
  it('un UUID inexistente no se guarda como referencia, pero no se pierde', () => {
    const r = validar(e(), { 'ID interno': ID_B, Correo: 'a@b.com' })
    expect(r.supplierId).toBeNull()
    expect(r.raw['ID interno']).toBe(ID_B)
  })

  it('dos filas con el mismo ID inexistente se ven igualmente repetidas', () => {
    const filas = validarFichero(e(), [
      { 'ID interno': ID_B, Correo: 'a@b.com' },
      { 'ID interno': ID_B, Correo: 'c@d.com' },
    ])
    expect(filas.map((f) => f.status)).toEqual(['duplicate_id', 'duplicate_id'])
  })

  // Aplicar la primera y descartar la segunda es tan arbitrario como al revés:
  // nadie sabe cuál quería la persona, y el proveedor acabaría en un estado que
  // no pidió. Se bloquean LAS DOS y que lo resuelva en el fichero.
  it('el mismo ID dos veces bloquea TODAS sus filas, incluida la primera', () => {
    const filas = validarFichero(e(), [
      { 'ID interno': ID_A, Correo: 'a@b.com' },
      { 'ID interno': ID_A, Correo: 'c@d.com' },
    ])

    expect(filas.map((f) => f.status)).toEqual(['duplicate_id', 'duplicate_id'])
    expect(filas.every((f) => Object.keys(f.changes).length === 0)).toBe(true)
    expect(filas.every((f) => f.updatedFields.length === 0)).toBe(true)
  })

  it('una fila repetida no arrastra a las demás del fichero', () => {
    const esc = escenario(['ID interno', 'Correo'], [proveedor(), proveedor({ id: ID_B, name: 'Otro' })])
    const filas = validarFichero(esc, [
      { 'ID interno': ID_A, Correo: 'a@b.com' },
      { 'ID interno': ID_B, Correo: 'b@b.com' },
      { 'ID interno': ID_A, Correo: 'c@d.com' },
    ])
    expect(filas.map((f) => f.status)).toEqual(['duplicate_id', 'valid', 'duplicate_id'])
  })

  it('el ID repetido se detecta aunque venga escrito con otra caja', () => {
    const filas = validarFichero(e(), [
      { 'ID interno': ID_A, Correo: 'a@b.com' },
      { 'ID interno': ID_A.toUpperCase(), Correo: 'c@d.com' },
    ])
    expect(filas.map((f) => f.status)).toEqual(['duplicate_id', 'duplicate_id'])
  })

  it('el UUID se compara sin distinguir mayúsculas', () => {
    const r = validar(e(), { 'ID interno': ID_A.toUpperCase(), Correo: 'a@b.com' })
    expect(r.status).toBe('valid')
    expect(r.supplierId).toBe(ID_A)
  })

  it('nunca se usa el nombre como respaldo del ID', () => {
    const esc = escenario(['ID interno', 'Nombre'])
    const r = validar(esc, { 'ID interno': '', Nombre: 'Agro Lleida SL' })
    expect(r.status).toBe('invalid')
    expect(r.supplierId).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Celda vacía y `__CLEAR__`
// ═══════════════════════════════════════════════════════════════════════════

describe('celda vacía y borrado explícito', () => {
  // Es LA regla del bloque: abrir la exportación, cambiar un teléfono y volver
  // a subirla no puede vaciar el resto de columnas.
  it('una celda vacía no toca el campo', () => {
    const esc = escenario(['ID interno', 'Correo', 'Provincia'], [proveedor({ email: 'viejo@x.com' })])
    const r = validar(esc, { 'ID interno': ID_A, Correo: '', Provincia: '' })
    expect(r.status).toBe('unchanged')
    expect(r.changes).toEqual({})
  })

  it(`${CLEAR_TOKEN} vacía el campo y se ve como tal`, () => {
    const esc = escenario(['ID interno', 'Correo'], [proveedor({ email: 'viejo@x.com' })])
    const r = validar(esc, { 'ID interno': ID_A, Correo: CLEAR_TOKEN })
    expect(r.status).toBe('valid')
    expect(r.changes.email).toBeNull()
    expect(r.currentValues.email).toBe('viejo@x.com')
  })

  it('no se puede vaciar un campo obligatorio', () => {
    const esc = escenario(['ID interno', 'Nombre', 'País', 'Activo'])
    const r = validar(esc, {
      'ID interno': ID_A, Nombre: CLEAR_TOKEN, País: CLEAR_TOKEN, Activo: CLEAR_TOKEN,
    })
    expect(r.status).toBe('invalid')
    expect(r.errors).toHaveLength(3)
    expect(r.errors.every((x) => x.message.includes('no se puede vaciar'))).toBe(true)
  })

  it('vaciar lo que ya está vacío no es un cambio', () => {
    const esc = escenario(['ID interno', 'Correo'], [proveedor({ email: null })])
    const r = validar(esc, { 'ID interno': ID_A, Correo: CLEAR_TOKEN })
    expect(r.status).toBe('unchanged')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Tipos
// ═══════════════════════════════════════════════════════════════════════════

describe('números', () => {
  it('acepta punto o coma decimal', () => {
    expect(parseDecimal('41.79')).toBe(41.79)
    expect(parseDecimal('41,79')).toBe(41.79)
    expect(parseDecimal('-3')).toBe(-3)
  })

  // «1.482,5» es mil cuatrocientos ochenta y dos en España y uno coma cuatro en
  // medio mundo. Adivinar aquí multiplica por mil una producción.
  it('rechaza el número ambiguo con los dos separadores', () => {
    expect(parseDecimal('1.482,5')).toBeNull()
  })

  it('rechaza lo que no es un número', () => {
    expect(parseDecimal('41.79 N')).toBeNull()
    expect(parseDecimal('cuarenta')).toBeNull()
  })

  it('las coordenadas se validan por rango y no se intercambian', () => {
    const esc = escenario(['ID interno', 'Latitud', 'Longitud'])

    const fuera = validar(esc, { 'ID interno': ID_A, Latitud: '120', Longitud: '0' })
    expect(fuera.status).toBe('invalid')
    expect(fuera.errors[0].message).toContain('-90 y 90')

    const esc2 = escenario(['ID interno', 'Latitud', 'Longitud'])
    const bien = validar(esc2, { 'ID interno': ID_A, Latitud: '40', Longitud: '-120' })
    expect(bien.status).toBe('valid')
    expect(bien.changes.latitude).toBe(40)
    expect(bien.changes.longitude).toBe(-120)
  })

  it('la producción no puede ser negativa', () => {
    const esc = escenario(['ID interno', 'Producción'])
    expect(validar(esc, { 'ID interno': ID_A, 'Producción': '-5' }).status).toBe('invalid')
  })
})

describe('booleanos', () => {
  it('acepta lo que escribe la exportación y sus variantes', () => {
    for (const v of ['Sí', 'si', 'SI', 'true', '1', 'Activo']) expect(parseBooleanCell(v)).toBe(true)
    for (const v of ['No', 'no', 'false', '0', 'Inactivo']) expect(parseBooleanCell(v)).toBe(false)
  })

  // Nada de «lo que no reconozco es activo»: el importador antiguo hacía eso y
  // convierte una errata en un cambio de estado silencioso.
  it('un valor desconocido NO se interpreta: es un error', () => {
    expect(parseBooleanCell('quizá')).toBeNull()
    const esc = escenario(['ID interno', 'Activo'])
    const r = validar(esc, { 'ID interno': ID_A, Activo: 'quizá' })
    expect(r.status).toBe('invalid')
    expect(r.errors[0].message).toContain('«Sí» o «No»')
  })

  it('desactivar un proveedor activo es un cambio real', () => {
    const esc = escenario(['ID interno', 'Activo'], [proveedor({ is_active: true })])
    const r = validar(esc, { 'ID interno': ID_A, Activo: 'No' })
    expect(r.status).toBe('valid')
    expect(r.changes.is_active).toBe(false)
    expect(r.currentValues.is_active).toBe(true)
  })
})

describe('texto', () => {
  it('valida el correo y la web con las mismas reglas que el formulario', () => {
    const esc = escenario(['ID interno', 'Correo', 'Web'])
    const r = validar(esc, { 'ID interno': ID_A, Correo: 'sin-arroba', Web: 'proveedor.com' })
    expect(r.status).toBe('invalid')
    expect(r.errors).toHaveLength(2)
  })

  it('la unidad de producción se limita a las del formulario', () => {
    const esc = escenario(['ID interno', 'Unidad producción'])
    const bien = validar(esc, { 'ID interno': ID_A, 'Unidad producción': 'tn' })
    expect(bien.status).toBe('valid')
    expect(bien.changes.produccion_unit).toBe('TN')

    const esc2 = escenario(['ID interno', 'Unidad producción'])
    expect(validar(esc2, { 'ID interno': ID_A, 'Unidad producción': 'sacos' }).status).toBe('invalid')
  })

  it('un texto desmesurado se rechaza en lugar de guardarse', () => {
    const esc = escenario(['ID interno', 'Dirección'])
    const r = validar(esc, { 'ID interno': ID_A, 'Dirección': 'x'.repeat(2_001) })
    expect(r.status).toBe('invalid')
  })

  it('el nombre no puede quedar en blanco', () => {
    const esc = escenario(['ID interno', 'Nombre'])
    // Una celda con solo espacios llega como cadena vacía tras el recorte del
    // parser, pero un espacio duro no: se comprueba igualmente.
    const r = validateUpdateRow(
      { line: 2, cells: [{ text: ID_A, formula: false, error: false }, { text: '   ', formula: false, error: false }] },
      contexto(esc),
    )
    expect(r.status).toBe('unchanged')
  })
})

describe('celdas peligrosas', () => {
  it('una fórmula invalida la fila en lugar de leer su valor cacheado', () => {
    const esc = escenario(['ID interno', 'Nombre'])
    const r = validateUpdateRow(
      {
        line: 2,
        cells: [
          { text: ID_A, formula: false, error: false },
          { text: 'Lo que sea', formula: true, error: false },
        ],
      },
      contexto(esc),
    )
    expect(r.status).toBe('invalid')
    expect(r.errors[0].message).toContain('fórmula')
  })

  it('una celda con error de Excel invalida la fila', () => {
    const esc = escenario(['ID interno', 'Nombre'])
    const r = validateUpdateRow(
      {
        line: 2,
        cells: [
          { text: ID_A, formula: false, error: false },
          { text: '', formula: false, error: true },
        ],
      },
      contexto(esc),
    )
    expect(r.status).toBe('invalid')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Taxonomía
// ═══════════════════════════════════════════════════════════════════════════

describe('cadena de taxonomía', () => {
  it('acepta la cadena completa y coherente', () => {
    expect(validateTaxonomyChain(
      { market: MERCADO, category: CATEGORIA, family: FAMILIA, subfamily: SUBFAMILIA },
      TAXONOMIA,
    )).toEqual([])
  })

  it('rechaza un identificador que no existe', () => {
    const errores = validateTaxonomyChain(
      { market: '99999999-9999-9999-9999-999999999999', category: null, family: null, subfamily: null },
      TAXONOMIA,
    )
    expect(errores).toHaveLength(1)
    expect(errores[0].message).toContain('no existe')
  })

  it('rechaza una categoría que cuelga de otro mercado', () => {
    const errores = validateTaxonomyChain(
      { market: MERCADO_2, category: CATEGORIA, family: null, subfamily: null },
      TAXONOMIA,
    )
    expect(errores[0].column).toBe('Categoría ID')
    expect(errores[0].message).toContain('no pertenece al mercado')
  })

  // Es la diferencia clave con el formulario individual: allí los desplegables
  // se vacían solos y quien lo hace lo ve. Aquí nadie ve nada hasta la vista
  // previa, así que un borrado que nadie pidió sería indistinguible de un fallo.
  it('no limpia los niveles inferiores: exige que se pidan explícitamente', () => {
    const errores = validateTaxonomyChain(
      { market: null, category: CATEGORIA, family: null, subfamily: null },
      TAXONOMIA,
    )
    expect(errores).toHaveLength(1)
    expect(errores[0].message).toContain(CLEAR_TOKEN)
  })

  it('valida sobre el estado FINAL, no solo sobre lo que trae el fichero', () => {
    // El proveedor ya tiene mercado y categoría; el fichero solo cambia la
    // familia, y esa familia no cuelga de su categoría.
    const esc = escenario(
      ['ID interno', 'Familia ID'],
      [proveedor({ supplier_market_id: MERCADO_2, supplier_category_id: null })],
    )
    const r = validar(esc, { 'ID interno': ID_A, 'Familia ID': FAMILIA })
    expect(r.status).toBe('invalid')
  })

  it('vaciar la cadena entera con __CLEAR__ es válido', () => {
    const esc = escenario(
      ['ID interno', 'Mercado ID', 'Categoría ID', 'Familia ID', 'Subfamilia ID'],
      [proveedor({
        supplier_market_id: MERCADO,
        supplier_category_id: CATEGORIA,
        supplier_family_id: FAMILIA,
        supplier_subfamily_id: SUBFAMILIA,
      })],
    )
    const r = validar(esc, {
      'ID interno': ID_A,
      'Mercado ID': CLEAR_TOKEN,
      'Categoría ID': CLEAR_TOKEN,
      'Familia ID': CLEAR_TOKEN,
      'Subfamilia ID': CLEAR_TOKEN,
    })
    expect(r.status).toBe('valid')
    expect(r.updatedFields.sort()).toEqual([
      'supplier_category_id', 'supplier_family_id', 'supplier_market_id', 'supplier_subfamily_id',
    ])
  })

  it('no crea taxonomía: un id inventado es un error, no un alta', () => {
    const esc = escenario(['ID interno', 'Mercado ID'])
    const r = validar(esc, { 'ID interno': ID_A, 'Mercado ID': '99999999-9999-9999-9999-999999999999' })
    expect(r.status).toBe('invalid')
    expect(r.changes).toEqual({})
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Comparación e idempotencia
// ═══════════════════════════════════════════════════════════════════════════

describe('detección de cambios', () => {
  it('compara números por valor, no por texto', () => {
    expect(sameValue(41.79, 41.79)).toBe(true)
    expect(sameValue(41.79, '41.79')).toBe(true)
    expect(sameValue(41.79, 41.8)).toBe(false)
  })

  it('null y valor no son lo mismo en ninguna dirección', () => {
    expect(sameValue(null, null)).toBe(true)
    expect(sameValue(null, 'algo')).toBe(false)
    expect(sameValue('algo', null)).toBe(false)
  })

  // Es lo que hace idempotente el bloque: subir dos veces el mismo fichero deja
  // todo en «sin cambios» la segunda vez.
  it('un fichero que repite lo ya guardado no cambia nada', () => {
    const actual = proveedor({ email: 'a@b.com', city: 'Balaguer', is_active: true })
    const esc = escenario(['ID interno', 'Correo', 'Localidad', 'Activo'], [actual])
    const r = validar(esc, {
      'ID interno': ID_A, Correo: 'a@b.com', Localidad: 'Balaguer', Activo: 'Sí',
    })
    expect(r.status).toBe('unchanged')
    expect(r.updatedFields).toEqual([])
  })

  it('guarda el valor anterior y el nuevo de cada campo tocado', () => {
    const esc = escenario(['ID interno', 'Correo', 'Localidad'], [proveedor({ email: null, city: 'Balaguer' })])
    const r = validar(esc, { 'ID interno': ID_A, Correo: 'nuevo@x.com', Localidad: 'Lleida' })

    expect(r.status).toBe('valid')
    expect(r.currentValues).toEqual({ email: null, city: 'Balaguer' })
    expect(r.changes).toEqual({ email: 'nuevo@x.com', city: 'Lleida' })
    expect(r.updatedFields).toEqual(['email', 'city'])
  })

  // Una fila con un error no aplica NADA, ni siquiera sus campos correctos.
  it('un error en un campo bloquea la fila entera', () => {
    const esc = escenario(['ID interno', 'Correo', 'Localidad'])
    const r = validar(esc, { 'ID interno': ID_A, Correo: 'malo', Localidad: 'Lleida' })
    expect(r.status).toBe('invalid')
    expect(r.changes).toEqual({})
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Columnas bloqueadas
// ═══════════════════════════════════════════════════════════════════════════

describe('columnas que no se escriben', () => {
  it('las derivadas y de auditoría se ignoran aunque traigan valores', () => {
    const headers = ['ID interno', 'Nombre', 'Clasificación', 'Fecha de alta', 'Última actualización']
    const esc = escenario(headers)
    const r = validar(esc, {
      'ID interno': ID_A,
      Nombre: 'Agro Lleida SL',
      'Clasificación': 'Inventado › Falso',
      'Fecha de alta': '1999-01-01',
      'Última actualización': '1999-01-01',
    })
    expect(r.status).toBe('unchanged')
    expect(r.changes).toEqual({})
    expect(esc.plan.ignored).toEqual(['Clasificación', 'Fecha de alta', 'Última actualización'])
  })

  it('una columna desconocida no llega a `raw_data`', () => {
    const esc = escenario(['ID interno', 'Nombre', 'Comentarios'])
    const r = validar(esc, { 'ID interno': ID_A, Nombre: 'Otro', Comentarios: 'lo que sea' })
    expect(Object.keys(r.raw).sort()).toEqual(['ID interno', 'Nombre'])
  })

  // `raw_data` acaba en una columna `jsonb`. Si sus claves salieran del
  // fichero, un `__proto__` como cabecera viajaría hasta la base.
  it('las claves de `raw_data` salen de la allowlist, nunca del fichero', () => {
    const esc = escenario(['ID interno', 'Nombre', '__proto__', 'constructor'])
    const r = validar(esc, { 'ID interno': ID_A, Nombre: 'Otro' })
    expect(Object.keys(r.raw)).not.toContain('__proto__')
    expect(Object.keys(r.raw)).not.toContain('constructor')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Presentación
// ═══════════════════════════════════════════════════════════════════════════

describe('cómo se enseña un valor', () => {
  it('distingue vaciar de no tocar', () => {
    expect(displayValue(null)).toBe('(vacío)')
    expect(displayValue(undefined)).toBe('')
  })

  it('el booleano se lee como en la exportación', () => {
    expect(displayValue(true)).toBe('Sí')
    expect(displayValue(false)).toBe('No')
  })
})

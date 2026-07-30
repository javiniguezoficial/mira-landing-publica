// El XLSX generado, leído de vuelta (Fase 3.4).
//
// Este es el test que sustituye a «abrir el fichero y mirarlo»: se construye el
// libro con el mismo código que sirve la descarga y se vuelve a leer con la
// misma librería, comprobando cabeceras, tipos de celda y contenido.

import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import type { Supplier } from '@/lib/actions/suppliers'
import { buildSuppliersWorkbook, exportColumnsFor } from './export'

function proveedor(over: Partial<Supplier> = {}): Supplier {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Agro Lleida SL',
    email: 'info@ejemplo.test',
    phone: '34600123456',
    website: null,
    tax_id: '12345678Z',
    country: 'España',
    region: 'Lleida',
    city: 'Balaguer',
    postal_code: '25600',
    address: null,
    latitude: 41.79,
    longitude: 0.81,
    category: null,
    market_id: null,
    family: null,
    subfamily: null,
    produccion: null,
    produccion_value: 57276,
    produccion_unit: 'TN',
    medida: null,
    notes: 'Nota interna',
    is_active: true,
    created_at: '2026-07-05T11:02:43.146Z',
    updated_at: '2026-07-23T10:47:43.794Z',
    ...over,
  }
}

/**
 * Abre el buffer como lo haría Excel y devuelve la hoja.
 *
 * `cellStyles: true` es necesario para que SheetJS devuelva los anchos de
 * columna al releer: sin esa opción los escribe en el fichero pero no los
 * expone al parsearlo.
 */
function leerHoja(buffer: Buffer) {
  const book = XLSX.read(buffer, { type: 'buffer', cellStyles: true })
  return { book, sheet: book.Sheets[book.SheetNames[0]] }
}

describe('estructura del libro', () => {
  const { book, sheet } = leerHoja(buildSuppliersWorkbook([proveedor()], 'admin'))

  it('tiene una hoja con nombre claro', () => {
    expect(book.SheetNames).toEqual(['Proveedores'])
  })

  it('las cabeceras son legibles, no nombres de columna de la base', () => {
    const filas = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 })
    const cabeceras = filas[0]
    expect(cabeceras).toContain('Nombre')
    expect(cabeceras).toContain('NIF/CIF')
    expect(cabeceras).toContain('Provincia')
    expect(cabeceras).toContain('Localidad')
    // Nada de `tax_id` ni `produccion_value` en crudo.
    expect(cabeceras).not.toContain('tax_id')
    expect(cabeceras).not.toContain('produccion_value')
  })

  it('lleva anchos de columna', () => {
    expect(sheet['!cols']).toBeDefined()
    expect(sheet['!cols']!.length).toBe(exportColumnsFor('admin').length)
  })

  it('lleva autofiltro sobre la cabecera', () => {
    expect(sheet['!autofilter']).toBeDefined()
  })
})

describe('tipos de celda al releer', () => {
  const { sheet } = leerHoja(buildSuppliersWorkbook([proveedor()], 'admin'))
  const columnas = exportColumnsFor('admin')

  /** Celda de la primera fila de datos para una columna. */
  function celda(key: string) {
    const c = columnas.findIndex((col) => col.key === key)
    return sheet[XLSX.utils.encode_cell({ r: 1, c })]
  }

  // Sin esto Excel mostraría 12345678 sin la letra, o el teléfono en notación
  // científica.
  it('el NIF llega como texto', () => {
    expect(celda('tax_id').t).toBe('s')
    expect(celda('tax_id').v).toBe('12345678Z')
  })

  it('el teléfono llega como texto, no como número', () => {
    expect(celda('phone').t).toBe('s')
    expect(celda('phone').v).toBe('34600123456')
  })

  it('el código postal conserva el formato', () => {
    expect(celda('postal_code').t).toBe('s')
    expect(celda('postal_code').v).toBe('25600')
  })

  it('las coordenadas y la producción sí son números', () => {
    expect(celda('latitude').t).toBe('n')
    expect(celda('latitude').v).toBe(41.79)
    expect(celda('produccion').t).toBe('n')
    expect(celda('produccion').v).toBe(57276)
  })

  it('las fechas salen en formato consistente', () => {
    expect(String(celda('created_at').v)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(String(celda('updated_at').v)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

describe('fórmulas neutralizadas en el fichero final', () => {
  it('un nombre que empieza por «=» no llega como fórmula', () => {
    const { sheet } = leerHoja(
      buildSuppliersWorkbook([proveedor({ name: '=1+1' })], 'client'),
    )
    const c = exportColumnsFor('client').findIndex((col) => col.key === 'name')
    const celda = sheet[XLSX.utils.encode_cell({ r: 1, c })]

    expect(celda.t).toBe('s')
    expect(String(celda.v).startsWith("'")).toBe(true)
    // `f` es la propiedad de fórmula de SheetJS: no debe existir.
    expect(celda.f).toBeUndefined()
  })
})

// ── Lo que cada audiencia se lleva ──────────────────────────────────────────

describe('el cliente no exporta datos administrativos', () => {
  const { sheet } = leerHoja(buildSuppliersWorkbook([proveedor()], 'client'))
  const filas = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 })
  const cabeceras = filas[0]
  const contenido = JSON.stringify(filas)

  it('no aparecen las notas internas', () => {
    expect(cabeceras).not.toContain('Notas internas')
    expect(contenido).not.toContain('Nota interna')
  })

  it('no aparece el identificador interno', () => {
    expect(cabeceras).not.toContain('ID interno')
    expect(contenido).not.toContain('11111111-1111-1111-1111-111111111111')
  })

  it('no aparecen el estado ni las fechas de gestión', () => {
    expect(cabeceras).not.toContain('Activo')
    expect(cabeceras).not.toContain('Fecha de alta')
  })

  it('sí aparece lo que ya ve en pantalla', () => {
    expect(cabeceras).toContain('Nombre')
    expect(cabeceras).toContain('Localidad')
    expect(contenido).toContain('Agro Lleida SL')
  })
})

describe('administración exporta lo suyo', () => {
  const { sheet } = leerHoja(buildSuppliersWorkbook([proveedor()], 'admin'))
  const contenido = JSON.stringify(XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 }))

  it('incluye notas internas e identificador', () => {
    expect(contenido).toContain('Nota interna')
    expect(contenido).toContain('11111111-1111-1111-1111-111111111111')
  })
})

describe('volumen', () => {
  it('varias filas se escriben todas', () => {
    const muchos = Array.from({ length: 250 }, (_, i) =>
      proveedor({ id: `id-${i}`, name: `Proveedor ${i}` }),
    )
    const { sheet } = leerHoja(buildSuppliersWorkbook(muchos, 'client'))
    const filas = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 })
    expect(filas).toHaveLength(251) // cabecera + 250
  })

  it('sin proveedores sigue generando un libro válido con cabeceras', () => {
    const { book, sheet } = leerHoja(buildSuppliersWorkbook([], 'client'))
    expect(book.SheetNames).toEqual(['Proveedores'])
    const filas = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 })
    expect(filas[0]).toContain('Nombre')
  })
})

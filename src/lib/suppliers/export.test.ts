// Exportación de proveedores a XLSX (Fase 3.4).
//
// Lo que se fija aquí es lo que Excel puede estropear o ejecutar: fórmulas,
// NIF y teléfonos convertidos a número, y qué columnas ve cada audiencia.

import { describe, expect, it } from 'vitest'
import type { Supplier } from '@/lib/actions/suppliers'
import {
  buildExportRows,
  exportColumnsFor,
  formatExportDate,
  isFormulaLike,
  neutralizeFormula,
  toCell,
} from './export'

function proveedor(over: Partial<Supplier> = {}): Supplier {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    name: 'Agro Lleida SL',
    email: null,
    phone: null,
    website: null,
    tax_id: null,
    country: 'España',
    region: 'Lleida',
    city: 'Balaguer',
    postal_code: null,
    address: null,
    latitude: 41.79,
    longitude: 0.81,
    category: null,
    market_id: null,
    family: null,
    subfamily: null,
    produccion: null,
    produccion_value: null,
    produccion_unit: null,
    medida: null,
    notes: null,
    is_active: true,
    created_at: '2026-07-05T11:02:43.146Z',
    updated_at: '2026-07-23T10:47:43.794Z',
    ...over,
  }
}

// ── Columnas por audiencia ──────────────────────────────────────────────────

describe('columnas según quién exporta', () => {
  const admin = exportColumnsFor('admin').map((c) => c.key)
  const cliente = exportColumnsFor('client').map((c) => c.key)

  it('las dos incluyen los datos de contacto y ubicación', () => {
    for (const k of ['name', 'country', 'region', 'city', 'tax_id', 'email', 'phone']) {
      expect(admin).toContain(k)
      expect(cliente).toContain(k)
    }
  })

  // Lo que el cliente no ve en pantalla tampoco puede llevárselo en una hoja.
  it('el cliente NO recibe notas internas, estado ni identificadores técnicos', () => {
    expect(cliente).not.toContain('notes')
    expect(cliente).not.toContain('is_active')
    expect(cliente).not.toContain('id')
    expect(cliente).not.toContain('created_at')
    expect(cliente).not.toContain('updated_at')
  })

  it('administración sí los recibe', () => {
    for (const k of ['id', 'notes', 'is_active', 'created_at', 'updated_at']) {
      expect(admin).toContain(k)
    }
  })

  it('toda columna tiene cabecera legible y ancho', () => {
    for (const c of exportColumnsFor('admin')) {
      expect(c.header.length).toBeGreaterThan(2)
      expect(c.width).toBeGreaterThan(5)
    }
  })
})

// ── Inyección de fórmulas ───────────────────────────────────────────────────

describe('fórmulas', () => {
  it('reconoce los caracteres peligrosos', () => {
    for (const c of ['=', '+', '-', '@']) {
      expect(isFormulaLike(`${c}cmd|'/c calc'!A1`)).toBe(true)
    }
    expect(isFormulaLike('Agro Lleida')).toBe(false)
    expect(isFormulaLike('')).toBe(false)
  })

  it('las neutraliza con un apóstrofo', () => {
    expect(neutralizeFormula('=1+1')).toBe("'=1+1")
    expect(neutralizeFormula('@SUM(A1)')).toBe("'@SUM(A1)")
    expect(neutralizeFormula('Agro')).toBe('Agro')
  })

  // El dato viene de nuestra base, pero llegó ahí desde un fichero externo.
  it('un nombre de proveedor que parezca fórmula sale neutralizado', () => {
    const columnas = exportColumnsFor('client')
    const { rows } = buildExportRows([proveedor({ name: '=HYPERLINK("http://x","a")' })], columnas)
    const celdaNombre = rows[0][columnas.findIndex((c) => c.key === 'name')]
    expect(String(celdaNombre.v).startsWith("'")).toBe(true)
    expect(celdaNombre.t).toBe('s')
  })
})

// ── Tipos de celda ──────────────────────────────────────────────────────────

describe('NIF, teléfonos y códigos se conservan como texto', () => {
  const columnas = exportColumnsFor('admin')
  const col = (key: string) => columnas.find((c) => c.key === key)!

  it('un NIF numérico no se convierte en número', () => {
    const celda = toCell(col('tax_id'), proveedor({ tax_id: '12345678Z' }))
    expect(celda.t).toBe('s')
    expect(celda.v).toBe('12345678Z')
  })

  // Sin esto, Excel mostraría 1,23457E+11 y el teléfono quedaría ilegible.
  it('un teléfono largo no acaba en notación científica', () => {
    const celda = toCell(col('phone'), proveedor({ phone: '34600123456' }))
    expect(celda.t).toBe('s')
    expect(celda.v).toBe('34600123456')
  })

  it('un código postal conserva el cero inicial', () => {
    const celda = toCell(col('postal_code'), proveedor({ postal_code: '08001' }))
    expect(celda.t).toBe('s')
    expect(celda.v).toBe('08001')
  })

  it('las coordenadas y la producción sí son números', () => {
    expect(toCell(col('latitude'), proveedor()).t).toBe('n')
    expect(toCell(col('produccion'), proveedor({ produccion_value: 57276 })).v).toBe(57276)
  })

  it('un valor ausente sale como celda vacía, no como «null»', () => {
    const celda = toCell(col('email'), proveedor({ email: null }))
    expect(celda.v).toBe('')
    expect(celda.t).toBe('s')
  })
})

describe('fechas', () => {
  it('formato estable AAAA-MM-DD', () => {
    expect(formatExportDate('2026-07-05T11:02:43.146Z')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('una fecha ausente o inválida sale vacía, no como «Invalid Date»', () => {
    expect(formatExportDate(null)).toBe('')
    expect(formatExportDate('no es fecha')).toBe('')
  })

  it('las dos columnas de fecha usan el mismo formato', () => {
    const columnas = exportColumnsFor('admin')
    const alta = toCell(columnas.find((c) => c.key === 'created_at')!, proveedor())
    const act = toCell(columnas.find((c) => c.key === 'updated_at')!, proveedor())
    expect(String(alta.v)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(String(act.v)).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})

// ── Filas ───────────────────────────────────────────────────────────────────

describe('buildExportRows', () => {
  it('cabeceras y filas cuadran en número de columnas', () => {
    const columnas = exportColumnsFor('admin')
    const { headers, rows } = buildExportRows([proveedor(), proveedor()], columnas)
    expect(headers).toHaveLength(columnas.length)
    expect(rows).toHaveLength(2)
    for (const fila of rows) expect(fila).toHaveLength(columnas.length)
  })

  it('la clasificación se compone de la taxonomía', () => {
    const columnas = exportColumnsFor('client')
    const { rows } = buildExportRows(
      [
        proveedor({
          supplier_market: { id: 'm', name: 'Cárnicos' },
          supplier_category: { id: 'c', name: 'Porcino' },
        }),
      ],
      columnas,
    )
    const celda = rows[0][columnas.findIndex((c) => c.key === 'taxonomy')]
    expect(celda.v).toBe('Cárnicos › Porcino')
  })

  it('sin proveedores devuelve cabeceras y ninguna fila', () => {
    const { headers, rows } = buildExportRows([], exportColumnsFor('client'))
    expect(headers.length).toBeGreaterThan(0)
    expect(rows).toEqual([])
  })

  it('el estado activo se exporta legible, no como true/false', () => {
    const columnas = exportColumnsFor('admin')
    const { rows } = buildExportRows([proveedor({ is_active: false })], columnas)
    expect(rows[0][columnas.findIndex((c) => c.key === 'is_active')].v).toBe('No')
  })
})

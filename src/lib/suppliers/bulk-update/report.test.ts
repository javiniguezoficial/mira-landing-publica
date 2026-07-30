// Plantilla e informe de la actualización masiva (Fase 3.2).
//
// El informe repite contenido que VINO de un fichero de terceros. Lo que se
// fija aquí es que no se ejecute al abrirlo y que los identificadores no se
// conviertan en números por el camino: un informe con el UUID convertido a
// notación científica no sirve para nada.

import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import {
  TEMPLATE_HEADERS,
  buildReportRows,
  buildUpdateReportFilename,
  buildUpdateReportWorkbook,
  buildUpdateTemplateWorkbook,
  type ReportRow,
} from './report'
import { ID_HEADER, UPDATABLE_FIELDS } from './types'
import { readUpdateSheet } from './workbook'

// ── Plantilla ───────────────────────────────────────────────────────────────

describe('plantilla', () => {
  it('lleva el identificador y todos los campos actualizables', () => {
    expect(TEMPLATE_HEADERS[0]).toBe(ID_HEADER)
    for (const spec of UPDATABLE_FIELDS) {
      expect(TEMPLATE_HEADERS).toContain(spec.header)
    }
    expect(TEMPLATE_HEADERS).toHaveLength(UPDATABLE_FIELDS.length + 1)
  })

  // La plantilla tiene que poder subirse tal y como se descarga. Si el parser
  // la rechazara —por llevar dos hojas, por ejemplo— nadie lo sabría hasta
  // intentarlo con datos reales dentro.
  it('el parser la acepta: una sola hoja y cabeceras reconocibles', () => {
    const bytes = new Uint8Array(buildUpdateTemplateWorkbook())
    const res = readUpdateSheet(bytes)

    // Sin filas de datos, el parser corta con «sin filas» — que es lo correcto
    // para una plantilla vacía. Lo que importa es que llegue hasta ahí y no
    // falle antes por el formato.
    expect(res.ok).toBe(false)
    if (res.ok) return
    expect(res.error).toContain('ninguna fila de datos')

    // Y la cabecera es legible: se comprueba leyendo el libro directamente.
    const book = XLSX.read(bytes, { type: 'array' })
    expect(book.SheetNames).toEqual(['Proveedores'])
    const hoja = book.Sheets['Proveedores']
    expect(hoja['A1'].v).toBe(ID_HEADER)
  })

  it('no trae ninguna fila de ejemplo que alguien pueda subir sin querer', () => {
    const book = XLSX.read(new Uint8Array(buildUpdateTemplateWorkbook()), { type: 'array' })
    const rango = XLSX.utils.decode_range(book.Sheets['Proveedores']['!ref'] as string)
    expect(rango.e.r).toBe(0) // solo la fila de cabecera
  })
})

// ── Informe ─────────────────────────────────────────────────────────────────

function filaInforme(over: Partial<ReportRow> = {}): ReportRow {
  return {
    line: 2,
    supplierId: '11111111-1111-1111-1111-111111111111',
    supplierName: 'Agro Lleida SL',
    status: 'updated',
    updatedFields: ['email', 'city'],
    currentValues: { email: null, city: 'Balaguer' },
    changes: { email: 'nuevo@x.com', city: 'Lleida' },
    errors: [],
    ...over,
  }
}

describe('filas del informe', () => {
  it('enseña el antes y el después con etiquetas legibles', () => {
    const [fila] = buildReportRows([filaInforme()])
    expect(fila[0]).toBe('2')
    expect(fila[3]).toBe('Actualizada')
    expect(fila[4]).toBe('Correo, Localidad')
    expect(fila[5]).toBe('Correo: (vacío) · Localidad: Balaguer')
    expect(fila[6]).toBe('Correo: nuevo@x.com · Localidad: Lleida')
  })

  it('los campos van en el mismo orden en las dos columnas de valores', () => {
    const [fila] = buildReportRows([filaInforme()])
    const anteriores = fila[5].split(' · ').map((t) => t.split(':')[0])
    const nuevos = fila[6].split(' · ').map((t) => t.split(':')[0])
    expect(anteriores).toEqual(nuevos)
  })

  it('los errores salen con su columna delante', () => {
    const [fila] = buildReportRows([
      filaInforme({
        status: 'invalid',
        updatedFields: [],
        errors: [{ column: 'Correo', message: 'no es un correo válido.' }],
      }),
    ])
    expect(fila[7]).toBe('Correo: no es un correo válido.')
  })

  it('una fila con ID inexistente conserva lo que se escribió', () => {
    const [fila] = buildReportRows([
      filaInforme({
        status: 'invalid',
        supplierName: null,
        updatedFields: [],
        errors: [{ column: 'ID interno', message: 'No existe ningún proveedor con este ID.' }],
      }),
    ])
    expect(fila[1]).toBe('11111111-1111-1111-1111-111111111111')
    expect(fila[2]).toBe('')
  })
})

describe('seguridad del informe', () => {
  // El nombre viene de un fichero de terceros. Sin neutralizar, se ejecutaría
  // al abrir el informe en el equipo de quien lo descarga.
  it('neutraliza las fórmulas del contenido', () => {
    const buffer = buildUpdateReportWorkbook([
      filaInforme({ supplierName: '=HYPERLINK("http://x","pincha")' }),
    ])
    const book = XLSX.read(new Uint8Array(buffer), { type: 'array' })
    const hoja = book.Sheets['Actualización']
    expect(String(hoja['C2'].v).startsWith("'")).toBe(true)
  })

  it('todas las celdas salen como texto: el UUID no se convierte en número', () => {
    const buffer = buildUpdateReportWorkbook([filaInforme({ line: 7 })])
    const book = XLSX.read(new Uint8Array(buffer), { type: 'array' })
    const hoja = book.Sheets['Actualización']

    expect(hoja['A2'].t).toBe('s')  // la línea, aunque parezca número
    expect(hoja['B2'].t).toBe('s')  // el UUID
    expect(hoja['B2'].v).toBe('11111111-1111-1111-1111-111111111111')
  })

  it('el nombre del fichero lleva la fecha, no el identificador del batch', () => {
    expect(buildUpdateReportFilename(new Date(2026, 6, 30)))
      .toBe('actualizacion-proveedores-2026-07-30.xlsx')
  })
})

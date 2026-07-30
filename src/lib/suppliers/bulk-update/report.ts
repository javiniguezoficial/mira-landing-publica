// Plantilla e informe de la actualización masiva (Fase 3.2).
//
// Los dos ficheros se GENERAN, no se parsean, así que aquí `xlsx` solo escribe
// —el mismo caso que la exportación de 3.4—. Lo que sí importa es el contenido:
// el informe repite datos que VINIERON de un fichero de terceros, así que sale
// neutralizado y todo en texto. Un proveedor llamado `=cmd|…` que se cuele en
// el informe se ejecutaría en el Excel de quien lo abra.

import * as XLSX from 'xlsx'
import { neutralizeFormula } from '@/lib/suppliers/export'
import {
  ID_HEADER,
  ROW_STATUS_LABELS,
  UPDATABLE_FIELDS,
  fieldSpec,
  type NormalizedValue,
  type UpdatableField,
  type UpdateRowStatus,
} from './types'
import { displayValue } from './validation'

/** `actualizacion-proveedores-2026-07-30.xlsx` */
export function buildUpdateReportFilename(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `actualizacion-proveedores-${y}-${m}-${d}.xlsx`
}

export const UPDATE_TEMPLATE_FILENAME = 'plantilla-actualizacion-proveedores.xlsx'

/**
 * Escribe una hoja donde TODAS las celdas son texto.
 *
 * Forzar el tipo es lo que conserva un UUID, un NIF `B12345678`, un teléfono
 * `+34 600…` y un código postal `08001`. Sin esto, Excel convierte el código
 * postal en el número 8001 y el fichero deja de servir para volver a subirlo.
 */
function hojaDeTexto(headers: string[], filas: string[][], anchos: number[]): XLSX.WorkSheet {
  const aoa = [headers, ...filas.map((fila) => fila.map(neutralizeFormula))]
  const sheet = XLSX.utils.aoa_to_sheet(aoa)

  for (let r = 0; r < aoa.length; r++) {
    for (let c = 0; c < headers.length; c++) {
      const ref = XLSX.utils.encode_cell({ r, c })
      if (sheet[ref]) sheet[ref].t = 's'
    }
  }

  sheet['!cols'] = anchos.map((wch) => ({ wch }))
  return sheet
}

// ── Plantilla ───────────────────────────────────────────────────────────────

export const TEMPLATE_HEADERS: readonly string[] = [
  ID_HEADER,
  ...UPDATABLE_FIELDS.map((f) => f.header),
]

/**
 * Plantilla vacía: solo la fila de cabeceras.
 *
 * ── Por qué no lleva ninguna fila de ejemplo ────────────────────────────────
 *
 * Porque una fila de ejemplo con un UUID inventado es una fila que alguien
 * subirá tal cual. Quedaría como inválida —el UUID no existe— pero habría
 * gastado una vuelta entera del proceso para descubrirlo.
 *
 * Una sola hoja, porque el validador exige exactamente una: la plantilla tiene
 * que poder subirse tal y como se descarga.
 */
export function buildUpdateTemplateWorkbook(): Buffer {
  const sheet = hojaDeTexto(
    [...TEMPLATE_HEADERS],
    [],
    TEMPLATE_HEADERS.map((h) => Math.max(14, Math.min(40, h.length + 6))),
  )
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, 'Proveedores')
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

// ── Informe ─────────────────────────────────────────────────────────────────

export interface ReportRow {
  line: number
  supplierId: string | null
  supplierName: string | null
  status: UpdateRowStatus
  updatedFields: string[]
  currentValues: Record<string, NormalizedValue>
  changes: Record<string, NormalizedValue>
  errors: { column: string | null; message: string }[]
}

const REPORT_HEADERS = [
  'Fila',
  'ID interno',
  'Proveedor',
  'Estado',
  'Campos modificados',
  'Valores anteriores',
  'Valores nuevos',
  'Errores',
] as const

const REPORT_WIDTHS = [8, 38, 34, 18, 30, 44, 44, 52]

function etiqueta(campo: string): string {
  try {
    return fieldSpec(campo as UpdatableField).label
  } catch {
    return campo
  }
}

/**
 * «Correo: ana@x.com · Teléfono: (vacío)».
 *
 * Se listan los campos en el mismo orden en las dos columnas, para que se
 * puedan leer en paralelo sin buscar.
 */
function listaDeValores(
  campos: string[],
  valores: Record<string, NormalizedValue>,
): string {
  return campos
    .map((campo) => `${etiqueta(campo)}: ${displayValue(valores[campo])}`)
    .join(' · ')
}

export function buildReportRows(filas: ReportRow[]): string[][] {
  return filas.map((f) => [
    String(f.line),
    f.supplierId ?? '',
    f.supplierName ?? '',
    ROW_STATUS_LABELS[f.status] ?? f.status,
    f.updatedFields.map(etiqueta).join(', '),
    listaDeValores(f.updatedFields, f.currentValues),
    listaDeValores(f.updatedFields, f.changes),
    f.errors.map((e) => (e.column ? `${e.column}: ${e.message}` : e.message)).join(' | '),
  ])
}

/**
 * Informe completo del batch.
 *
 * Lleva TODAS las filas, no solo las rechazadas: quien acaba de actualizar
 * 4.000 proveedores necesita poder demostrar qué cambió y desde qué valor. Las
 * columnas «anteriores» y «nuevas» son esa prueba.
 *
 * No contiene nada de ninguna organización cliente: son datos del catálogo de
 * proveedores y notas internas de administración, y la descarga está reservada
 * a `platform_admin`.
 */
export function buildUpdateReportWorkbook(filas: ReportRow[]): Buffer {
  const sheet = hojaDeTexto([...REPORT_HEADERS], buildReportRows(filas), REPORT_WIDTHS)

  if (filas.length > 0) {
    sheet['!autofilter'] = {
      ref: XLSX.utils.encode_range({
        s: { r: 0, c: 0 },
        e: { r: filas.length, c: REPORT_HEADERS.length - 1 },
      }),
    }
  }

  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, 'Actualización')
  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

// Exportación de proveedores a XLSX (Fase 3.4).
//
// Módulo puro salvo por la generación del libro: define QUÉ columnas se
// exportan según quién exporta, y cómo se escribe cada valor para que Excel no
// lo estropee ni lo ejecute.
//
// ── Sobre la dependencia `xlsx` ─────────────────────────────────────────────
//
// Se reutiliza la que ya está en el proyecto (`xlsx@0.18.5`), sin añadir
// ninguna nueva. Esa versión arrastra avisos de seguridad conocidos, pero todos
// afectan al PARSEO de ficheros de terceros —contaminación de prototipo al
// leer—, no a la generación. Aquí solo se ESCRIBE, a partir de datos que salen
// de nuestra propia base ya filtrados por RLS. Este bloque no procesa ningún
// fichero subido.

import * as XLSX from 'xlsx'
import type { Supplier } from '@/lib/actions/suppliers'

/** Quién exporta. Decide el juego de columnas, no solo la presentación. */
export type ExportAudience = 'admin' | 'client'

export interface ExportColumn {
  key: string
  header: string
  /** Ancho aproximado en caracteres. */
  width: number
  /**
   * `text` fuerza el formato texto en Excel. Es lo que impide que un NIF
   * `B12345678` o un teléfono `+34 600...` se conviertan en número y pierdan
   * ceros a la izquierda o acaben en notación científica.
   */
  type?: 'text' | 'number' | 'date'
  value: (s: Supplier) => string | number | null
}

function taxonomia(s: Supplier): string {
  return [s.supplier_market?.name, s.supplier_category?.name, s.supplier_family?.name, s.supplier_subfamily?.name]
    .filter(Boolean)
    .join(' › ')
}

/**
 * Columnas comunes a las dos audiencias.
 *
 * Son campos que el cliente YA ve hoy en su listado y en el mapa. No se añade
 * nada que no estuviera visible: este bloque no cambia qué información recibe
 * nadie, solo permite llevársela en una hoja.
 *
 * `tax_id`, `email`, `phone`, `website`, `address` y `postal_code` están hoy
 * vacíos en los 12.288 proveedores. Se exportan igualmente —como columnas
 * vacías— porque son campos legítimos del modelo y quien reciba el fichero
 * espera esas cabeceras; el día que se pueblen, la exportación ya funciona.
 */
const COMMON_COLUMNS: ExportColumn[] = [
  { key: 'name',        header: 'Nombre',        width: 42, type: 'text',   value: (s) => s.name },
  { key: 'tax_id',      header: 'NIF/CIF',       width: 16, type: 'text',   value: (s) => s.tax_id },
  { key: 'email',       header: 'Correo',        width: 28, type: 'text',   value: (s) => s.email },
  { key: 'phone',       header: 'Teléfono',      width: 18, type: 'text',   value: (s) => s.phone },
  { key: 'website',     header: 'Web',           width: 28, type: 'text',   value: (s) => s.website },
  { key: 'country',     header: 'País',          width: 18, type: 'text',   value: (s) => s.country },
  { key: 'region',      header: 'Provincia',     width: 20, type: 'text',   value: (s) => s.region },
  { key: 'city',        header: 'Localidad',     width: 22, type: 'text',   value: (s) => s.city },
  { key: 'postal_code', header: 'Código postal', width: 14, type: 'text',   value: (s) => s.postal_code },
  { key: 'address',     header: 'Dirección',     width: 36, type: 'text',   value: (s) => s.address },
  { key: 'latitude',    header: 'Latitud',       width: 12, type: 'number', value: (s) => s.latitude },
  { key: 'longitude',   header: 'Longitud',      width: 12, type: 'number', value: (s) => s.longitude },
  { key: 'taxonomy',    header: 'Clasificación', width: 46, type: 'text',   value: taxonomia },
  { key: 'produccion',  header: 'Producción',    width: 16, type: 'number', value: (s) => s.produccion_value },
  { key: 'produccion_unit', header: 'Unidad producción', width: 16, type: 'text', value: (s) => s.produccion_unit },
  { key: 'medida',      header: 'Medida',        width: 16, type: 'text',   value: (s) => s.medida },
]

/**
 * Columnas SOLO para administración.
 *
 * `notes` es una nota interna y `is_active` una decisión de gestión: el cliente
 * no las ve en pantalla y por tanto tampoco pueden salir en su exportación. El
 * `id` interno solo tiene sentido para quien vaya a reimportar (ver 3.2).
 */
const ADMIN_ONLY_COLUMNS: ExportColumn[] = [
  { key: 'id',         header: 'ID interno',       width: 38, type: 'text', value: (s) => s.id },
  { key: 'notes',      header: 'Notas internas',   width: 40, type: 'text', value: (s) => s.notes },
  { key: 'is_active',  header: 'Activo',           width: 10, type: 'text', value: (s) => (s.is_active ? 'Sí' : 'No') },
  { key: 'created_at', header: 'Fecha de alta',    width: 18, type: 'date', value: (s) => s.created_at },
  { key: 'updated_at', header: 'Última actualización', width: 20, type: 'date', value: (s) => s.updated_at },
]

export function exportColumnsFor(audience: ExportAudience): ExportColumn[] {
  return audience === 'admin' ? [...ADMIN_ONLY_COLUMNS.slice(0, 1), ...COMMON_COLUMNS, ...ADMIN_ONLY_COLUMNS.slice(1)] : COMMON_COLUMNS
}

// ── Seguridad del contenido ─────────────────────────────────────────────────

const FORMULA_PREFIXES = ['=', '+', '-', '@', '\t', '\r']

/**
 * ¿Este texto se ejecutaría como fórmula al abrirlo en Excel?
 *
 * El dato viene de nuestra base, pero llegó ahí por una importación de un
 * fichero externo. Un nombre de proveedor que empiece por `=` se ejecutaría en
 * el equipo de quien abra la exportación.
 */
export function isFormulaLike(value: string): boolean {
  return value.length > 0 && FORMULA_PREFIXES.includes(value[0])
}

/** Antepone un apóstrofo, que Excel interpreta como «esto es texto». */
export function neutralizeFormula(value: string): string {
  return isFormulaLike(value) ? `'${value}` : value
}

/** `2026-07-30` a partir de un timestamp ISO. Formato estable, sin zona horaria. */
export function formatExportDate(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** Celda ya lista para la hoja, con su tipo de Excel resuelto. */
export interface ExportCell {
  v: string | number
  t: 's' | 'n'
}

/**
 * Convierte un valor a celda.
 *
 * Los campos `text` salen SIEMPRE como cadena, aunque su contenido parezca un
 * número: es lo que conserva un código postal `08001` y evita que un NIF largo
 * acabe como `1,23457E+11`.
 */
export function toCell(column: ExportColumn, supplier: Supplier): ExportCell {
  const raw = column.value(supplier)

  if (raw === null || raw === undefined || raw === '') return { v: '', t: 's' }

  if (column.type === 'number') {
    const n = typeof raw === 'number' ? raw : Number(raw)
    return Number.isFinite(n) ? { v: n, t: 'n' } : { v: String(raw), t: 's' }
  }

  if (column.type === 'date') {
    return { v: formatExportDate(String(raw)), t: 's' }
  }

  return { v: neutralizeFormula(String(raw)), t: 's' }
}

/** Filas listas para la hoja: cabeceras + datos ya neutralizados. */
export function buildExportRows(
  suppliers: Supplier[],
  columns: ExportColumn[],
): { headers: string[]; rows: ExportCell[][] } {
  return {
    headers: columns.map((c) => c.header),
    rows: suppliers.map((s) => columns.map((c) => toCell(c, s))),
  }
}

/**
 * Genera el XLSX completo, en SERVIDOR.
 *
 * El navegador recibe un fichero binario ya hecho; en ningún momento se le
 * envían las 12.288 filas para que las convierta él.
 */
export function buildSuppliersWorkbook(
  suppliers: Supplier[],
  audience: ExportAudience,
): Buffer {
  const columns = exportColumnsFor(audience)
  const { headers, rows } = buildExportRows(suppliers, columns)

  const aoa: (string | number)[][] = [headers, ...rows.map((fila) => fila.map((c) => c.v))]
  const sheet = XLSX.utils.aoa_to_sheet(aoa)

  // Se reescribe el tipo de cada celda de datos: `aoa_to_sheet` deduce el tipo
  // del valor de JavaScript, y una cadena que parece número la escribiría como
  // número. Aquí manda el tipo declarado en la columna.
  rows.forEach((fila, r) => {
    fila.forEach((celda, c) => {
      const ref = XLSX.utils.encode_cell({ r: r + 1, c })
      if (sheet[ref]) sheet[ref].t = celda.t
    })
  })

  sheet['!cols'] = columns.map((c) => ({ wch: c.width }))

  // Autofiltro sobre la fila de cabecera: con miles de filas es lo primero que
  // se busca al abrir la hoja.
  if (rows.length > 0) {
    sheet['!autofilter'] = {
      ref: XLSX.utils.encode_range({
        s: { r: 0, c: 0 },
        e: { r: rows.length, c: columns.length - 1 },
      }),
    }
  }

  // NO se congela la fila de cabecera: `!freeze` solo lo escribe la versión Pro
  // de SheetJS, y en la community se ignora en silencio. Dejarlo puesto haría
  // creer que el fichero abre con la cabecera fija cuando no es así. El
  // autofiltro, que sí funciona, cubre la necesidad principal.

  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, 'Proveedores')

  return XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

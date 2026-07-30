// Lectura del XLSX subido (Fase 3.2).
//
// ═══════════════════════════════════════════════════════════════════════════
// SOBRE LA DEPENDENCIA `xlsx`, QUE AQUÍ SÍ IMPORTA
// ═══════════════════════════════════════════════════════════════════════════
//
// La exportación (3.4) solo ESCRIBE, y por eso allí los avisos de seguridad de
// `xlsx@0.18.5` eran irrelevantes. Aquí se LEE un fichero que ha tocado una
// persona y ha viajado por su correo, que es exactamente el escenario de los
// dos avisos conocidos:
//
//   CVE-2023-30533  contaminación de prototipo al parsear un libro manipulado.
//                   Corregido aguas arriba en 0.19.3.
//   CVE-2024-22363  ReDoS en el parseo de formatos de número (SSF).
//                   Corregido aguas arriba en 0.20.2.
//
// ── Por qué NO se actualiza la dependencia en este bloque ──────────────────
//
// Porque no se puede hacer desde npm: SheetJS dejó de publicar en el registro
// público en 0.18.5 y las versiones corregidas solo existen en su propio CDN
// (`https://cdn.sheetjs.com/xlsx-0.20.x/…`). Cambiar a esa fuente altera cómo
// se instala el proyecto y exige que el build de Coolify alcance un host nuevo:
// es una decisión de despliegue, no de este bloque, y meterla aquí arriesgaría
// dejar la plataforma sin poder desplegar.
//
// El riesgo ya existía además antes de este bloque: `import-suppliers.ts` lleva
// desde su primer día llamando a `XLSX.read` sobre ficheros subidos, con las
// opciones por defecto y sin ninguna de las barreras de abajo.
//
// ── Qué se hace en su lugar ────────────────────────────────────────────────
//
//   1. Tamaño y formato se comprueban ANTES de parsear (magia ZIP incluida).
//   2. `cellText: false` y `cellNF: false` — no se generan las cadenas
//      formateadas, que es justo el camino de SSF donde vive el ReDoS.
//   3. NUNCA se usa `sheet_to_json`. Las filas se construyen recorriendo el
//      rango declarado y leyendo celda a celda por dirección A1 calculada por
//      nosotros. Las claves de los objetos que se crean salen de NUESTRA
//      allowlist, jamás del fichero: esa es la vía por la que un `__proto__`
//      del libro llegaría a un objeto.
//   4. Se exige UNA sola hoja y se rechazan nombres de hoja peligrosos.
//   5. El rango declarado se acota antes de recorrerlo: un fichero de 3 KB
//      puede declarar A1:XFD1048576 y hacer que el bucle intente leer mil
//      millones de celdas.
//   6. Las fórmulas no se evalúan nunca — SheetJS tampoco lo hace al leer— y
//      además su presencia marca la fila como inválida.

import * as XLSX from 'xlsx'
import { MAX_UPDATE_ROWS } from './types'

/** Techo de columnas. La exportación administrativa tiene 25. */
export const MAX_UPDATE_COLUMNS = 100

// ── Comprobaciones previas al parseo ────────────────────────────────────────

/**
 * ¿Esto es realmente un XLSX?
 *
 * Un `.xlsx` es un ZIP, y todo ZIP empieza por `PK\x03\x04`. Ni la extensión ni
 * el MIME son de fiar —los pone quien sube el fichero—, así que se mira el
 * contenido. No demuestra que sea un libro válido; descarta que sea otra cosa
 * antes de dárselo al parser.
 */
export function isZipContainer(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x50 && bytes[1] === 0x4b &&
    bytes[2] === 0x03 && bytes[3] === 0x04
  )
}

/** Nombres de hoja que no pueden usarse como clave de un objeto sin riesgo. */
const NOMBRES_PELIGROSOS = new Set(['__proto__', 'constructor', 'prototype'])

export function isDangerousSheetName(name: string): boolean {
  return NOMBRES_PELIGROSOS.has(name.trim().toLowerCase())
}

// ── Celdas ──────────────────────────────────────────────────────────────────

export interface CellRead {
  /** Texto ya normalizado. Cadena vacía si la celda no aporta nada. */
  text: string
  /** La celda contenía una fórmula. */
  formula: boolean
  /** La celda contenía un error de Excel (#REF!, #N/A…). */
  error: boolean
}

const CELDA_VACIA: CellRead = { text: '', formula: false, error: false }

/**
 * Convierte una celda en texto SIN pasar por el formateador.
 *
 * Se usa el valor crudo (`v`), no la cadena formateada (`w`), por dos razones
 * independientes:
 *
 *   · seguridad — `w` se genera con SSF, que es donde vive el ReDoS conocido;
 *   · corrección — un número con formato de millares se lee «12.000» en `w`,
 *     y ese texto es ambiguo: puede ser doce mil o doce coma cero. El valor
 *     crudo no tiene esa duda.
 */
export function cellToText(cell: unknown): CellRead {
  if (cell === null || cell === undefined || typeof cell !== 'object') return CELDA_VACIA

  const c = cell as { v?: unknown; t?: string; f?: unknown }
  const formula = typeof c.f === 'string' && c.f.length > 0
  const error = c.t === 'e'

  if (error) return { text: '', formula, error: true }
  if (c.v === null || c.v === undefined) return { text: '', formula, error: false }

  if (c.t === 'b' || typeof c.v === 'boolean') {
    return { text: c.v ? 'true' : 'false', formula, error: false }
  }
  if (typeof c.v === 'number') {
    return { text: String(c.v), formula, error: false }
  }

  return { text: String(c.v).trim(), formula, error: false }
}

// ── Lectura de la hoja ──────────────────────────────────────────────────────

export interface ParsedUpdateRow {
  /** Línea tal y como se ve en Excel: la cabecera es la 1. */
  line: number
  /** Celdas alineadas con `headers`, por índice. Nunca por clave del fichero. */
  cells: CellRead[]
}

export interface ParsedUpdateSheet {
  headers: string[]
  rows: ParsedUpdateRow[]
  sheetName: string
}

export type ParseSheetResult =
  | { ok: true; sheet: ParsedUpdateSheet }
  | { ok: false; error: string }

export const PARSE_MESSAGES = {
  noZip: 'El archivo no es un .xlsx válido.',
  ilegible: 'No se ha podido leer el archivo. Comprueba que es un .xlsx sin proteger.',
  sinHojas: 'El archivo no contiene ninguna hoja.',
  variasHojas:
    'El archivo contiene varias hojas. Sube un archivo con una sola hoja de datos, ' +
    'como el que genera la exportación de proveedores.',
  hojaSospechosa: 'El nombre de la hoja no es admisible.',
  hojaVacia: 'La hoja está vacía.',
  demasiadasColumnas: `La hoja declara más de ${MAX_UPDATE_COLUMNS} columnas.`,
  demasiadasFilas: `El archivo supera el límite de ${MAX_UPDATE_ROWS.toLocaleString('es-ES')} filas.`,
  sinCabecera: 'La primera fila del archivo no contiene ninguna cabecera.',
  sinFilas: 'El archivo no contiene ninguna fila de datos.',
} as const

/**
 * Lee la única hoja del libro y devuelve cabeceras y filas.
 *
 * No interpreta nada: no sabe qué es un proveedor ni qué columnas existen. Solo
 * entrega texto por posición. Toda la semántica vive en `validation.ts`, que es
 * un módulo puro y por tanto se puede probar sin generar ficheros binarios.
 */
export function readUpdateSheet(bytes: Uint8Array): ParseSheetResult {
  if (!isZipContainer(bytes)) return { ok: false, error: PARSE_MESSAGES.noZip }

  let book: XLSX.WorkBook
  try {
    book = XLSX.read(bytes, {
      type: 'array',
      // Sin cadenas formateadas ni formatos de número: se evita el parser SSF.
      cellText: false,
      cellNF: false,
      cellHTML: false,
      cellStyles: false,
      cellDates: false,
      // Sin celdas «fantasma»: una hoja con estilos pero sin datos no debe
      // generar miles de filas vacías.
      sheetStubs: false,
      bookVBA: false,
      WTF: false,
    })
  } catch {
    return { ok: false, error: PARSE_MESSAGES.ilegible }
  }

  const nombres = book.SheetNames ?? []
  if (nombres.length === 0) return { ok: false, error: PARSE_MESSAGES.sinHojas }
  if (nombres.length > 1) return { ok: false, error: PARSE_MESSAGES.variasHojas }

  const sheetName = nombres[0]
  if (typeof sheetName !== 'string' || isDangerousSheetName(sheetName)) {
    return { ok: false, error: PARSE_MESSAGES.hojaSospechosa }
  }

  const sheet = book.Sheets?.[sheetName]
  // `Object.hasOwn` y no `sheet['!ref']`: si el nombre de hoja hubiera
  // envenenado la cadena de prototipos, la propiedad vendría heredada y no
  // propia. Aquí solo se acepta lo que la hoja tiene de verdad.
  if (!sheet || !Object.hasOwn(sheet, '!ref')) {
    return { ok: false, error: PARSE_MESSAGES.hojaVacia }
  }

  const ref = sheet['!ref']
  if (typeof ref !== 'string') return { ok: false, error: PARSE_MESSAGES.hojaVacia }

  let rango: XLSX.Range
  try {
    rango = XLSX.utils.decode_range(ref)
  } catch {
    return { ok: false, error: PARSE_MESSAGES.ilegible }
  }

  // El rango lo declara el fichero. Se acota ANTES de recorrerlo: un `.xlsx` de
  // 3 KB puede decir que ocupa A1:XFD1048576 y dejar el proceso girando sobre
  // mil millones de celdas inexistentes.
  const numColumnas = rango.e.c - rango.s.c + 1
  const numFilas = rango.e.r - rango.s.r + 1

  if (numColumnas > MAX_UPDATE_COLUMNS) {
    return { ok: false, error: PARSE_MESSAGES.demasiadasColumnas }
  }
  if (numFilas - 1 > MAX_UPDATE_ROWS) {
    return { ok: false, error: PARSE_MESSAGES.demasiadasFilas }
  }

  // ── Cabecera ──────────────────────────────────────────────────────────────
  const headers: string[] = []
  for (let c = rango.s.c; c <= rango.e.c; c++) {
    const celda = sheet[XLSX.utils.encode_cell({ r: rango.s.r, c })]
    headers.push(cellToText(celda).text)
  }

  if (headers.every((h) => h === '')) return { ok: false, error: PARSE_MESSAGES.sinCabecera }

  // ── Filas ─────────────────────────────────────────────────────────────────
  const rows: ParsedUpdateRow[] = []

  for (let r = rango.s.r + 1; r <= rango.e.r; r++) {
    const cells: CellRead[] = []
    let algo = false

    for (let c = rango.s.c; c <= rango.e.c; c++) {
      const leida = cellToText(sheet[XLSX.utils.encode_cell({ r, c })])
      if (leida.text !== '' || leida.formula || leida.error) algo = true
      cells.push(leida)
    }

    // Una fila entera vacía no es un error ni una fila: es el hueco que deja
    // Excel al borrar contenido. Se descarta sin contarla.
    if (!algo) continue

    // `r` es base 0 y la cabecera es la línea 1 para quien mira la hoja.
    rows.push({ line: r - rango.s.r + 1, cells })
  }

  if (rows.length === 0) return { ok: false, error: PARSE_MESSAGES.sinFilas }

  return { ok: true, sheet: { headers, rows, sheetName } }
}

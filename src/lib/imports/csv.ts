// Lector de CSV para la importación masiva de precios (Fase 2.5, MVP).
//
// Módulo puro: sin Next, sin Supabase, SIN DEPENDENCIAS.
//
// ── Por qué un parser propio y no una librería ──────────────────────────────
//
// El proyecto ya arrastra `xlsx@0.18.5` para el importador anterior. Esa versión
// es la última publicada en npm y acumula avisos de seguridad conocidos
// (contaminación de prototipo y ReDoS); SheetJS publica las correcciones fuera
// del registro. Meter más superficie de análisis de ficheros no ayudaba.
//
// Un CSV bien definido se lee en menos de cien líneas y a cambio se controla
// exactamente lo que importa aquí: el BOM, las comillas, los saltos de línea
// dentro de campo y, sobre todo, que NADA se evalúe nunca. El MVP es CSV; XLSX
// queda documentado como ampliación.

/** Lo que se acepta como separador. La plantilla oficial usa la coma. */
export type CsvDelimiter = ',' | ';'

export interface CsvParseOptions {
  /** Si no se indica, se detecta a partir de la cabecera. */
  delimiter?: CsvDelimiter
  /** Corta la lectura y avisa. Protege la memoria del servidor. */
  maxRows?: number
}

export interface CsvParseError {
  /** 1 = cabecera. Las filas de datos empiezan en 2, como en una hoja de cálculo. */
  line: number
  message: string
}

export interface CsvParseResult {
  headers: string[]
  /** Una entrada por fila de datos, ya emparejada con su cabecera. */
  rows: { line: number; values: Record<string, string> }[]
  errors: CsvParseError[]
  /** `true` si se alcanzó `maxRows` y se dejaron filas sin leer. */
  truncated: boolean
}

/** El BOM de UTF-8. Excel lo escribe casi siempre y rompe la primera cabecera. */
const BOM = '﻿'

export function stripBom(text: string): string {
  return text.startsWith(BOM) ? text.slice(BOM.length) : text
}

/**
 * Detecta el separador contando fuera de comillas en la primera línea.
 *
 * Excel en español exporta con `;`, y rechazar esos ficheros sin más sería
 * hostil: el usuario no eligió ese separador, se lo puso su Excel.
 */
export function detectDelimiter(firstLine: string): CsvDelimiter {
  let comas = 0
  let puntoYComas = 0
  let enComillas = false

  for (let i = 0; i < firstLine.length; i++) {
    const c = firstLine[i]
    if (c === '"') {
      enComillas = !enComillas
      continue
    }
    if (enComillas) continue
    if (c === ',') comas++
    else if (c === ';') puntoYComas++
  }

  return puntoYComas > comas ? ';' : ','
}

/**
 * Divide el texto en celdas respetando las comillas dobles de RFC 4180.
 *
 * Se recorre carácter a carácter en lugar de partir por el separador porque un
 * campo entrecomillado puede contener el separador, comillas escapadas (`""`) y
 * saltos de línea. Partir por comas rompería `"Lonja de Silleda, A Coruña"`.
 */
function parseRows(text: string, delimiter: string): string[][] {
  const filas: string[][] = []
  let fila: string[] = []
  let campo = ''
  let enComillas = false
  let i = 0

  while (i < text.length) {
    const c = text[i]

    if (enComillas) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          campo += '"'
          i += 2
          continue
        }
        enComillas = false
        i++
        continue
      }
      campo += c
      i++
      continue
    }

    if (c === '"') {
      enComillas = true
      i++
      continue
    }

    if (c === delimiter) {
      fila.push(campo)
      campo = ''
      i++
      continue
    }

    if (c === '\r') {
      // CRLF y CR sueltos se tratan igual que LF.
      if (text[i + 1] === '\n') i++
      fila.push(campo)
      filas.push(fila)
      fila = []
      campo = ''
      i++
      continue
    }

    if (c === '\n') {
      fila.push(campo)
      filas.push(fila)
      fila = []
      campo = ''
      i++
      continue
    }

    campo += c
    i++
  }

  // Última fila sin salto de línea final.
  if (campo.length > 0 || fila.length > 0) {
    fila.push(campo)
    filas.push(fila)
  }

  return filas
}

/** ¿Es una fila totalmente vacía? Excel deja cientos al final del fichero. */
function esFilaVacia(valores: string[]): boolean {
  return valores.every((v) => v.trim() === '')
}

/**
 * Normaliza un nombre de columna: sin BOM, sin espacios sobrantes y en
 * minúsculas.
 *
 * Solo eso. NO se aceptan sinónimos ni variantes libres: la plantilla es la
 * plantilla. Adivinar que «Precio» es `price` acaba importando la columna
 * equivocada sin que nadie se entere.
 */
export function normalizeHeader(raw: string): string {
  return stripBom(raw).trim().toLowerCase()
}

export function parseCsv(text: string, options: CsvParseOptions = {}): CsvParseResult {
  const limpio = stripBom(text)
  const errors: CsvParseError[] = []

  if (limpio.trim() === '') {
    return { headers: [], rows: [], errors: [{ line: 1, message: 'El archivo está vacío.' }], truncated: false }
  }

  const primeraLinea = limpio.split(/\r?\n/, 1)[0] ?? ''
  const delimiter = options.delimiter ?? detectDelimiter(primeraLinea)

  const crudas = parseRows(limpio, delimiter)
  if (crudas.length === 0) {
    return { headers: [], rows: [], errors: [{ line: 1, message: 'El archivo está vacío.' }], truncated: false }
  }

  const headers = crudas[0].map(normalizeHeader)

  const duplicadas = headers.filter((h, i) => h !== '' && headers.indexOf(h) !== i)
  if (duplicadas.length > 0) {
    errors.push({
      line: 1,
      message: `Columnas repetidas en la cabecera: ${[...new Set(duplicadas)].join(', ')}.`,
    })
  }

  const rows: CsvParseResult['rows'] = []
  let truncated = false

  for (let i = 1; i < crudas.length; i++) {
    const valores = crudas[i]
    const line = i + 1

    // Las filas en blanco no son un error: son el relleno habitual de Excel.
    if (esFilaVacia(valores)) continue

    if (options.maxRows !== undefined && rows.length >= options.maxRows) {
      truncated = true
      break
    }

    if (valores.length !== headers.length) {
      errors.push({
        line,
        message: `La fila tiene ${valores.length} columnas y la cabecera ${headers.length}.`,
      })
      continue
    }

    const registro: Record<string, string> = {}
    headers.forEach((h, idx) => {
      if (h) registro[h] = (valores[idx] ?? '').trim()
    })

    rows.push({ line, values: registro })
  }

  return { headers, rows, errors, truncated }
}

// ── Salida ──────────────────────────────────────────────────────────────────

/**
 * Caracteres que convierten una celda en fórmula al abrir el CSV en Excel o
 * LibreOffice.
 *
 * El vector NO es la importación —esos valores fallarían la validación
 * numérica— sino la EXPORTACIÓN: el CSV de filas rechazadas devuelve texto que
 * vino del fichero de entrada, así que un `=cmd|'…'!A1` escrito por quien subió
 * el fichero se ejecutaría en el equipo de quien descarga los errores.
 */
const CARACTERES_DE_FORMULA = ['=', '+', '-', '@', '\t', '\r']

export function isFormulaLike(value: string): boolean {
  return value.length > 0 && CARACTERES_DE_FORMULA.includes(value[0])
}

/**
 * Neutraliza una celda para escribirla en un CSV.
 *
 * Antepone un apóstrofo a lo que parezca fórmula —Excel lo interpreta como
 * «esto es texto»— y entrecomilla cuando hace falta. Es la única forma de que
 * el CSV de errores sea seguro de abrir.
 */
export function escapeCsvValue(value: unknown): string {
  let texto = value === null || value === undefined ? '' : String(value)

  if (isFormulaLike(texto)) texto = `'${texto}`

  if (/[",;\n\r]/.test(texto)) {
    return `"${texto.replace(/"/g, '""')}"`
  }
  return texto
}

/** Construye un CSV completo, con BOM para que Excel respete los acentos. */
export function buildCsv(headers: string[], rows: unknown[][]): string {
  const lineas = [headers.map(escapeCsvValue).join(',')]
  for (const fila of rows) {
    lineas.push(fila.map(escapeCsvValue).join(','))
  }
  return BOM + lineas.join('\r\n') + '\r\n'
}

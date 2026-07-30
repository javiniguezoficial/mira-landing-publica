// Lectura y escritura de CSV para la importación masiva (Fase 2.5).

import { describe, expect, it } from 'vitest'
import {
  buildCsv,
  detectDelimiter,
  escapeCsvValue,
  isFormulaLike,
  normalizeHeader,
  parseCsv,
  stripBom,
} from './csv'

const CABECERA = 'market_slug,product_slug,recorded_at,price,currency,unit'
const FILA = 'cereales,trigo,2026-07-27,241.50,EUR,ton'

describe('BOM', () => {
  // Excel escribe el BOM casi siempre, y sin quitarlo la primera cabecera pasa
  // a llamarse «﻿market_slug» y no casa con nada.
  it('se retira del principio del archivo', () => {
    expect(stripBom('﻿hola')).toBe('hola')
    expect(stripBom('hola')).toBe('hola')
  })

  it('un CSV con BOM se lee con las cabeceras correctas', () => {
    const r = parseCsv(`﻿${CABECERA}\n${FILA}`)
    expect(r.headers[0]).toBe('market_slug')
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0].values.market_slug).toBe('cereales')
  })

  it('la cabecera se normaliza sin aceptar sinónimos', () => {
    expect(normalizeHeader('  Market_Slug ')).toBe('market_slug')
    // «precio» NO se traduce a «price»: adivinar acaba importando otra columna.
    expect(normalizeHeader('precio')).toBe('precio')
  })
})

describe('separador', () => {
  it('detecta la coma', () => {
    expect(detectDelimiter(CABECERA)).toBe(',')
  })

  // Excel en español exporta con punto y coma. Rechazarlo sería hostil: el
  // usuario no eligió ese separador.
  it('detecta el punto y coma', () => {
    expect(detectDelimiter(CABECERA.replace(/,/g, ';'))).toBe(';')
  })

  it('ignora los separadores que van dentro de comillas', () => {
    expect(detectDelimiter('"a,b,c,d";x;y')).toBe(';')
  })

  it('lee un archivo con punto y coma', () => {
    const r = parseCsv(`${CABECERA.replace(/,/g, ';')}\n${FILA.replace(/,/g, ';')}`)
    expect(r.rows[0].values.price).toBe('241.50')
  })
})

describe('comillas', () => {
  it('un separador dentro de comillas no parte el campo', () => {
    const r = parseCsv(`${CABECERA},region\n${FILA},"Lleida, Cataluña"`)
    expect(r.rows[0].values.region).toBe('Lleida, Cataluña')
  })

  it('las comillas escapadas se reducen a una', () => {
    const r = parseCsv(`${CABECERA},notes\n${FILA},"Dijo ""hola"""`)
    expect(r.rows[0].values.notes).toBe('Dijo "hola"')
  })

  it('un salto de línea dentro de comillas no parte la fila', () => {
    const r = parseCsv(`${CABECERA},notes\n${FILA},"linea1\nlinea2"`)
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0].values.notes).toBe('linea1\nlinea2')
  })
})

describe('estructura', () => {
  it('numera las líneas como una hoja de cálculo: la cabecera es la 1', () => {
    const r = parseCsv(`${CABECERA}\n${FILA}\n${FILA}`)
    expect(r.rows.map((x) => x.line)).toEqual([2, 3])
  })

  // Excel deja cientos de filas vacías al final. No son un error.
  it('las filas totalmente vacías se ignoran sin error', () => {
    const r = parseCsv(`${CABECERA}\n${FILA}\n,,,,,\n\n`)
    expect(r.rows).toHaveLength(1)
    expect(r.errors).toHaveLength(0)
  })

  it('una fila con menos columnas que la cabecera es un error de esa línea', () => {
    const r = parseCsv(`${CABECERA}\ncereales,trigo`)
    expect(r.rows).toHaveLength(0)
    expect(r.errors[0].line).toBe(2)
    expect(r.errors[0].message).toContain('columnas')
  })

  it('detecta cabeceras repetidas', () => {
    const r = parseCsv(`price,price\n1,2`)
    expect(r.errors.some((e) => e.line === 1 && e.message.includes('repetidas'))).toBe(true)
  })

  it('un archivo vacío da error, no una lista vacía silenciosa', () => {
    expect(parseCsv('').errors[0].message).toContain('vacío')
    expect(parseCsv('   \n  ').errors[0].message).toContain('vacío')
  })

  it('acepta CRLF y CR sueltos', () => {
    expect(parseCsv(`${CABECERA}\r\n${FILA}`).rows).toHaveLength(1)
    expect(parseCsv(`${CABECERA}\r${FILA}`).rows).toHaveLength(1)
  })

  it('respeta el límite de filas y lo señala', () => {
    const muchas = [CABECERA, ...Array.from({ length: 10 }, () => FILA)].join('\n')
    const r = parseCsv(muchas, { maxRows: 4 })
    expect(r.rows).toHaveLength(4)
    expect(r.truncated).toBe(true)
  })
})

// ── Inyección de fórmulas ───────────────────────────────────────────────────
//
// El vector NO es importar —esos valores fallan la validación numérica— sino
// EXPORTAR: el CSV de filas rechazadas devuelve texto que vino del archivo de
// entrada, y se abre en el Excel de quien administra.

describe('inyección de fórmulas', () => {
  it('reconoce los cuatro caracteres peligrosos', () => {
    for (const c of ['=', '+', '-', '@']) {
      expect(isFormulaLike(`${c}cmd|'/c calc'!A1`)).toBe(true)
    }
    expect(isFormulaLike('\tvalor')).toBe(true)
    expect(isFormulaLike('valor normal')).toBe(false)
    expect(isFormulaLike('')).toBe(false)
  })

  it('al exportar se neutraliza con un apóstrofo', () => {
    expect(escapeCsvValue('=1+1')).toBe("'=1+1")
    expect(escapeCsvValue('@SUM(A1)')).toBe("'@SUM(A1)")
    expect(escapeCsvValue('-5')).toBe("'-5")
  })

  it('un valor normal no se toca', () => {
    expect(escapeCsvValue('Mercolleida')).toBe('Mercolleida')
    expect(escapeCsvValue(241.5)).toBe('241.5')
    expect(escapeCsvValue(null)).toBe('')
  })

  it('entrecomilla cuando hay separadores o saltos', () => {
    expect(escapeCsvValue('a,b')).toBe('"a,b"')
    expect(escapeCsvValue('a;b')).toBe('"a;b"')
    expect(escapeCsvValue('a\nb')).toBe('"a\nb"')
    expect(escapeCsvValue('di "hola"')).toBe('"di ""hola"""')
  })

  it('buildCsv escribe BOM y neutraliza cada celda', () => {
    const csv = buildCsv(['a', 'b'], [['=peligro', 'normal']])
    expect(csv.startsWith('﻿')).toBe(true)
    expect(csv).toContain("'=peligro")
  })

  it('lo exportado se puede volver a leer sin perder el valor', () => {
    const csv = buildCsv(['nombre'], [['Lleida, Cataluña']])
    const r = parseCsv(csv)
    expect(r.rows[0].values.nombre).toBe('Lleida, Cataluña')
  })
})

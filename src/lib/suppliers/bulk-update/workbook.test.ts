// Lectura del XLSX subido (Fase 3.2).
//
// Estos tests SÍ generan ficheros binarios de verdad y los vuelven a leer: es
// la única forma de comprobar que las barreras del parser aguantan lo que
// llegaría de fuera. Lo que se prueba no es «lee bien un fichero bonito», sino
// qué hace con uno hostil.

import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import {
  MAX_UPDATE_COLUMNS,
  PARSE_MESSAGES,
  cellToText,
  isDangerousSheetName,
  isZipContainer,
  readUpdateSheet,
} from './workbook'

// ── Andamiaje ───────────────────────────────────────────────────────────────

function libro(
  hojas: Record<string, (string | number | boolean | null)[][]>,
  ajustar?: (sheet: XLSX.WorkSheet, nombre: string) => void,
): Uint8Array {
  const book = XLSX.utils.book_new()
  for (const [nombre, aoa] of Object.entries(hojas)) {
    const sheet = XLSX.utils.aoa_to_sheet(aoa)
    ajustar?.(sheet, nombre)
    XLSX.utils.book_append_sheet(book, sheet, nombre)
  }
  return new Uint8Array(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer)
}

const CABECERA = ['ID interno', 'Nombre', 'Correo']

// ── Firma del contenido ─────────────────────────────────────────────────────

describe('el contenido tiene que ser realmente un xlsx', () => {
  it('reconoce la firma ZIP', () => {
    expect(isZipContainer(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00]))).toBe(true)
  })

  // La extensión y el MIME los pone quien sube el fichero. Renombrar un .exe a
  // .xlsx es trivial; falsificar la firma del contenido, no tanto.
  it('rechaza cualquier otra cosa aunque se llame .xlsx', () => {
    expect(isZipContainer(new TextEncoder().encode('ID interno,Nombre\n1,x'))).toBe(false)
    expect(isZipContainer(new Uint8Array([0x4d, 0x5a]))).toBe(false) // ejecutable
    expect(isZipContainer(new Uint8Array([]))).toBe(false)
  })

  it('un CSV renombrado no pasa del primer control', () => {
    const bytes = new TextEncoder().encode('ID interno,Nombre\nx,y')
    const res = readUpdateSheet(bytes)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe(PARSE_MESSAGES.noZip)
  })
})

// ── Nombres de hoja ─────────────────────────────────────────────────────────

describe('nombres de hoja peligrosos', () => {
  it('reconoce los que envenenarían la cadena de prototipos', () => {
    expect(isDangerousSheetName('__proto__')).toBe(true)
    expect(isDangerousSheetName('  Constructor ')).toBe(true)
    expect(isDangerousSheetName('Proveedores')).toBe(false)
  })
})

// ── Lectura normal ──────────────────────────────────────────────────────────

describe('lectura de una hoja correcta', () => {
  const bytes = libro({
    Proveedores: [
      CABECERA,
      ['11111111-1111-1111-1111-111111111111', 'Agro Lleida SL', 'a@b.com'],
      ['22222222-2222-2222-2222-222222222222', 'Cereales SA', ''],
    ],
  })

  it('devuelve cabeceras y filas alineadas por posición', () => {
    const res = readUpdateSheet(bytes)
    expect(res.ok).toBe(true)
    if (!res.ok) return

    expect(res.sheet.headers).toEqual(CABECERA)
    expect(res.sheet.rows).toHaveLength(2)
    expect(res.sheet.rows[0].cells.map((c) => c.text)).toEqual([
      '11111111-1111-1111-1111-111111111111', 'Agro Lleida SL', 'a@b.com',
    ])
  })

  // La cabecera es la línea 1 para quien mira la hoja en Excel, así que la
  // primera fila de datos tiene que ser la 2.
  it('numera las líneas como las ve Excel', () => {
    const res = readUpdateSheet(bytes)
    if (!res.ok) return
    expect(res.sheet.rows.map((r) => r.line)).toEqual([2, 3])
  })

  it('una fila entera vacía se descarta sin contarla', () => {
    const conHueco = libro({
      Proveedores: [
        CABECERA,
        ['11111111-1111-1111-1111-111111111111', 'Uno', ''],
        [null, null, null],
        ['22222222-2222-2222-2222-222222222222', 'Dos', ''],
      ],
    })
    const res = readUpdateSheet(conHueco)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.sheet.rows).toHaveLength(2)
    expect(res.sheet.rows.map((r) => r.line)).toEqual([2, 4])
  })
})

// ── Una sola hoja ───────────────────────────────────────────────────────────

describe('número de hojas', () => {
  it('rechaza un libro con varias hojas', () => {
    const bytes = libro({
      Proveedores: [CABECERA, ['11111111-1111-1111-1111-111111111111', 'Uno', '']],
      Notas: [['algo']],
    })
    const res = readUpdateSheet(bytes)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe(PARSE_MESSAGES.variasHojas)
  })
})

// ── Rangos declarados ───────────────────────────────────────────────────────

describe('el rango que declara el fichero no se recorre a ciegas', () => {
  // Un `.xlsx` de 3 KB puede decir que ocupa A1:XFD1048576. Sin acotar, el
  // bucle intentaría leer mil millones de celdas inexistentes y el proceso se
  // quedaría girando.
  it('rechaza demasiadas columnas', () => {
    const bytes = libro(
      { Proveedores: [CABECERA, ['x', 'y', 'z']] },
      (sheet) => { sheet['!ref'] = `A1:${XLSX.utils.encode_col(MAX_UPDATE_COLUMNS)}2` },
    )
    const res = readUpdateSheet(bytes)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe(PARSE_MESSAGES.demasiadasColumnas)
  })

  it('rechaza demasiadas filas sin haberlas leído', () => {
    const bytes = libro(
      { Proveedores: [CABECERA, ['x', 'y', 'z']] },
      (sheet) => { sheet['!ref'] = 'A1:C900000' },
    )
    const res = readUpdateSheet(bytes)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe(PARSE_MESSAGES.demasiadasFilas)
  })
})

// ── Hoja sin contenido útil ─────────────────────────────────────────────────

describe('hojas sin nada que leer', () => {
  it('una hoja solo con cabecera no tiene filas', () => {
    const res = readUpdateSheet(libro({ Proveedores: [CABECERA] }))
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toBe(PARSE_MESSAGES.sinFilas)
  })

  it('una hoja sin cabecera se rechaza', () => {
    const res = readUpdateSheet(libro({ Proveedores: [['', '', ''], ['a', 'b', 'c']] }))
    expect(res.ok).toBe(false)
    if (!res.ok) expect([PARSE_MESSAGES.sinCabecera, PARSE_MESSAGES.hojaVacia]).toContain(res.error)
  })
})

// ── Conversión de celdas ────────────────────────────────────────────────────

describe('conversión de celda a texto', () => {
  it('un número se lee por su valor crudo, no por su formato', () => {
    // `w` sería «12.000» con formato de millares: un texto ambiguo que podría
    // leerse como doce coma cero.
    expect(cellToText({ t: 'n', v: 12000, w: '12.000' }).text).toBe('12000')
    expect(cellToText({ t: 'n', v: 41.79 }).text).toBe('41.79')
  })

  it('un booleano se normaliza', () => {
    expect(cellToText({ t: 'b', v: true }).text).toBe('true')
    expect(cellToText({ t: 'b', v: false }).text).toBe('false')
  })

  it('detecta la fórmula sin evaluarla', () => {
    const leida = cellToText({ t: 'n', v: 3, f: 'A1+A2' })
    expect(leida.formula).toBe(true)
    // El valor cacheado se conserva, pero la fila se invalidará más adelante.
    expect(leida.text).toBe('3')
  })

  it('detecta el error de Excel y no devuelve su código', () => {
    const leida = cellToText({ t: 'e', v: 0x17 })
    expect(leida.error).toBe(true)
    expect(leida.text).toBe('')
  })

  it('una celda ausente o rara es simplemente vacía', () => {
    expect(cellToText(undefined).text).toBe('')
    expect(cellToText(null).text).toBe('')
    expect(cellToText('texto suelto').text).toBe('')
    expect(cellToText({ t: 's' }).text).toBe('')
  })

  it('recorta los espacios de los textos', () => {
    expect(cellToText({ t: 's', v: '  Agro Lleida  ' }).text).toBe('Agro Lleida')
  })
})

// ── Vuelta completa con la exportación real ─────────────────────────────────

describe('vuelta completa: se escribe un xlsx y se vuelve a leer', () => {
  it('los UUID y los códigos postales sobreviven como texto', () => {
    const bytes = libro({
      Proveedores: [
        ['ID interno', 'Código postal', 'NIF/CIF'],
        ['11111111-1111-1111-1111-111111111111', '08001', 'B12345678'],
      ],
    })
    const res = readUpdateSheet(bytes)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.sheet.rows[0].cells.map((c) => c.text)).toEqual([
      '11111111-1111-1111-1111-111111111111', '08001', 'B12345678',
    ])
  })
})

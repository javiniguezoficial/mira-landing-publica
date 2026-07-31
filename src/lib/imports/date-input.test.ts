// Fechas de entrada de la importación de precios (034).

import { describe, expect, it } from 'vitest'
import { excelSerialToIso, parseImportDate } from './date-input'

const iso = (raw: string) => parseImportDate(raw).iso

describe('formatos admitidos', () => {
  it('el oficial de la plantilla', () => {
    expect(iso('2024-01-01')).toBe('2024-01-01')
    expect(iso('2026-07-27')).toBe('2026-07-27')
  })

  // El formato del fichero real que provocó el diagnóstico.
  it('DD/MM/AAAA', () => {
    expect(iso('01/01/2024')).toBe('2024-01-01')
    expect(iso('27/07/2026')).toBe('2026-07-27')
    expect(iso('31/12/2025')).toBe('2025-12-31')
  })

  it('D/M/AAAA sin ceros a la izquierda', () => {
    expect(iso('1/1/2024')).toBe('2024-01-01')
    expect(iso('9/3/2026')).toBe('2026-03-09')
  })

  it('ISO con un solo dígito también se normaliza', () => {
    expect(iso('2024-1-1')).toBe('2024-01-01')
  })

  it('vacío no es error, es ausencia', () => {
    expect(parseImportDate('')).toEqual({ iso: null })
    expect(parseImportDate(null)).toEqual({ iso: null })
  })
})

describe('el formato estadounidense no se acepta', () => {
  // Con `01/02/2024` delante no hay forma de saber si es el 1 de febrero o el 2
  // de enero. Se elige la lectura europea y se mantiene siempre.
  it('el primer número es SIEMPRE el día', () => {
    expect(iso('01/02/2024')).toBe('2024-02-01')
  })

  it('un mes mayor que 12 se denuncia explícitamente', () => {
    const r = parseImportDate('01/13/2024')
    expect(r.iso).toBeNull()
    expect(r.error).toContain('mes/día/año')
  })
})

describe('fechas que no existen', () => {
  it('29 de febrero en año bisiesto sí existe', () => {
    expect(iso('29/02/2024')).toBe('2024-02-29')
    expect(iso('2024-02-29')).toBe('2024-02-29')
  })

  it('29 de febrero en año normal no', () => {
    expect(parseImportDate('29/02/2023').iso).toBeNull()
    expect(parseImportDate('2023-02-29').iso).toBeNull()
  })

  it('31 de un mes de 30 días', () => {
    expect(parseImportDate('31/04/2024').iso).toBeNull()
  })

  it('día o mes cero', () => {
    expect(parseImportDate('00/01/2024').iso).toBeNull()
    expect(parseImportDate('2024-00-10').iso).toBeNull()
  })

  it('texto', () => {
    const r = parseImportDate('27 de julio')
    expect(r.iso).toBeNull()
    expect(r.error).toContain('Formatos admitidos')
  })
})

describe('fecha serial de Excel', () => {
  // 45292 es el 1 de enero de 2024 contando desde el 30/12/1899, que es la base
  // real de Excel una vez descontado su 29 de febrero de 1900 inexistente.
  it('convierte el serial a fecha civil', () => {
    expect(excelSerialToIso(45292)).toBe('2024-01-01')
    expect(iso('45292')).toBe('2024-01-01')
  })

  it('ignora la parte horaria', () => {
    expect(excelSerialToIso(45292.75)).toBe('2024-01-01')
  })

  it('rechaza seriales fuera del rango admitido', () => {
    expect(excelSerialToIso(1)).toBeNull()          // 1899
    expect(excelSerialToIso(9_999_999)).toBeNull()  // muy lejos de 2100
  })

  // Un precio como «285» está en otra columna, pero si alguien lo pega en la de
  // fecha no puede convertirse en el año 1900.
  it('un número pequeño no se lee como fecha', () => {
    expect(parseImportDate('285').iso).toBeNull()
  })

  // `20240101` se parece demasiado a un serial y las dos lecturas darían fechas
  // distintas, así que no se acepta ninguna.
  it('una fecha sin separadores no se adivina', () => {
    expect(parseImportDate('20240101').iso).toBeNull()
  })
})

describe('zona horaria', () => {
  // El cálculo va entero en UTC. Con aritmética local, un contenedor en UTC+2 y
  // otro en UTC-5 podrían discrepar en el día para el mismo texto.
  it('el resultado no depende del huso del servidor', () => {
    const original = process.env.TZ

    const leer = (tz: string) => {
      process.env.TZ = tz
      return [iso('01/01/2024'), excelSerialToIso(45292), iso('2024-12-31')]
    }

    const madrid = leer('Europe/Madrid')
    const auckland = leer('Pacific/Auckland')
    const honolulu = leer('Pacific/Honolulu')

    process.env.TZ = original

    expect(madrid).toEqual(['2024-01-01', '2024-01-01', '2024-12-31'])
    expect(auckland).toEqual(madrid)
    expect(honolulu).toEqual(madrid)
  })

  it('el cambio de año no se desplaza', () => {
    expect(iso('31/12/2024')).toBe('2024-12-31')
    expect(iso('01/01/2025')).toBe('2025-01-01')
  })
})

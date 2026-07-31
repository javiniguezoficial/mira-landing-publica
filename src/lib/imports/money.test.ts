// Importes de la importación de precios (034).
//
// El error que se está evitando aquí no lanza ninguna excepción: guarda un
// precio mil veces más pequeño y lo pinta como una caída del 99,9 %.

import { describe, expect, it } from 'vitest'
import { parseMoney } from './money'

const valor = (raw: string) => parseMoney(raw).value

describe('formatos sin ambigüedad', () => {
  it('entero', () => {
    expect(valor('285')).toBe(285)
  })

  it('decimal con punto', () => {
    expect(valor('285.00')).toBe(285)
    expect(valor('241.5')).toBe(241.5)
  })

  // El formato con el que Excel en español guarda cualquier precio.
  it('decimal con coma', () => {
    expect(valor('285,00')).toBe(285)
    expect(valor('241,5')).toBe(241.5)
  })

  it('miles europeos con decimal', () => {
    expect(valor('1.285,50')).toBe(1285.5)
    expect(valor('12.345.678,90')).toBe(12345678.9)
  })

  it('miles internacionales con decimal', () => {
    expect(valor('1,285.50')).toBe(1285.5)
    expect(valor('12,345,678.90')).toBe(12345678.9)
  })

  it('miles repetidos sin decimales', () => {
    expect(valor('1.285.500')).toBe(1285500)
    expect(valor('1,285,500')).toBe(1285500)
  })
})

describe('moneda dentro del importe', () => {
  // El valor exacto del fichero real que provocó el diagnóstico.
  it('«285,00 €» se lee como 285 en euros', () => {
    const r = parseMoney('285,00 €')
    expect(r.value).toBe(285)
    expect(r.currency).toBe('EUR')
  })

  it('el símbolo puede ir delante', () => {
    const r = parseMoney('€ 1.285,50')
    expect(r.value).toBe(1285.5)
    expect(r.currency).toBe('EUR')
  })

  it('acepta el código ISO', () => {
    const r = parseMoney('1,285.50 USD')
    expect(r.value).toBe(1285.5)
    expect(r.currency).toBe('USD')
  })

  it('acepta la libra', () => {
    expect(parseMoney('£285.00').currency).toBe('GBP')
  })

  it('sin moneda no inventa ninguna', () => {
    expect(parseMoney('285,00').currency).toBeNull()
  })

  it('dos monedas distintas es un error', () => {
    const r = parseMoney('285 € USD')
    expect(r.value).toBeNull()
    expect(r.error).toContain('más de una moneda')
  })
})

describe('lo que se rechaza por ambiguo', () => {
  // `1.285` es mil doscientos ochenta y cinco o uno coma dos ocho cinco. No hay
  // forma de saberlo, así que no se adivina: se pide que se escriba mejor.
  it('un separador suelto seguido de tres cifras', () => {
    for (const raw of ['1.285', '1,285', '12.345', '999,999']) {
      const r = parseMoney(raw)
      expect(r.value, `«${raw}» debería rechazarse`).toBeNull()
      expect(r.error).toContain('ambiguo')
    }
  })

  // En cambio dos o cuatro decimales no tienen ninguna duda.
  it('pero no cuando los decimales son dos o cuatro', () => {
    expect(valor('1.28')).toBe(1.28)
    expect(valor('1,28')).toBe(1.28)
    expect(valor('1.2854')).toBe(1.2854)
  })

  it('miles mal agrupados', () => {
    const r = parseMoney('1.2385,50')
    expect(r.value).toBeNull()
    expect(r.error).toContain('miles')
  })

  it('separador decimal repetido', () => {
    expect(parseMoney('1.285.50,25').value).toBeNull()
  })
})

describe('lo que no es un número', () => {
  it('texto', () => {
    expect(parseMoney('gratis').value).toBeNull()
    expect(parseMoney('285 kg').value).toBeNull()
  })

  it('vacío no es error, es ausencia', () => {
    expect(parseMoney('')).toEqual({ value: null, currency: null })
    expect(parseMoney(null)).toEqual({ value: null, currency: null })
    expect(parseMoney('   ').value).toBeNull()
  })

  it('notación científica', () => {
    expect(parseMoney('1e5').value).toBeNull()
  })

  it('infinito y NaN no pueden colarse', () => {
    expect(parseMoney('Infinity').value).toBeNull()
    expect(parseMoney('NaN').value).toBeNull()
  })
})

describe('signo', () => {
  // Se devuelve el negativo: quién decide si vale es la regla de negocio, y el
  // precio la rechaza por otro sitio con un mensaje mejor.
  it('conserva el negativo', () => {
    expect(valor('-5')).toBe(-5)
    expect(valor('-1.285,50')).toBe(-1285.5)
  })
})

describe('espacios de Excel', () => {
  it('quita el espacio fino y el duro', () => {
    expect(valor('1 285,50')).toBe(1285.5)
    expect(valor(' 285,00 ')).toBe(285)
  })
})

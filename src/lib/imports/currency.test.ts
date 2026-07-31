// Monedas de la importación de precios (034).

import { describe, expect, it } from 'vitest'
import {
  CURRENCY_SYMBOL,
  IMPORT_CURRENCIES,
  currencyHelpText,
  extractCurrency,
  isImportCurrency,
  parseCurrency,
} from './currency'

describe('allowlist', () => {
  // El fallo que se corrige: la lista se derivaba de los 608 registros
  // históricos, todos EUR, así que USD «no estaba reconocida».
  it('admite las tres monedas del bloque', () => {
    expect([...IMPORT_CURRENCIES]).toEqual(['EUR', 'USD', 'GBP'])
  })

  it('cada moneda tiene símbolo', () => {
    for (const c of IMPORT_CURRENCIES) expect(CURRENCY_SYMBOL[c]).toBeTruthy()
  })

  it('isImportCurrency solo acepta códigos exactos en mayúsculas', () => {
    expect(isImportCurrency('EUR')).toBe(true)
    expect(isImportCurrency('eur')).toBe(false)
    expect(isImportCurrency('BTC')).toBe(false)
  })

  it('el texto de ayuda nombra código y símbolo', () => {
    expect(currencyHelpText()).toContain('EUR (€)')
    expect(currencyHelpText()).toContain('USD ($)')
    expect(currencyHelpText()).toContain('GBP (£)')
  })
})

describe('parseCurrency', () => {
  it('acepta el código ISO en cualquier caja', () => {
    expect(parseCurrency('EUR')).toBe('EUR')
    expect(parseCurrency('usd')).toBe('USD')
    expect(parseCurrency(' Gbp ')).toBe('GBP')
  })

  it('acepta los símbolos', () => {
    expect(parseCurrency('€')).toBe('EUR')
    expect(parseCurrency('$')).toBe('USD')
    expect(parseCurrency('£')).toBe('GBP')
  })

  it('rechaza lo que no está en la tabla', () => {
    for (const raw of ['BTC', 'CHF', 'c€', 'euro$', '', '   ']) {
      expect(parseCurrency(raw), `«${raw}» no debería reconocerse`).toBeNull()
    }
  })

  // `c€/Kg` son céntimos de euro y existen 2 productos configurados así.
  // Tratarlos como EUR multiplicaría el precio por cien.
  it('«c€» NO es euro', () => {
    expect(parseCurrency('c€')).toBeNull()
  })
})

describe('extractCurrency', () => {
  it('encuentra el símbolo detrás del número', () => {
    const r = extractCurrency('285,00 €')
    expect(r.currency).toBe('EUR')
    expect(r.rest).toBe('285,00')
    expect(r.ambiguous).toBe(false)
  })

  it('encuentra el símbolo delante', () => {
    expect(extractCurrency('€ 285,00').currency).toBe('EUR')
    expect(extractCurrency('$1,285.50').rest).toBe('1,285.50')
  })

  it('encuentra el código ISO', () => {
    const r = extractCurrency('1,285.50 USD')
    expect(r.currency).toBe('USD')
    expect(r.rest).toBe('1,285.50')
  })

  it('sin moneda devuelve el texto intacto', () => {
    const r = extractCurrency('285.00')
    expect(r.currency).toBeNull()
    expect(r.rest).toBe('285.00')
  })

  // Elegir una de las dos en silencio guardaría la serie bajo la divisa
  // equivocada sin que nadie lo notara hasta comparar con la fuente.
  it('dos monedas distintas es ambiguo, no se elige una', () => {
    const r = extractCurrency('285 € USD')
    expect(r.ambiguous).toBe(true)
    expect(r.currency).toBeNull()
  })

  it('el mismo símbolo repetido no es ambiguo', () => {
    expect(extractCurrency('€ 285 €').ambiguous).toBe(false)
    expect(extractCurrency('€ 285 €').currency).toBe('EUR')
  })

  // Los códigos se buscan como palabra: si no, cualquier texto con «eur»
  // dentro se leería como una moneda.
  it('no confunde un código dentro de otra palabra', () => {
    expect(extractCurrency('USDA 285').currency).toBeNull()
    expect(extractCurrency('285 eurodiputados').currency).toBeNull()
  })
})

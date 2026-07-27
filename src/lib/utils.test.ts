import { describe, it, expect } from 'vitest'
import { formatNumber, unitLabel, currencySymbol, formatPrice } from '@/lib/utils'

// Estos helpers formatean todas las cifras de dashboards, tablas de precios y
// fichas de proveedor. Un cambio silencioso en su salida (separadores, símbolo
// de moneda o etiqueta de unidad) se propaga a toda la interfaz sin romper el
// build ni TypeScript, así que es justo lo que conviene fijar con tests.

describe('formatNumber', () => {
  it('formatea con punto de miles y coma decimal (convención ES)', () => {
    expect(formatNumber(1234.56, 2)).toBe('1.234,56')
    expect(formatNumber(1303.5, 2)).toBe('1.303,50')
  })

  it('agrupa desde el millar y respeta 0 decimales por defecto', () => {
    // Se usa el locale de-DE precisamente porque agrupa desde 1.000,
    // mientras que es-ES (CLDR) solo agrupa a partir de 10.000.
    expect(formatNumber(1000)).toBe('1.000')
    expect(formatNumber(999)).toBe('999')
    expect(formatNumber(12288)).toBe('12.288')
  })

  it('caso límite: el cero es un valor válido, no un vacío', () => {
    // Importante: `0` es falsy. Si la guarda se escribiera como `if (!value)`
    // en lugar de `value == null`, este caso devolvería '—' y ocultaría datos
    // reales (un precio o una producción de 0).
    expect(formatNumber(0)).toBe('0')
    expect(formatNumber(0, 2)).toBe('0,00')
  })

  it('caso inválido: null, undefined y NaN se muestran como guion', () => {
    expect(formatNumber(null)).toBe('—')
    expect(formatNumber(undefined)).toBe('—')
    expect(formatNumber(Number.NaN)).toBe('—')
  })
})

describe('unitLabel', () => {
  it('normaliza los códigos almacenados a su etiqueta de presentación', () => {
    expect(unitLabel('ton')).toBe('TN')
    expect(unitLabel('l')).toBe('litro')
    expect(unitLabel('ud')).toBe('unidades')
  })

  it('caso límite: tolera mayúsculas y espacios sobrantes', () => {
    // Los datos llegan por importación CSV/XLSX, donde el usuario puede
    // escribir " TON " o "Litros".
    expect(unitLabel(' TON ')).toBe('TN')
    expect(unitLabel('Litros')).toBe('litro')
  })

  it('deja pasar sin tocar las unidades no mapeadas', () => {
    // 'kg' y 'MWh' son unidades reales en la base de datos que no están en el
    // mapa porque ya se muestran tal cual.
    expect(unitLabel('kg')).toBe('kg')
    expect(unitLabel('MWh')).toBe('MWh')
  })

  it('caso inválido: sin unidad devuelve cadena vacía, no "undefined"', () => {
    expect(unitLabel(null)).toBe('')
    expect(unitLabel(undefined)).toBe('')
    expect(unitLabel('')).toBe('')
  })
})

describe('currencySymbol', () => {
  it('convierte el código ISO en símbolo', () => {
    expect(currencySymbol('EUR')).toBe('€')
    expect(currencySymbol('USD')).toBe('$')
    expect(currencySymbol('GBP')).toBe('£')
  })

  it('caso límite: normaliza minúsculas y espacios', () => {
    expect(currencySymbol(' usd ')).toBe('$')
  })

  it('caso inválido: código desconocido se muestra tal cual; sin código, euro', () => {
    // Preferible mostrar 'JPY' que un símbolo incorrecto.
    expect(currencySymbol('JPY')).toBe('JPY')
    expect(currencySymbol(null)).toBe('€')
    expect(currencySymbol(undefined)).toBe('€')
  })
})

describe('formatPrice', () => {
  it('compone importe + símbolo + unidad normalizada', () => {
    expect(formatPrice(1234.56, { unit: 'kg' })).toBe('1.234,56 €/kg')
    // La unidad pasa por unitLabel: 'ton' se presenta como 'TN'.
    expect(formatPrice(1234.56, { unit: 'ton' })).toBe('1.234,56 €/TN')
    expect(formatPrice(10, { unit: 'kg', currency: 'USD' })).toBe('10,00 $/kg')
  })

  it('caso límite: sin unidad omite la barra, y aplica 2 decimales por defecto', () => {
    expect(formatPrice(10)).toBe('10,00 €')
    expect(formatPrice(0, { unit: 'kg' })).toBe('0,00 €/kg')
  })

  it('caso inválido: sin importe devuelve solo el guion, sin moneda ni unidad', () => {
    // No debe producir '— €/kg': el guion viaja solo.
    expect(formatPrice(null, { unit: 'kg' })).toBe('—')
    expect(formatPrice(undefined)).toBe('—')
  })
})

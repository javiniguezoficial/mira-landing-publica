import { describe, it, expect } from 'vitest'
import {
  formatNumber,
  unitLabel,
  currencySymbol,
  formatPrice,
  isNonMonetaryUnit,
  magnitudeLabel,
} from '@/lib/utils'

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
    // 037 — la canónica del índice adimensional pasa a ser «Unidades», que es
    // como se lee en pantalla: «123,45 Unidades».
    expect(unitLabel('ud')).toBe('Unidades')
    expect(unitLabel('unidad')).toBe('Unidades')
    expect(unitLabel('unidades')).toBe('Unidades')
    expect(unitLabel('%')).toBe('%')
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

  it('caso inválido: código desconocido se muestra tal cual', () => {
    // Preferible mostrar 'JPY' que un símbolo incorrecto.
    expect(currencySymbol('JPY')).toBe('JPY')
  })

  // 037 — REGRESIÓN. Antes devolvía '€' sin código: suponía euros. Eso es lo
  // que pintaba un símbolo de moneda sobre el IPC y sobre los índices FAO, que
  // no están en ninguna divisa.
  it('sin código NO supone euros: devuelve cadena vacía', () => {
    expect(currencySymbol(null)).toBe('')
    expect(currencySymbol(undefined)).toBe('')
    expect(currencySymbol('')).toBe('')
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

// ═══════════════════════════════════════════════════════════════════════════
// INDICADORES MONETARIOS Y NO MONETARIOS (037)
// ═══════════════════════════════════════════════════════════════════════════
//
// Market Intelligence deja de ser solo precios. Conviven tres tipos de valor y
// se distinguen ÚNICAMENTE por la unidad:
//
//   A. precio      EUR/USD/GBP + «100 kg», «ton», «MWh»
//   B. porcentaje  sin moneda  + «%»          → IPC, IPRI, tasa de paro
//   C. índice      sin moneda  + «Unidades»   → índices FAO

describe('isNonMonetaryUnit', () => {
  it('reconoce el porcentaje y el índice', () => {
    expect(isNonMonetaryUnit('%')).toBe(true)
    expect(isNonMonetaryUnit('Unidades')).toBe(true)
  })

  // El histórico ha usado las tres grafías para lo mismo. Ninguna puede acabar
  // exigiendo una moneda que no existe.
  it('tolera las grafías antiguas del índice', () => {
    for (const u of ['unidades', 'unidad', ' UNIDADES ', 'ud', 'uds']) {
      expect(isNonMonetaryUnit(u), `«${u}»`).toBe(true)
    }
  })

  it('las unidades de medida física SÍ llevan moneda', () => {
    for (const u of ['kg', '100 kg', 'ton', 'MWh', 'hl', '100 docenas', 'cabeza']) {
      expect(isNonMonetaryUnit(u), `«${u}»`).toBe(false)
    }
  })

  it('sin unidad no se decide nada', () => {
    expect(isNonMonetaryUnit(null)).toBe(false)
    expect(isNonMonetaryUnit(undefined)).toBe(false)
    expect(isNonMonetaryUnit('')).toBe(false)
  })
})

describe('magnitudeLabel', () => {
  it('A. precio: símbolo + medida', () => {
    expect(magnitudeLabel('EUR', '100 kg')).toBe('€/100 kg')
    expect(magnitudeLabel('USD', 'ton')).toBe('$/TN')
    expect(magnitudeLabel('GBP', 'ton')).toBe('£/TN')
  })

  it('B. porcentaje: solo el signo, sin moneda', () => {
    expect(magnitudeLabel(null, '%')).toBe('%')
  })

  it('C. índice: solo la unidad, sin moneda', () => {
    expect(magnitudeLabel(null, 'Unidades')).toBe('Unidades')
    expect(magnitudeLabel(null, 'unidad')).toBe('Unidades')
  })

  // Aunque la fila traiga EUR por error, un porcentaje no se enseña en euros.
  it('con unidad no monetaria IGNORA la moneda venga como venga', () => {
    expect(magnitudeLabel('EUR', '%')).toBe('%')
    expect(magnitudeLabel('USD', 'Unidades')).toBe('Unidades')
  })

  it('sin moneda y con medida física enseña solo la medida', () => {
    expect(magnitudeLabel(null, 'ton')).toBe('TN')
  })
})

describe('formatPrice con indicadores', () => {
  it('B. porcentaje: «2,5 %»', () => {
    expect(formatPrice(2.5, { unit: '%', currency: null, decimals: 1 })).toBe('2,5 %')
  })

  it('B. porcentaje negativo: «-1,2 %»', () => {
    expect(formatPrice(-1.2, { unit: '%', currency: null, decimals: 1 })).toBe('-1,2 %')
  })

  it('C. índice: «123,45 Unidades»', () => {
    expect(formatPrice(123.45, { unit: 'Unidades', currency: null })).toBe('123,45 Unidades')
  })

  // REGRESIÓN: el fallo que motiva el bloque. Antes, sin moneda, se suponía EUR
  // y las tarjetas del IPC decían «2,50 €».
  it('sin moneda NO inventa el euro', () => {
    expect(formatPrice(2.5, { unit: '%', currency: null })).not.toContain('€')
    expect(formatPrice(123.45, { unit: 'Unidades', currency: null })).not.toContain('€')
    expect(formatPrice(99, { unit: 'ton', currency: null })).not.toContain('€')
  })

  it('con unidad no monetaria ignora una moneda escrita por error', () => {
    expect(formatPrice(2.5, { unit: '%', currency: 'EUR', decimals: 1 })).toBe('2,5 %')
  })

  it('A. los precios de siempre no cambian', () => {
    expect(formatPrice(1234.56, { unit: '100 kg', currency: 'EUR' })).toBe('1.234,56 €/100 kg')
    expect(formatPrice(1234.56, { unit: 'ton', currency: 'USD' })).toBe('1.234,56 $/TN')
    expect(formatPrice(1234.56, { unit: 'ton', currency: 'GBP' })).toBe('1.234,56 £/TN')
    expect(formatPrice(10)).toBe('10,00 €')
  })

  it('un valor ausente sigue siendo un guion, sea cual sea la magnitud', () => {
    expect(formatPrice(null, { unit: '%', currency: null })).toBe('—')
    expect(formatPrice(undefined, { unit: 'Unidades', currency: null })).toBe('—')
  })
})

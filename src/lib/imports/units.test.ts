// Unidades de la importación de precios (034).
//
// Lo que se fija aquí es la frontera entre MONEDA y MEDIDA. Confundirlas no da
// un error visible: da una serie multiplicada por cien.

import { describe, expect, it } from 'vitest'
import {
  CANONICAL_MEASURES,
  canonicalMeasure,
  formatUnitLabel,
  measureKey,
  parseUnitExpression,
} from './units'

describe('medidas canónicas', () => {
  // Las canónicas coinciden con lo que YA hay guardado. Cambiarlas partiría las
  // series históricas en dos.
  it('conserva las que existen en el histórico', () => {
    for (const m of ['ton', 'kg', 'MWh', 'unidad']) {
      expect(CANONICAL_MEASURES as readonly string[]).toContain(m)
    }
  })

  it('reconoce las formas habituales de la tonelada', () => {
    for (const raw of ['ton', 'TN', 'Tn', 'tn', 't', 'Tonelada', 'toneladas', 'TM']) {
      expect(canonicalMeasure(raw), `«${raw}»`).toBe('ton')
    }
  })

  it('reconoce «100 kg» escrito de varias formas', () => {
    for (const raw of ['100 kg', '100 Kg', '100KG', '100kg', ' 100  kg ']) {
      expect(canonicalMeasure(raw), `«${raw}»`).toBe('100 kg')
    }
  })

  // El histórico guarda «Unidades», «unidad» y «unidades» para el MISMO
  // producto. Sin unificarlas, una reimportación no vería sus duplicados.
  it('las tres grafías de unidad son la misma medida', () => {
    expect(canonicalMeasure('Unidades')).toBe('unidad')
    expect(canonicalMeasure('unidades')).toBe('unidad')
    expect(canonicalMeasure('unidad')).toBe('unidad')
  })

  it('rechaza lo que no conoce', () => {
    for (const raw of ['sacos', 'palés', 'kilogramo cúbico', '']) {
      expect(canonicalMeasure(raw), `«${raw}»`).toBeNull()
    }
  })

  it('measureKey separa el número de la letra', () => {
    expect(measureKey('100Kg')).toBe('100 kg')
    expect(measureKey('  100   KG ')).toBe('100 kg')
  })
})

describe('expresiones combinadas', () => {
  // El caso que provocó el diagnóstico: la ficha del producto dice «€/100 Kg» y
  // el importador respondía «Unidad no reconocida: €/100 kg».
  it('parte «€/100 Kg» en moneda y medida', () => {
    expect(parseUnitExpression('€/100 Kg')).toEqual({ currency: 'EUR', measure: '100 kg' })
  })

  it('acepta el código ISO como prefijo', () => {
    expect(parseUnitExpression('EUR/100 kg')).toEqual({ currency: 'EUR', measure: '100 kg' })
    expect(parseUnitExpression('USD/100 kg')).toEqual({ currency: 'USD', measure: '100 kg' })
    expect(parseUnitExpression('GBP/TN')).toEqual({ currency: 'GBP', measure: 'ton' })
  })

  it('lee las expresiones reales del catálogo', () => {
    expect(parseUnitExpression('€/TN')).toEqual({ currency: 'EUR', measure: 'ton' })
    expect(parseUnitExpression('€/Kg')).toEqual({ currency: 'EUR', measure: 'kg' })
    expect(parseUnitExpression('€/MWh')).toEqual({ currency: 'EUR', measure: 'MWh' })
    expect(parseUnitExpression('$/BRT')).toEqual({ currency: 'USD', measure: 'BRT' })
    expect(parseUnitExpression('€/100 docenas')).toEqual({ currency: 'EUR', measure: '100 docenas' })
  })

  it('una medida suelta no lleva moneda', () => {
    expect(parseUnitExpression('100 kg')).toEqual({ currency: null, measure: '100 kg' })
    expect(parseUnitExpression('ton')).toEqual({ currency: null, measure: 'ton' })
  })

  it('vacío no es un error, es ausencia', () => {
    expect(parseUnitExpression('')).toEqual({ currency: null, measure: null })
    expect(parseUnitExpression(null)).toEqual({ currency: null, measure: null })
  })

  // 2 productos están configurados en céntimos de euro. Aceptarlo como EUR
  // multiplicaría el precio por cien sin avisar.
  it('rechaza «c€/Kg»: los céntimos no son una moneda admitida', () => {
    const r = parseUnitExpression('c€/Kg')
    expect(r.measure).toBeNull()
    expect(r.error).toContain('moneda')
  })

  it('rechaza una medida desconocida detrás de la barra', () => {
    const r = parseUnitExpression('€/sacos')
    expect(r.currency).toBe('EUR')
    expect(r.measure).toBeNull()
    expect(r.error).toContain('medida')
  })

  it('una moneda suelta no es una unidad', () => {
    const r = parseUnitExpression('EUR')
    expect(r.measure).toBeNull()
    expect(r.error).toContain('no una unidad de medida')
  })

  it('«mw/h» es una medida con barra, no una moneda partida', () => {
    expect(parseUnitExpression('mw/h')).toEqual({ currency: null, measure: 'MWh' })
  })
})

describe('etiqueta visible', () => {
  // El símbolo se compone a partir de las DOS columnas: nunca se lee de un
  // texto guardado. Es lo que permite etiquetar «$/ton» sin que nadie lo escriba.
  it('compone el símbolo de la moneda con la medida', () => {
    expect(formatUnitLabel('EUR', '100 kg')).toBe('€/100 kg')
    expect(formatUnitLabel('USD', 'ton')).toBe('$/ton')
    expect(formatUnitLabel('GBP', 'ton')).toBe('£/ton')
  })

  it('aguanta que falte una de las dos', () => {
    expect(formatUnitLabel(null, 'kg')).toBe('kg')
    expect(formatUnitLabel('EUR', null)).toBe('€')
  })
})

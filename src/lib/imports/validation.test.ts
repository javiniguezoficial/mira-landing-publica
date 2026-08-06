// Validación de filas de la importación masiva (2.5, reescrita en 034).
//
// De estas reglas depende que no se corrompa el histórico de precios, así que
// se prueban sobre un catálogo controlado y sin tocar la base de datos.

import { describe, expect, it } from 'vitest'
import { resolveImportPeriod } from './period'
import {
  flagConflictingDuplicates,
  naturalKey,
  normalizeLonjaKey,
  normalizeLonjaValue,
  parseDecimal,
  summarize,
  validateHeaders,
  validateRow,
  type CatalogProduct,
  type ValidationCatalog,
} from './validation'

const SEMANA = resolveImportPeriod({ type: 'week', year: 2026, week: 31 }).range!

/** Configurado en toneladas, con lonja de referencia. */
const TRIGO: CatalogProduct = {
  productId: 'p-trigo', productSlug: 'trigo', productName: 'Trigo blando',
  marketId: 'm-cereales', marketSlug: 'cereales', marketName: 'Cereales',
  lonja: 'Mercolleida', unit: '€/TN',
}
/** Sin lonja y sin unidad configuradas: el caso límite del modelo. */
const CEBADA: CatalogProduct = {
  productId: 'p-cebada', productSlug: 'cebada', productName: 'Cebada',
  marketId: 'm-cereales', marketSlug: 'cereales', marketName: 'Cereales',
  lonja: null, unit: null,
}
/** El caso real del diagnóstico: la ficha dice «€/100 Kg». */
const POLLO: CatalogProduct = {
  productId: 'p-pollo', productSlug: 'pollo', productName: 'Pollo Vivo',
  marketId: 'm-aves', marketSlug: 'aves', marketName: 'Aves',
  lonja: 'España', unit: '€/100 Kg',
}

function catalogo(overrides: Partial<ValidationCatalog> = {}): ValidationCatalog {
  return {
    products: new Map([
      ['cereales::trigo', TRIGO],
      ['cereales::cebada', CEBADA],
      ['aves::pollo', POLLO],
    ]),
    marketSlugs: new Set(['cereales', 'porcino', 'aves']),
    existingKeys: new Set<string>(),
    ...overrides,
  }
}

function fila(over: Record<string, string> = {}): Record<string, string> {
  return {
    market_slug: 'cereales',
    product_slug: 'trigo',
    recorded_at: '2026-07-27',
    price: '241.50',
    currency: 'EUR',
    unit: 'ton',
    ...over,
  }
}

/** Fila del producto configurado en «€/100 Kg», como el fichero real. */
function filaPollo(over: Record<string, string> = {}): Record<string, string> {
  return {
    market_slug: 'aves',
    product_slug: 'pollo',
    recorded_at: '01/01/2026',
    price: '285,00 €',
    currency: 'EUR',
    unit: '€/100 Kg',
    ...over,
  }
}

const ENERO = resolveImportPeriod({ type: 'year', year: 2026 }).range!

function validar(raw: Record<string, string>, cat = catalogo(), seen = new Set<string>()) {
  return validateRow(2, raw, cat, SEMANA, seen)
}

// ── Números ─────────────────────────────────────────────────────────────────

describe('parseDecimal', () => {
  it('acepta punto y coma decimal', () => {
    expect(parseDecimal('241.50')).toBe(241.5)
    expect(parseDecimal('241,50')).toBe(241.5)
  })

  // 034 — antes esto era `null` por «ambiguo». Ahora la regla es determinista:
  // con dos separadores distintos, el último es el decimal.
  it('resuelve los miles en lugar de rechazarlos', () => {
    expect(parseDecimal('1.482,5')).toBe(1482.5)
    expect(parseDecimal('1,482.5')).toBe(1482.5)
  })

  it('sigue rechazando lo genuinamente ambiguo', () => {
    expect(parseDecimal('1.482')).toBeNull()
  })

  it('rechaza lo que no es un número', () => {
    for (const raw of ['', '  ', 'abc', '12e4']) {
      expect(parseDecimal(raw), `«${raw}»`).toBeNull()
    }
  })
})

// ── Cabecera ────────────────────────────────────────────────────────────────

describe('validateHeaders', () => {
  const completa = ['market_slug', 'product_slug', 'recorded_at', 'price', 'currency', 'unit']

  it('acepta la cabecera oficial', () => {
    expect(validateHeaders(completa).ok).toBe(true)
  })

  it('detecta las columnas obligatorias que faltan', () => {
    const r = validateHeaders(['market_slug', 'price'])
    expect(r.ok).toBe(false)
    expect(r.missing).toContain('product_slug')
  })

  it('las columnas desconocidas avisan pero no bloquean', () => {
    const r = validateHeaders([...completa, 'mi_columna_interna'])
    expect(r.ok).toBe(true)
    expect(r.unknown).toEqual(['mi_columna_interna'])
  })
})

// ── Resolución de entidades ─────────────────────────────────────────────────

describe('resolución de mercado y producto', () => {
  it('resuelve por slug exacto', () => {
    const r = validar(fila())
    expect(r.status).toBe('valid')
    expect(r.productId).toBe('p-trigo')
  })

  it('mercado inexistente: lo dice del mercado', () => {
    const r = validar(fila({ market_slug: 'inventado' }))
    expect(r.errors[0].column).toBe('market_slug')
  })

  it('producto que no pertenece a ese mercado: lo dice del producto', () => {
    const r = validar(fila({ market_slug: 'porcino', product_slug: 'trigo' }))
    expect(r.errors[0].column).toBe('product_slug')
  })

  it('no hace búsqueda difusa', () => {
    expect(validar(fila({ product_slug: 'trig' })).status).toBe('invalid')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// LONJA — el cambio de modelo de 034
// ═══════════════════════════════════════════════════════════════════════════

describe('lonja', () => {
  // ANTES esto era un error: «La lonja no coincide: el producto es de
  // Mercolleida y el archivo dice Lonja de Binéfar». Con una referencia que
  // cotiza en cinco plazas, cuatro de cada cinco filas se perdían.
  it('la lonja del archivo MANDA sobre la del producto', () => {
    const r = validar(fila({ lonja: 'Lonja de Binéfar' }))
    expect(r.status).toBe('valid')
    expect(r.lonja).toBe('Lonja de Binéfar')
    expect(r.lonjaSource).toBe('file')
  })

  it('sin lonja en el archivo se hereda la del producto', () => {
    const r = validar(fila())
    expect(r.status).toBe('valid')
    expect(r.lonja).toBe('Mercolleida')
    expect(r.lonjaSource).toBe('product')
  })

  it('producto sin lonja y archivo con lonja: vale la del archivo', () => {
    const r = validar(fila({ product_slug: 'cebada', unit: 'kg', lonja: 'Zaragoza' }))
    expect(r.status).toBe('valid')
    expect(r.lonja).toBe('Zaragoza')
  })

  // Sin lonja no se pueden distinguir dos precios del mismo día, y la clave
  // natural dejaría de proteger nada.
  it('ni en el archivo ni en el producto: error', () => {
    const r = validar(fila({ product_slug: 'cebada', unit: 'kg' }))
    expect(r.status).toBe('invalid')
    expect(r.errors.some((e) => e.column === 'lonja')).toBe(true)
  })

  it('varias lonjas para la misma referencia y el mismo día conviven', () => {
    const seen = new Set<string>()
    const cat = catalogo()
    for (const plaza of ['España', 'Alemania', 'Bélgica', 'Italia', 'Europa']) {
      const r = validateRow(2, fila({ lonja: plaza }), cat, SEMANA, seen)
      expect(r.status, `la plaza «${plaza}» debería entrar`).toBe('valid')
    }
  })

  it('se limpian los espacios pero no se fusionan nombres', () => {
    expect(normalizeLonjaValue('  España  ')).toBe('España')
    expect(normalizeLonjaValue('')).toBeNull()
    expect(normalizeLonjaKey(' ESPAÑA ')).toBe('espana')
    // «Lérida» y «Lleida» son dos plazas distintas y lo siguen siendo.
    expect(normalizeLonjaKey('Lérida')).not.toBe(normalizeLonjaKey('Lleida'))
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// FECHAS
// ═══════════════════════════════════════════════════════════════════════════

describe('fecha', () => {
  it('acepta el formato oficial', () => {
    expect(validar(fila({ recorded_at: '2026-08-02' })).status).toBe('valid')
  })

  // 034 — antes: «Fecha no válida: 27/07/2026. Formato esperado AAAA-MM-DD».
  it('acepta DD/MM/AAAA y lo normaliza', () => {
    const r = validar(fila({ recorded_at: '27/07/2026' }))
    expect(r.status).toBe('valid')
    expect(r.recordedAt).toBe('2026-07-27')
  })

  it('acepta el serial de Excel', () => {
    const r = validateRow(2, filaPollo({ recorded_at: '45292' }), catalogo(), ENERO, new Set())
    expect(r.recordedAt).toBe('2024-01-01')
  })

  // No se corrige la fecha para que encaje: eso inventaría un dato de mercado.
  it('una fecha fuera del periodo se rechaza sin corregirla', () => {
    const r = validar(fila({ recorded_at: '03/08/2026' }))
    expect(r.status).toBe('invalid')
    expect(r.errors[0].message).toContain('fuera del periodo')
    expect(r.recordedAt).toBe('2026-08-03')
  })

  it('formato inválido, con los admitidos en el mensaje', () => {
    const r = validar(fila({ recorded_at: '27 de julio' }))
    expect(r.errors[0].message).toContain('DD/MM/AAAA')
  })

  it('fecha obligatoria', () => {
    expect(validar(fila({ recorded_at: '' })).errors[0].message).toContain('obligatoria')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// PRECIO
// ═══════════════════════════════════════════════════════════════════════════

describe('precio', () => {
  // 034 — antes: «El precio no es un número válido: 285,00 €».
  it('acepta el importe con símbolo y coma decimal', () => {
    const r = validateRow(2, filaPollo(), catalogo(), ENERO, new Set())
    expect(r.status).toBe('valid')
    expect(r.price).toBe(285)
  })

  it('acepta separador de miles', () => {
    expect(validar(fila({ price: '1.285,50' })).price).toBe(1285.5)
    expect(validar(fila({ price: '1,285.50' })).price).toBe(1285.5)
  })

  it('rechaza el precio negativo y el cero', () => {
    expect(validar(fila({ price: '-5' })).status).toBe('invalid')
    expect(validar(fila({ price: '0' })).status).toBe('invalid')
  })

  it('rechaza un precio no numérico', () => {
    expect(validar(fila({ price: 'gratis' })).errors[0].column).toBe('price')
  })

  it('rechaza el importe ambiguo y explica cómo escribirlo', () => {
    const r = validar(fila({ price: '1.285' }))
    expect(r.status).toBe('invalid')
    expect(r.errors[0].message).toContain('ambiguo')
  })

  it('exige coherencia con mínimo y máximo', () => {
    expect(validar(fila({ min_price: '250', max_price: '240' })).status).toBe('invalid')
    expect(validar(fila({ min_price: '238', max_price: '244' })).status).toBe('valid')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// MONEDA Y UNIDAD
// ═══════════════════════════════════════════════════════════════════════════

describe('moneda', () => {
  // 034 — antes: «Moneda no reconocida: USD. Admitidas: EUR».
  it('admite las tres monedas, no solo la del histórico', () => {
    for (const c of ['EUR', 'USD', 'GBP']) {
      const r = validar(fila({ currency: c }))
      expect(r.status, `${c} debería admitirse`).toBe('valid')
      expect(r.currency).toBe(c)
    }
  })

  it('admite los símbolos y los normaliza a ISO', () => {
    expect(validar(fila({ currency: '€' })).currency).toBe('EUR')
    expect(validar(fila({ currency: '$' })).currency).toBe('USD')
    expect(validar(fila({ currency: '£' })).currency).toBe('GBP')
  })

  it('rechaza un código desconocido', () => {
    const r = validar(fila({ currency: 'BTC' }))
    expect(r.errors[0].column).toBe('currency')
    expect(r.errors[0].message).toContain('EUR (€)')
  })

  it('es obligatoria', () => {
    expect(validar(fila({ currency: '' })).errors.some((e) => e.column === 'currency')).toBe(true)
  })

  // El caso que pide el enunciado: currency = USD y unit = €/100 Kg.
  it('detecta la contradicción entre la columna y la unidad', () => {
    const r = validateRow(2, filaPollo({ currency: 'USD' }), catalogo(), ENERO, new Set())
    expect(r.status).toBe('invalid')
    const mensaje = r.errors.map((e) => e.message).join(' ')
    expect(mensaje).toContain('Contradicción de moneda')
    expect(mensaje).toContain('USD')
    expect(mensaje).toContain('EUR')
  })

  it('detecta la contradicción entre la columna y el símbolo del precio', () => {
    const r = validar(fila({ currency: 'USD', price: '241,50 €' }))
    expect(r.status).toBe('invalid')
    expect(r.errors.some((e) => e.message.includes('Contradicción de moneda'))).toBe(true)
  })

  it('cuando todas coinciden no hay conflicto', () => {
    const r = validar(fila({ currency: 'USD', price: '241.50 USD', unit: 'USD/TN' }))
    expect(r.status).toBe('valid')
    expect(r.currency).toBe('USD')
  })

  it('la moneda puede venir solo dentro del precio', () => {
    const r = validar(fila({ currency: '', price: '241,50 €' }))
    expect(r.status).toBe('valid')
    expect(r.currency).toBe('EUR')
  })
})

describe('unidad', () => {
  // 034 — antes: «Unidad no reconocida: €/100 kg».
  it('acepta la expresión combinada de la ficha del producto', () => {
    const r = validateRow(2, filaPollo(), catalogo(), ENERO, new Set())
    expect(r.status).toBe('valid')
    expect(r.unit).toBe('100 kg')
    expect(r.currency).toBe('EUR')
  })

  it('acepta el código ISO como prefijo', () => {
    const r = validateRow(2, filaPollo({ unit: 'EUR/100 kg' }), catalogo(), ENERO, new Set())
    expect(r.status).toBe('valid')
    expect(r.unit).toBe('100 kg')
  })

  it('acepta la medida suelta', () => {
    const r = validateRow(2, filaPollo({ unit: '100 kg' }), catalogo(), ENERO, new Set())
    expect(r.status).toBe('valid')
    expect(r.unit).toBe('100 kg')
  })

  it('no distingue mayúsculas ni espacios', () => {
    for (const u of ['€/100 KG', '€/100kg', ' €/100  Kg ']) {
      const r = validateRow(2, filaPollo({ unit: u }), catalogo(), ENERO, new Set())
      expect(r.unit, `«${u}»`).toBe('100 kg')
    }
  })

  it('normaliza las variantes de la tonelada', () => {
    for (const u of ['ton', 'TN', 'Tn', '€/TN']) {
      expect(validar(fila({ unit: u })).unit, `«${u}»`).toBe('ton')
    }
  })

  // Mezclar «kg» y «100 kg» en la misma serie da un salto de ×100 que parece
  // perfectamente normal en el gráfico.
  it('rechaza una unidad que contradice la configurada en la referencia', () => {
    const r = validateRow(2, filaPollo({ unit: 'kg' }), catalogo(), ENERO, new Set())
    expect(r.status).toBe('invalid')
    expect(r.errors[0].column).toBe('unit')
    expect(r.errors[0].message).toContain('€/100 Kg')
  })

  it('sin unidad en el archivo se hereda la de la referencia', () => {
    const r = validateRow(2, filaPollo({ unit: '' }), catalogo(), ENERO, new Set())
    expect(r.status).toBe('valid')
    expect(r.unit).toBe('100 kg')
  })

  it('producto sin unidad configurada: vale la del archivo', () => {
    const r = validar(fila({ product_slug: 'cebada', unit: 'kg', lonja: 'Zaragoza' }))
    expect(r.status).toBe('valid')
    expect(r.unit).toBe('kg')
  })

  it('sin unidad en ninguno de los dos: error', () => {
    const r = validar(fila({ product_slug: 'cebada', unit: '', lonja: 'Zaragoza' }))
    expect(r.status).toBe('invalid')
    expect(r.errors.some((e) => e.column === 'unit')).toBe(true)
  })

  it('rechaza una medida desconocida', () => {
    const r = validar(fila({ unit: 'sacos' }))
    expect(r.errors[0].column).toBe('unit')
  })
})

// ── Contenido peligroso ─────────────────────────────────────────────────────

describe('fórmulas', () => {
  it('rechaza texto que empiece por un carácter de fórmula', () => {
    for (const c of ['=', '+', '@']) {
      const r = validar(fila({ notes: `${c}SUM(A1)` }))
      expect(r.status).toBe('invalid')
      expect(r.errors.some((e) => e.column === 'notes')).toBe(true)
    }
  })

  it('un texto normal pasa', () => {
    expect(validar(fila({ notes: 'Boletín 30/2026', source: 'Mercolleida' })).status).toBe('valid')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// DUPLICADOS — con la lonja dentro de la clave
// ═══════════════════════════════════════════════════════════════════════════

describe('clave natural', () => {
  it('incluye la lonja', () => {
    expect(naturalKey('p1', '2026-07-27', 'EUR', 'ton', 'España'))
      .toBe('p1|2026-07-27|EUR|ton|espana')
  })

  it('canoniza la unidad para que las tres grafías de «unidad» sean una', () => {
    const a = naturalKey('p1', '2026-07-27', 'EUR', 'Unidades', 'ONU')
    const b = naturalKey('p1', '2026-07-27', 'EUR', 'unidad', 'ONU')
    expect(a).toBe(b)
  })

  it('sin lonja usa la cadena vacía, no un valor irrepetible', () => {
    expect(naturalKey('p1', '2026-07-27', 'EUR', 'ton', null))
      .toBe(naturalKey('p1', '2026-07-27', 'EUR', 'ton', ''))
  })
})

describe('duplicados', () => {
  it('duplicado contra la base de datos', () => {
    const cat = catalogo({
      existingKeys: new Set([naturalKey('p-trigo', '2026-07-27', 'EUR', 'ton', 'Mercolleida')]),
    })
    const r = validar(fila(), cat)
    expect(r.status).toBe('duplicate')
    expect(r.errors[0].message).toContain('Mercolleida')
  })

  it('duplicado dentro del propio archivo', () => {
    const seen = new Set<string>()
    const cat = catalogo()
    expect(validateRow(2, fila(), cat, SEMANA, seen).status).toBe('valid')
    expect(validateRow(3, fila(), cat, SEMANA, seen).status).toBe('duplicate')
  })

  // El corazón del bloque: mismo producto, día, moneda y unidad; distinta plaza.
  it('distinta LONJA no es duplicado', () => {
    const seen = new Set<string>()
    const cat = catalogo()
    expect(validateRow(2, fila({ lonja: 'España' }), cat, SEMANA, seen).status).toBe('valid')
    expect(validateRow(3, fila({ lonja: 'Alemania' }), cat, SEMANA, seen).status).toBe('valid')
    expect(validateRow(4, fila({ lonja: 'Europa' }), cat, SEMANA, seen).status).toBe('valid')
  })

  it('la MISMA lonja sí es duplicado', () => {
    const seen = new Set<string>()
    const cat = catalogo()
    expect(validateRow(2, fila({ lonja: 'España' }), cat, SEMANA, seen).status).toBe('valid')
    expect(validateRow(3, fila({ lonja: ' españa ' }), cat, SEMANA, seen).status).toBe('duplicate')
  })

  it('distinta moneda o fecha tampoco es duplicado', () => {
    const seen = new Set<string>()
    const cat = catalogo()
    expect(validateRow(2, fila(), cat, SEMANA, seen).status).toBe('valid')
    expect(validateRow(3, fila({ currency: 'USD', price: '241.50 USD', unit: 'USD/TN' }), cat, SEMANA, seen).status).toBe('valid')
    expect(validateRow(4, fila({ recorded_at: '2026-07-28' }), cat, SEMANA, seen).status).toBe('valid')
  })

  // El mensaje tiene que decir QUÉ columna cambiar. En el fichero real, 19
  // filas repetían «Europa» y solo cambiaba `country`.
  it('el duplicado del propio archivo explica que country no distingue', () => {
    const seen = new Set<string>()
    const cat = catalogo()
    validateRow(2, fila({ lonja: 'Europa' }), cat, SEMANA, seen)
    const segunda = validateRow(3, fila({ lonja: 'Europa', country: 'DE' }), cat, SEMANA, seen)

    expect(segunda.status).toBe('duplicate')
    expect(segunda.errors[0].message).toContain('«country» y «region» NO distinguen')
    expect(segunda.errors[0].message).toContain('«lonja»')
  })

  it('una fila inválida no se marca además como duplicada', () => {
    const cat = catalogo({
      existingKeys: new Set([naturalKey('p-trigo', '2026-07-27', 'EUR', 'ton', 'Mercolleida')]),
    })
    expect(validar(fila({ price: 'x' }), cat).status).toBe('invalid')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// DOS PRECIOS DISTINTOS PARA LA MISMA CLAVE
// ═══════════════════════════════════════════════════════════════════════════

describe('duplicados en conflicto', () => {
  function correr(filas: Record<string, string>[]) {
    const seen = new Set<string>()
    const cat = catalogo()
    return flagConflictingDuplicates(
      filas.map((f, i) => validateRow(i + 2, f, cat, SEMANA, seen)),
    )
  }

  // El caso real: Polonia aparece dos veces el mismo día con 199,98 y 245,25.
  // Quedarse con la primera es elegir a ciegas entre dos precios de mercado.
  it('si los precios discrepan NO entra ninguna de las dos', () => {
    const r = correr([
      fila({ lonja: 'Polonia', price: '199,98' }),
      fila({ lonja: 'Polonia', price: '245,25' }),
    ])
    expect(r.map((f) => f.status)).toEqual(['duplicate', 'duplicate'])
    expect(r[0].errors[0].message).toContain('precios DISTINTOS')
    expect(r[0].errors[0].message).toContain('No se importa ninguno')
  })

  // Una fila literalmente repetida es un solo hecho: da igual cuál lo represente.
  it('si el precio es el mismo, la primera sigue entrando', () => {
    const r = correr([
      fila({ lonja: 'Polonia', price: '199,98' }),
      fila({ lonja: 'Polonia', price: '199,98' }),
    ])
    expect(r.map((f) => f.status)).toEqual(['valid', 'duplicate'])
  })

  it('lonjas distintas no entran en conflicto aunque cambie el precio', () => {
    const r = correr([
      fila({ lonja: 'Polonia', price: '199,98' }),
      fila({ lonja: 'Francia', price: '245,25' }),
    ])
    expect(r.map((f) => f.status)).toEqual(['valid', 'valid'])
  })

  it('sin conflictos devuelve exactamente las mismas filas', () => {
    const r = correr([fila({ lonja: 'Polonia' })])
    expect(r.map((f) => f.status)).toEqual(['valid'])
  })
})

// ── Resumen ─────────────────────────────────────────────────────────────────

describe('summarize', () => {
  it('cuenta cada estado y las entidades distintas', () => {
    const seen = new Set<string>()
    const cat = catalogo()
    const filas = [
      validateRow(2, fila(), cat, SEMANA, seen),
      validateRow(3, fila({ product_slug: 'cebada', unit: 'kg', lonja: 'Zaragoza' }), cat, SEMANA, seen),
      validateRow(4, fila(), cat, SEMANA, seen),               // duplicada
      validateRow(5, fila({ price: 'no' }), cat, SEMANA, seen), // inválida
    ]
    expect(summarize(filas)).toMatchObject({
      totalRows: 4, validRows: 2, duplicateRows: 1, invalidRows: 1,
      marketsFound: 1, productsFound: 2,
    })
  })

  it('sin filas devuelve ceros, no error', () => {
    expect(summarize([])).toMatchObject({ totalRows: 0, validRows: 0 })
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// INDICADORES SIN MONEDA (037)
// ═══════════════════════════════════════════════════════════════════════════
//
// El catálogo tiene 16 referencias que NO son precios y por eso no se podían
// cargar: 12 índices FAO (`unidad`) y 4 indicadores del INE (`%`). La moneda era
// obligatoria, así que había que decirle a la base que el 2,5 % está en euros.
//
// La regla que se fija aquí es simétrica y la decide la UNIDAD:
//
//   unidad no monetaria  →  la moneda DEBE faltar
//   cualquier otra       →  la moneda es obligatoria

/** IPC: porcentaje, sin moneda. Configurado en la ficha como «%». */
const IPC: CatalogProduct = {
  productId: 'p-ipc', productSlug: 'ipc', productName: 'Índice de Precios de Consumo (IPC)',
  marketId: 'm-ipc', marketSlug: 'ipc', marketName: 'IPC',
  lonja: 'España', unit: '%',
}
/** Índice FAO: adimensional, sin moneda. La ficha dice «unidad». */
const FAO: CatalogProduct = {
  productId: 'p-fao', productSlug: 'food-price-index', productName: 'Food Price Index',
  marketId: 'm-fao', marketSlug: 'fao-index', marketName: 'FAO Index',
  lonja: 'Naciones Unidas', unit: 'unidad',
}

function catalogoIndicadores(overrides: Partial<ValidationCatalog> = {}): ValidationCatalog {
  return {
    products: new Map([
      ['cereales::trigo', TRIGO],
      ['ipc::ipc', IPC],
      ['fao-index::food-price-index', FAO],
    ]),
    marketSlugs: new Set(['cereales', 'ipc', 'fao-index']),
    existingKeys: new Set<string>(),
    ...overrides,
  }
}

function filaIpc(over: Record<string, string> = {}): Record<string, string> {
  return {
    market_slug: 'ipc',
    product_slug: 'ipc',
    recorded_at: '2026-07-27',
    price: '2,5',
    currency: '',
    unit: '%',
    ...over,
  }
}

function filaFao(over: Record<string, string> = {}): Record<string, string> {
  return {
    market_slug: 'fao-index',
    product_slug: 'food-price-index',
    recorded_at: '2026-07-27',
    price: '123,45',
    currency: '',
    unit: 'Unidades',
    ...over,
  }
}

describe('037 — se aceptan los indicadores sin moneda', () => {
  it('porcentaje: price 2,5 · currency vacía · unit «%»', () => {
    const r = validateRow(2, filaIpc(), catalogoIndicadores(), SEMANA, new Set())
    expect(r.errors).toEqual([])
    expect(r.status).toBe('valid')
    expect(r.currency).toBeNull()
    expect(r.unit).toBe('%')
    expect(r.price).toBe(2.5)
  })

  it('índice: price 123,45 · currency vacía · unit «Unidades»', () => {
    const r = validateRow(2, filaFao(), catalogoIndicadores(), SEMANA, new Set())
    expect(r.errors).toEqual([])
    expect(r.status).toBe('valid')
    expect(r.currency).toBeNull()
    expect(r.unit).toBe('Unidades')
    expect(r.price).toBe(123.45)
  })

  it('las tres grafías del índice canonizan a «Unidades»', () => {
    for (const escrita of ['Unidades', 'unidades', 'unidad']) {
      const r = validateRow(2, filaFao({ unit: escrita }), catalogoIndicadores(), SEMANA, new Set())
      expect(r.errors, escrita).toEqual([])
      expect(r.unit, escrita).toBe('Unidades')
    }
  })

  it('la unidad se hereda de la ficha si el archivo la deja vacía', () => {
    const r = validateRow(2, filaIpc({ unit: '' }), catalogoIndicadores(), SEMANA, new Set())
    expect(r.errors).toEqual([])
    expect(r.unit).toBe('%')
    expect(r.currency).toBeNull()
  })
})

describe('037 — se rechazan las combinaciones imposibles', () => {
  // Quien escribe «EUR» en la fila del IPC se ha equivocado de columna o de
  // fila. Ignorarlo en silencio dejaría el error sin ver.
  it('EUR + «%» se RECHAZA', () => {
    const r = validateRow(2, filaIpc({ currency: 'EUR' }), catalogoIndicadores(), SEMANA, new Set())
    expect(r.status).toBe('invalid')
    const e = r.errors.find((x) => x.column === 'currency')
    expect(e?.message).toContain('no lleva moneda')
  })

  it('USD + «Unidades» se RECHAZA', () => {
    const r = validateRow(2, filaFao({ currency: 'USD' }), catalogoIndicadores(), SEMANA, new Set())
    expect(r.status).toBe('invalid')
    expect(r.errors.some((x) => x.column === 'currency')).toBe(true)
  })

  // La moneda también puede colarse por el precio o por la unidad combinada.
  it('un precio con símbolo sobre un porcentaje también se RECHAZA', () => {
    const r = validateRow(2, filaIpc({ price: '2,5 €' }), catalogoIndicadores(), SEMANA, new Set())
    expect(r.status).toBe('invalid')
    expect(r.errors.some((x) => x.column === 'currency')).toBe(true)
  })

  it('moneda vacía con unidad MONETARIA se RECHAZA', () => {
    const r = validateRow(2, fila({ currency: '' }), catalogo(), SEMANA, new Set())
    expect(r.status).toBe('invalid')
    const e = r.errors.find((x) => x.column === 'currency')
    expect(e?.message).toContain('obligatoria')
  })

  it('el mensaje de moneda obligatoria dice cuáles van sin ella', () => {
    const r = validateRow(2, fila({ currency: '' }), catalogo(), SEMANA, new Set())
    const e = r.errors.find((x) => x.column === 'currency')
    expect(e?.message).toContain('%')
    expect(e?.message).toContain('Unidades')
  })
})

describe('037 — la clave natural aguanta sin moneda', () => {
  // En SQL, NULL nunca es igual a NULL. Si la clave no colapsara la moneda
  // ausente a cadena vacía, se podrían insertar infinitas filas del mismo IPC
  // del mismo día — el agujero exacto que la clave existe para tapar.
  it('la moneda ausente colapsa a cadena vacía, igual que en el índice', () => {
    expect(naturalKey('p', '2026-01-01', null, '%', 'España'))
      .toBe(naturalKey('p', '2026-01-01', '', '%', 'España'))
    expect(naturalKey('p', '2026-01-01', undefined, '%', 'España'))
      .toBe(naturalKey('p', '2026-01-01', null, '%', 'España'))
  })

  it('un indicador sin moneda repetido en el archivo sale como duplicado', () => {
    const vistas = new Set<string>()
    const primera = validateRow(2, filaIpc(), catalogoIndicadores(), SEMANA, vistas)
    const segunda = validateRow(3, filaIpc(), catalogoIndicadores(), SEMANA, vistas)
    expect(primera.status).toBe('valid')
    expect(segunda.status).toBe('duplicate')
  })

  it('un indicador ya guardado sale como duplicado contra la base', () => {
    const existentes = new Set([naturalKey('p-ipc', '2026-07-27', null, '%', 'España')])
    const r = validateRow(2, filaIpc(), catalogoIndicadores({ existingKeys: existentes }), SEMANA, new Set())
    expect(r.status).toBe('duplicate')
  })

  // La segunda pasada excluía las filas con `currency === null`, así que dos
  // valores DISTINTOS del mismo índice y día se colaban eligiendo el primero.
  it('dos valores distintos del mismo indicador y día no entran ninguno', () => {
    const vistas = new Set<string>()
    const filas = [
      validateRow(2, filaIpc({ price: '2,5' }), catalogoIndicadores(), SEMANA, vistas),
      validateRow(3, filaIpc({ price: '3,1' }), catalogoIndicadores(), SEMANA, vistas),
    ]
    const revisadas = flagConflictingDuplicates(filas)
    expect(revisadas.every((f) => f.status === 'duplicate')).toBe(true)
  })

  it('dos lonjas distintas del mismo indicador y día SÍ entran las dos', () => {
    const vistas = new Set<string>()
    const a = validateRow(2, filaIpc({ lonja: 'España' }), catalogoIndicadores(), SEMANA, vistas)
    const b = validateRow(3, filaIpc({ lonja: 'Zona euro' }), catalogoIndicadores(), SEMANA, vistas)
    expect(a.status).toBe('valid')
    expect(b.status).toBe('valid')
  })
})

describe('037 — regresión: los precios de siempre siguen igual', () => {
  it('EUR + 100 kg', () => {
    const r = validateRow(2, filaPollo({ recorded_at: '2026-07-27', currency: 'EUR', unit: '100 kg' }), catalogo(), SEMANA, new Set())
    expect(r.errors).toEqual([])
    expect(r.currency).toBe('EUR')
    expect(r.unit).toBe('100 kg')
  })

  it('USD + ton', () => {
    const r = validateRow(2, fila({ currency: 'USD' }), catalogo(), SEMANA, new Set())
    expect(r.errors).toEqual([])
    expect(r.currency).toBe('USD')
    expect(r.unit).toBe('ton')
  })

  it('GBP + ton', () => {
    const r = validateRow(2, fila({ currency: 'GBP' }), catalogo(), SEMANA, new Set())
    expect(r.errors).toEqual([])
    expect(r.currency).toBe('GBP')
  })

  it('«€/100 Kg» sigue partiéndose en EUR + 100 kg', () => {
    const r = validateRow(2, filaPollo({ recorded_at: '2026-07-27', currency: '', unit: '€/100 Kg' }), catalogo(), SEMANA, new Set())
    expect(r.errors).toEqual([])
    expect(r.currency).toBe('EUR')
    expect(r.unit).toBe('100 kg')
  })

  it('la contradicción de monedas se sigue detectando', () => {
    const r = validateRow(2, fila({ currency: 'USD', price: '241,50 €' }), catalogo(), SEMANA, new Set())
    expect(r.status).toBe('invalid')
    expect(r.errors.some((x) => x.message.includes('Contradicción'))).toBe(true)
  })
})

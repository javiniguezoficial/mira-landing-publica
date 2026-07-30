// Validación de filas de la importación masiva (Fase 2.5).
//
// De estas reglas depende que no se corrompa el histórico de precios, así que
// se prueban sobre un catálogo controlado y sin tocar la base de datos.

import { describe, expect, it } from 'vitest'
import { resolveImportPeriod } from './period'
import {
  naturalKey,
  parseDecimal,
  summarize,
  validateHeaders,
  validateRow,
  type CatalogProduct,
  type ValidationCatalog,
} from './validation'

const SEMANA = resolveImportPeriod({ type: 'week', year: 2026, week: 31 }).range!

const TRIGO: CatalogProduct = {
  productId: 'p-trigo', productSlug: 'trigo', productName: 'Trigo blando',
  marketId: 'm-cereales', marketSlug: 'cereales', marketName: 'Cereales',
  lonja: 'Mercolleida',
}
const CEBADA: CatalogProduct = {
  productId: 'p-cebada', productSlug: 'cebada', productName: 'Cebada',
  marketId: 'm-cereales', marketSlug: 'cereales', marketName: 'Cereales',
  lonja: null,
}

function catalogo(overrides: Partial<ValidationCatalog> = {}): ValidationCatalog {
  return {
    products: new Map([
      ['cereales::trigo', TRIGO],
      ['cereales::cebada', CEBADA],
    ]),
    marketSlugs: new Set(['cereales', 'porcino']),
    currencies: new Set(['EUR']),
    units: new Set(['ton', 'kg']),
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

function validar(raw: Record<string, string>, cat = catalogo(), seen = new Set<string>()) {
  return validateRow(2, raw, cat, SEMANA, seen)
}

// ── Números ─────────────────────────────────────────────────────────────────

describe('parseDecimal', () => {
  it('acepta punto decimal', () => {
    expect(parseDecimal('241.50')).toBe(241.5)
  })

  it('acepta coma decimal', () => {
    expect(parseDecimal('241,50')).toBe(241.5)
  })

  // El punto central: «1.482» es mil cuatrocientos ochenta y dos o uno coma
  // cuatro ocho dos según el país. Adivinar multiplica el precio por mil.
  it('rechaza los dos separadores a la vez por ambiguo', () => {
    expect(parseDecimal('1.482,5')).toBeNull()
    expect(parseDecimal('1,482.5')).toBeNull()
  })

  it('rechaza lo que no es un número', () => {
    for (const raw of ['', '  ', 'abc', '1.2.3', '1,2,3', '12e4', '1 000']) {
      expect(parseDecimal(raw)).toBeNull()
    }
  })

  it('acepta negativos: quien decide si valen es la regla de negocio', () => {
    expect(parseDecimal('-5')).toBe(-5)
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
    expect(r.missing).toContain('recorded_at')
  })

  // Una columna interna de más no debe impedir importar: se ignora y se avisa.
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
    expect(r.marketId).toBe('m-cereales')
  })

  it('mercado inexistente: lo dice del mercado', () => {
    const r = validar(fila({ market_slug: 'inventado' }))
    expect(r.status).toBe('invalid')
    expect(r.errors[0].column).toBe('market_slug')
    expect(r.errors[0].message).toContain('no existe')
  })

  // Distinguir los dos casos evita que alguien busque el producto donde no está.
  it('producto que no pertenece a ese mercado: lo dice del producto', () => {
    const r = validar(fila({ market_slug: 'porcino', product_slug: 'trigo' }))
    expect(r.status).toBe('invalid')
    expect(r.errors[0].column).toBe('product_slug')
    expect(r.errors[0].message).toContain('porcino')
  })

  it('campos obligatorios vacíos', () => {
    const r = validar(fila({ market_slug: '', product_slug: '' }))
    expect(r.errors.map((e) => e.column)).toEqual(
      expect.arrayContaining(['market_slug', 'product_slug']),
    )
  })

  it('normaliza espacios y mayúsculas del slug', () => {
    expect(validar(fila({ market_slug: ' CEREALES ', product_slug: ' Trigo ' })).status).toBe('valid')
  })

  // La unicidad `(market_id, slug)` garantiza que no hay ambigüedad posible: o
  // casa una fila del catálogo o ninguna. Nunca «la más parecida».
  it('no hace búsqueda difusa', () => {
    expect(validar(fila({ product_slug: 'trig' })).status).toBe('invalid')
    expect(validar(fila({ product_slug: 'trigo-blando' })).status).toBe('invalid')
  })
})

// ── Lonja ───────────────────────────────────────────────────────────────────

describe('lonja', () => {
  it('sin lonja en el archivo no se valida nada', () => {
    expect(validar(fila()).status).toBe('valid')
  })

  it('lonja correcta: válida', () => {
    expect(validar(fila({ lonja: 'Mercolleida' })).status).toBe('valid')
  })

  // El importador NUNCA escribe `products.lonja`: una errata en una columna
  // opcional no puede reasignar un producto a otra lonja.
  it('lonja distinta a la del producto: error, no reasignación', () => {
    const r = validar(fila({ lonja: 'Lonja de Binéfar' }))
    expect(r.status).toBe('invalid')
    expect(r.errors[0].column).toBe('lonja')
    expect(r.errors[0].message).toContain('Mercolleida')
    // La lonja devuelta sigue siendo la del PRODUCTO, no la del archivo.
    expect(r.lonja).toBe('Mercolleida')
  })

  it('producto sin lonja y archivo con lonja: error', () => {
    const r = validar(fila({ product_slug: 'cebada', lonja: 'Mercolleida' }))
    expect(r.status).toBe('invalid')
    expect(r.errors[0].column).toBe('lonja')
  })
})

// ── Fecha y periodo ─────────────────────────────────────────────────────────

describe('fecha', () => {
  it('acepta una fecha dentro del periodo', () => {
    expect(validar(fila({ recorded_at: '2026-08-02' })).status).toBe('valid')
  })

  // No se corrige la fecha para que encaje: eso inventaría un dato de mercado.
  it('una fecha fuera del periodo se rechaza sin corregirla', () => {
    const r = validar(fila({ recorded_at: '2026-08-03' }))
    expect(r.status).toBe('invalid')
    expect(r.errors[0].column).toBe('recorded_at')
    expect(r.errors[0].message).toContain('fuera del periodo')
    expect(r.recordedAt).toBe('2026-08-03')
  })

  it('formato inválido', () => {
    expect(validar(fila({ recorded_at: '27/07/2026' })).errors[0].message).toContain('AAAA-MM-DD')
  })

  it('fecha obligatoria', () => {
    expect(validar(fila({ recorded_at: '' })).errors[0].message).toContain('obligatoria')
  })
})

// ── Precio, moneda y unidad ─────────────────────────────────────────────────

describe('precio', () => {
  it('rechaza el precio negativo y el cero', () => {
    expect(validar(fila({ price: '-5' })).status).toBe('invalid')
    expect(validar(fila({ price: '0' })).status).toBe('invalid')
  })

  it('rechaza un precio no numérico', () => {
    expect(validar(fila({ price: 'gratis' })).errors[0].column).toBe('price')
  })

  it('exige coherencia con mínimo y máximo', () => {
    expect(validar(fila({ min_price: '250', max_price: '240' })).status).toBe('invalid')
    expect(validar(fila({ min_price: '245' })).status).toBe('invalid')
    expect(validar(fila({ max_price: '240' })).status).toBe('invalid')
    expect(validar(fila({ min_price: '238', max_price: '244' })).status).toBe('valid')
  })
})

describe('moneda y unidad', () => {
  it('acepta las de la allowlist real', () => {
    expect(validar(fila({ currency: 'eur', unit: 'kg' })).status).toBe('valid')
  })

  // Es lo que impide que «Tn», «TN» y «ton» entren como tres unidades y partan
  // las series de precios.
  it('rechaza una unidad no usada en la plataforma', () => {
    const r = validar(fila({ unit: 'Tn' }))
    expect(r.status).toBe('invalid')
    expect(r.errors[0].column).toBe('unit')
    expect(r.errors[0].message).toContain('ton')
  })

  it('rechaza una moneda desconocida', () => {
    expect(validar(fila({ currency: 'BTC' })).errors[0].column).toBe('currency')
  })

  it('ambas son obligatorias', () => {
    expect(validar(fila({ currency: '' })).errors[0].message).toContain('obligatoria')
    expect(validar(fila({ unit: '' })).errors.some((e) => e.column === 'unit')).toBe(true)
  })
})

// ── Contenido peligroso ─────────────────────────────────────────────────────

describe('fórmulas', () => {
  it('rechaza texto que empiece por un carácter de fórmula', () => {
    for (const c of ['=', '+', '-', '@']) {
      const r = validar(fila({ notes: `${c}SUM(A1)` }))
      expect(r.status).toBe('invalid')
      expect(r.errors.some((e) => e.column === 'notes')).toBe(true)
    }
  })

  it('un texto normal pasa', () => {
    expect(validar(fila({ notes: 'Boletín 30/2026', source: 'Mercolleida' })).status).toBe('valid')
  })
})

// ── Duplicados ──────────────────────────────────────────────────────────────

describe('duplicados', () => {
  it('la clave natural son cuatro campos', () => {
    expect(naturalKey('p1', '2026-07-27', 'EUR', 'ton')).toBe('p1|2026-07-27|EUR|ton')
  })

  it('duplicado contra la base de datos', () => {
    const cat = catalogo({
      existingKeys: new Set([naturalKey('p-trigo', '2026-07-27', 'EUR', 'ton')]),
    })
    const r = validar(fila(), cat)
    expect(r.status).toBe('duplicate')
    expect(r.errors[0].message).toContain('Ya existe')
  })

  it('duplicado dentro del propio archivo', () => {
    const seen = new Set<string>()
    const cat = catalogo()
    expect(validateRow(2, fila(), cat, SEMANA, seen).status).toBe('valid')
    const segunda = validateRow(3, fila(), cat, SEMANA, seen)
    expect(segunda.status).toBe('duplicate')
    expect(segunda.errors[0].message).toContain('propio archivo')
  })

  it('distinta unidad o moneda NO es duplicado: son hechos distintos', () => {
    const seen = new Set<string>()
    const cat = catalogo({ currencies: new Set(['EUR', 'USD']) })
    expect(validateRow(2, fila(), cat, SEMANA, seen).status).toBe('valid')
    expect(validateRow(3, fila({ unit: 'kg' }), cat, SEMANA, seen).status).toBe('valid')
    expect(validateRow(4, fila({ currency: 'USD' }), cat, SEMANA, seen).status).toBe('valid')
  })

  it('distinto producto o fecha tampoco', () => {
    const seen = new Set<string>()
    const cat = catalogo()
    expect(validateRow(2, fila(), cat, SEMANA, seen).status).toBe('valid')
    expect(validateRow(3, fila({ product_slug: 'cebada' }), cat, SEMANA, seen).status).toBe('valid')
    expect(validateRow(4, fila({ recorded_at: '2026-07-28' }), cat, SEMANA, seen).status).toBe('valid')
  })

  // Una fila que ni siquiera resuelve el producto no debe además llamarse
  // duplicada: el error que hay que corregir es el otro.
  it('una fila inválida no se marca como duplicada', () => {
    const cat = catalogo({
      existingKeys: new Set([naturalKey('p-trigo', '2026-07-27', 'EUR', 'ton')]),
    })
    expect(validar(fila({ price: 'x' }), cat).status).toBe('invalid')
  })
})

// ── Resumen ─────────────────────────────────────────────────────────────────

describe('summarize', () => {
  it('cuenta cada estado y las entidades distintas', () => {
    const seen = new Set<string>()
    const cat = catalogo()
    const filas = [
      validateRow(2, fila(), cat, SEMANA, seen),
      validateRow(3, fila({ product_slug: 'cebada' }), cat, SEMANA, seen),
      validateRow(4, fila(), cat, SEMANA, seen),               // duplicada
      validateRow(5, fila({ price: 'no' }), cat, SEMANA, seen), // inválida
    ]
    const s = summarize(filas)
    expect(s).toMatchObject({
      totalRows: 4, validRows: 2, duplicateRows: 1, invalidRows: 1,
      marketsFound: 1, productsFound: 2,
    })
  })

  it('sin filas devuelve ceros, no error', () => {
    expect(summarize([])).toMatchObject({ totalRows: 0, validRows: 0 })
  })
})

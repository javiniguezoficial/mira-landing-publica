// Parámetros del listado de proveedores: búsqueda, orden y URL (Fase 3.1).

import { describe, expect, it } from 'vitest'
import {
  DEFAULT_SUPPLIER_SORT,
  MAX_SECONDARY_SEARCH_LENGTH,
  MAX_SELECTED_IDS,
  SUPPLIER_PARAM,
  SUPPLIER_SORTS,
  SUPPLIER_SORT_LABELS,
  buildClearFiltersUrl,
  buildClearSecondarySearchUrl,
  buildExportFilename,
  buildSupplierUrl,
  isSupplierSort,
  normalizeSupplierParams,
  parseExportMode,
  parseSecondarySearch,
  parseSupplierSort,
} from './list-params'

const BASE = '/app/proveedores'

describe('allowlist de ordenación', () => {
  it('el default es nombre A–Z', () => {
    expect(DEFAULT_SUPPLIER_SORT).toBe('name_asc')
  })

  it('incluye los cuatro criterios mínimos exigidos', () => {
    for (const s of ['name_asc', 'name_desc', 'created_desc', 'created_asc']) {
      expect(SUPPLIER_SORTS).toContain(s)
    }
  })

  it('toda opción tiene etiqueta visible', () => {
    for (const s of SUPPLIER_SORTS) {
      expect(SUPPLIER_SORT_LABELS[s]?.length).toBeGreaterThan(3)
    }
  })

  // «Mayor a menor» a secas no dice mayor en qué. Las etiquetas llevan el campo.
  it('ninguna etiqueta es ambigua: todas nombran su criterio', () => {
    expect(SUPPLIER_SORT_LABELS.produccion_desc).toContain('Producción')
    expect(SUPPLIER_SORT_LABELS.produccion_asc).toContain('Producción')
    for (const s of SUPPLIER_SORTS) {
      expect(SUPPLIER_SORT_LABELS[s]).not.toBe('Mayor a menor')
      expect(SUPPLIER_SORT_LABELS[s]).not.toBe('Menor a mayor')
    }
  })

  it('reconoce solo los valores de la lista', () => {
    expect(isSupplierSort('name_asc')).toBe(true)
    expect(isSupplierSort('email_asc')).toBe(false)
    expect(isSupplierSort('')).toBe(false)
    expect(isSupplierSort(null)).toBe(false)
  })
})

describe('parseSupplierSort', () => {
  it('acepta los valores válidos', () => {
    for (const s of SUPPLIER_SORTS) expect(parseSupplierSort(s)).toBe(s)
  })

  it('tolera mayúsculas y espacios', () => {
    expect(parseSupplierSort(' NAME_DESC ')).toBe('name_desc')
  })

  // Lo esencial: de la URL no puede salir un nombre de columna.
  it('cualquier intento de inyección cae al default', () => {
    for (const raw of [
      'name; drop table suppliers',
      'name asc, (select 1)',
      "email' --",
      'notes',
      'password',
      '',
      null,
      undefined,
      42,
      {},
    ]) {
      expect(parseSupplierSort(raw)).toBe(DEFAULT_SUPPLIER_SORT)
    }
  })
})

describe('búsqueda secundaria', () => {
  it('recorta y colapsa espacios', () => {
    expect(parseSecondarySearch('  Lleida   norte ')).toBe('Lleida norte')
  })

  it('el término vacío es cadena vacía', () => {
    expect(parseSecondarySearch('   ')).toBe('')
    expect(parseSecondarySearch('')).toBe('')
    expect(parseSecondarySearch(null)).toBe('')
    expect(parseSecondarySearch(undefined)).toBe('')
    expect(parseSecondarySearch(123)).toBe('')
  })

  // Se conservan tal cual: el escapado ocurre en SQL, donde está la comparación.
  it('conserva caracteres especiales sin romperse', () => {
    expect(parseSecondarySearch("S.A. & Cía (Ñ)")).toBe("S.A. & Cía (Ñ)")
    expect(parseSecondarySearch("100% Natural")).toBe('100% Natural')
    expect(parseSecondarySearch("a_b")).toBe('a_b')
    expect(parseSecondarySearch("'; drop table--")).toBe("'; drop table--")
  })

  it('acota la longitud', () => {
    const largo = 'a'.repeat(500)
    expect(parseSecondarySearch(largo)).toHaveLength(MAX_SECONDARY_SEARCH_LENGTH)
  })
})

describe('normalizeSupplierParams', () => {
  it('separa filtros, búsqueda, orden y página', () => {
    const r = normalizeSupplierParams({
      q: 'agro',
      qr: 'lleida',
      country: 'España',
      sort: 'name_desc',
      page: '3',
    })
    expect(r.filters).toEqual({ q: 'agro', country: 'España' })
    expect(r.secondarySearch).toBe('lleida')
    expect(r.sort).toBe('name_desc')
    expect(r.page).toBe(3)
    expect(r.hasFilters).toBe(true)
  })

  it('descarta filtros vacíos', () => {
    const r = normalizeSupplierParams({ q: '', country: '   ', region: 'Lleida' })
    expect(r.filters).toEqual({ region: 'Lleida' })
  })

  it('sin nada, no hay filtros ni búsqueda', () => {
    const r = normalizeSupplierParams({})
    expect(r.hasFilters).toBe(false)
    expect(r.hasAnything).toBe(false)
    expect(r.sort).toBe(DEFAULT_SUPPLIER_SORT)
    expect(r.page).toBe(1)
  })

  it('una página inválida cae a 1', () => {
    expect(normalizeSupplierParams({ page: 'abc' }).page).toBe(1)
    expect(normalizeSupplierParams({ page: '-5' }).page).toBe(1)
  })
})

// ── URL ─────────────────────────────────────────────────────────────────────

describe('buildSupplierUrl', () => {
  it('conserva los filtros al cambiar de página', () => {
    const href = buildSupplierUrl(
      BASE,
      { q: 'agro', country: 'España', page: '2' },
      { page: 3 },
    )
    expect(href).toContain('q=agro')
    expect(href).toContain('country=Espa')
    expect(href).toContain('page=3')
  })

  // La regla central: cualquier cambio que no sea de página vuelve a la 1.
  it('cambiar la búsqueda reinicia la página', () => {
    const href = buildSupplierUrl(BASE, { q: 'agro', page: '7' }, { qr: 'lleida' })
    expect(href).not.toContain('page=')
    expect(href).toContain('qr=lleida')
    expect(href).toContain('q=agro')
  })

  it('cambiar el orden reinicia la página y conserva todo lo demás', () => {
    const href = buildSupplierUrl(
      BASE,
      { q: 'agro', qr: 'lleida', page: '4' },
      { sort: 'created_desc' },
    )
    expect(href).not.toContain('page=')
    expect(href).toContain('sort=created_desc')
    expect(href).toContain('qr=lleida')
    expect(href).toContain('q=agro')
  })

  it('cambiar un filtro reinicia la página', () => {
    const href = buildSupplierUrl(BASE, { page: '9' }, { country: 'Francia' })
    expect(href).not.toContain('page=')
  })

  it('el orden por defecto no ensucia la URL', () => {
    expect(buildSupplierUrl(BASE, {}, { sort: 'name_asc' })).toBe(BASE)
  })

  it('la página 1 tampoco se escribe', () => {
    expect(buildSupplierUrl(BASE, {}, { page: 1 })).toBe(BASE)
  })

  it('descarta valores vacíos', () => {
    expect(buildSupplierUrl(BASE, { q: '', country: undefined }, { qr: 'x' })).toBe(`${BASE}?qr=x`)
  })
})

describe('botones de limpiar — cada uno hace algo distinto', () => {
  it('limpiar búsqueda conserva filtros y orden', () => {
    const href = buildClearSecondarySearchUrl(BASE, {
      q: 'agro',
      qr: 'lleida',
      country: 'España',
      sort: 'name_desc',
    })
    expect(href).not.toContain('qr=')
    expect(href).toContain('q=agro')
    expect(href).toContain('sort=name_desc')
  })

  // El orden es una preferencia de visualización, no un filtro: perderlo al
  // limpiar resulta desconcertante.
  it('limpiar filtros los quita todos pero conserva el orden', () => {
    const href = buildClearFiltersUrl(BASE, {
      q: 'agro',
      qr: 'lleida',
      country: 'España',
      sort: 'created_desc',
    })
    expect(href).toBe(`${BASE}?sort=created_desc`)
  })

  it('limpiar filtros con el orden por defecto deja la ruta desnuda', () => {
    expect(buildClearFiltersUrl(BASE, { q: 'agro', country: 'España' })).toBe(BASE)
  })
})

describe('el nombre del search param no cambia sin querer', () => {
  it('q sigue siendo el filtro principal y qr la búsqueda secundaria', () => {
    expect(SUPPLIER_PARAM.search).toBe('q')
    expect(SUPPLIER_PARAM.secondarySearch).toBe('qr')
    expect(SUPPLIER_PARAM.sort).toBe('sort')
    expect(SUPPLIER_PARAM.page).toBe('page')
  })
})

// ── Exportación ─────────────────────────────────────────────────────────────

describe('exportación', () => {
  it('el modo cae a «filtered» salvo que se pida «selected»', () => {
    expect(parseExportMode('selected')).toBe('selected')
    expect(parseExportMode('filtered')).toBe('filtered')
    expect(parseExportMode('todo')).toBe('filtered')
    expect(parseExportMode(null)).toBe('filtered')
  })

  it('el nombre del archivo lleva la fecha', () => {
    expect(buildExportFilename(new Date(2026, 6, 30))).toBe('proveedores-2026-07-30.xlsx')
    expect(buildExportFilename(new Date(2026, 0, 5))).toBe('proveedores-2026-01-05.xlsx')
  })

  it('el tope de seleccionados está declarado', () => {
    expect(MAX_SELECTED_IDS).toBe(1000)
  })
})

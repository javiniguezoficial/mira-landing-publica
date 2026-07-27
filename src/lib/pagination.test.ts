import { describe, it, expect } from 'vitest'
import { parsePage, pageOffset, totalPages, pageRange, toNum, buildUrl } from '@/lib/pagination'

// Estos helpers reciben datos directamente de la URL, que es entrada no
// confiable: el usuario puede escribir `?page=-2` o `?page=abc` a mano. Lo que
// se fija aquí es que ningún valor extraño llegue a producir un offset negativo
// ni una consulta rota, y que los filtros sobrevivan al cambio de página.

describe('parsePage', () => {
  it('devuelve la página pedida cuando es válida', () => {
    expect(parsePage('2')).toBe(2)
    expect(parsePage('62')).toBe(62)
  })

  it('caso límite: ausente, vacío o 1 caen en la primera página', () => {
    expect(parsePage(undefined)).toBe(1)
    expect(parsePage('')).toBe(1)
    expect(parsePage('1')).toBe(1)
  })

  it('caso inválido: cero, negativos y texto caen en 1 en vez de romper', () => {
    // Sin esta normalización, `?page=0` y `?page=-2` producirían un offset
    // negativo y la consulta a Supabase fallaría.
    expect(parsePage('0')).toBe(1)
    expect(parsePage('-2')).toBe(1)
    expect(parsePage('abc')).toBe(1)
    expect(parsePage('NaN')).toBe(1)
  })

  it('trunca decimales a entero', () => {
    expect(parsePage('3.7')).toBe(3)
  })
})

describe('pageOffset', () => {
  it('calcula el offset de cada página', () => {
    expect(pageOffset(1, 200)).toBe(0)
    expect(pageOffset(2, 200)).toBe(200)
    expect(pageOffset(62, 200)).toBe(12200)
  })

  it('caso inválido: nunca devuelve un offset negativo', () => {
    expect(pageOffset(0, 200)).toBe(0)
    expect(pageOffset(-5, 200)).toBe(0)
  })
})

describe('totalPages', () => {
  it('redondea hacia arriba la última página incompleta', () => {
    // 12.288 proveedores a 200 por página → 61 llenas + 1 con 88.
    expect(totalPages(12288, 200)).toBe(62)
    expect(totalPages(400, 200)).toBe(2)
    expect(totalPages(401, 200)).toBe(3)
  })

  it('caso límite: una lista vacía sigue siendo "página 1 de 1"', () => {
    expect(totalPages(0, 200)).toBe(1)
    expect(totalPages(1, 200)).toBe(1)
  })

  it('caso inválido: un tamaño de página no positivo no provoca división por cero', () => {
    expect(totalPages(100, 0)).toBe(1)
    expect(totalPages(100, -10)).toBe(1)
  })
})

describe('pageRange', () => {
  it('describe el tramo mostrado en la página actual', () => {
    expect(pageRange(1, 200, 200)).toEqual({ from: 1, to: 200 })
    expect(pageRange(2, 200, 200)).toEqual({ from: 201, to: 400 })
  })

  it('caso límite: la última página usa las filas reales, no el tamaño de página', () => {
    // Página 62 de 12.288 elementos: solo quedan 88.
    expect(pageRange(62, 200, 88)).toEqual({ from: 12201, to: 12288 })
  })

  it('caso inválido: una página sin filas no produce rango', () => {
    // Evita textos absurdos como "Mostrando 12401–12400 de 12.288".
    expect(pageRange(1, 200, 0)).toBeNull()
    expect(pageRange(9999, 200, 0)).toBeNull()
  })
})

describe('toNum', () => {
  it('acepta coma o punto como separador decimal', () => {
    expect(toNum('1500')).toBe(1500)
    expect(toNum('1500,5')).toBe(1500.5)
    expect(toNum('1500.5')).toBe(1500.5)
  })

  it('caso inválido: vacío o no numérico devuelve undefined, no NaN', () => {
    // Devolver NaN acabaría enviando `NaN` como parámetro de la RPC.
    expect(toNum(undefined)).toBeUndefined()
    expect(toNum('')).toBeUndefined()
    expect(toNum('   ')).toBeUndefined()
    expect(toNum('abc')).toBeUndefined()
  })
})

describe('buildUrl', () => {
  it('conserva los filtros activos al cambiar de página', () => {
    expect(
      buildUrl('/admin/proveedores', { q: 'agro', region: 'Valencia', page: 3 }),
    ).toBe('/admin/proveedores?q=agro&region=Valencia&page=3')
  })

  it('caso límite: descarta undefined y cadenas vacías', () => {
    // Los filtros sin usar no deben ensuciar la URL al paginar.
    expect(
      buildUrl('/admin/proveedores', { q: 'agro', country: undefined, region: '', page: 2 }),
    ).toBe('/admin/proveedores?q=agro&page=2')
  })

  it('caso límite: sin parámetros devuelve la ruta base sin "?"', () => {
    expect(buildUrl('/admin/proveedores', {})).toBe('/admin/proveedores')
    expect(buildUrl('/admin/proveedores', { q: undefined })).toBe('/admin/proveedores')
  })

  it('escapa los valores con caracteres especiales', () => {
    expect(buildUrl('/admin/proveedores', { q: 'Agro & Cía' })).toBe(
      '/admin/proveedores?q=Agro+%26+C%C3%ADa',
    )
  })
})

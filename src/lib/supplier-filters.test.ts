import { describe, it, expect } from 'vitest'
import { buildSupplierFilterOptions, type SupplierFacetRow } from '@/lib/supplier-filters'

// Estas opciones alimentan los desplegables de País y Provincia de
// /admin/proveedores y /app/proveedores. Un fallo aquí no rompe la página: la
// deja con filtros silenciosamente incompletos, que es exactamente el defecto
// que este bloque corrige (112 países reales, solo 38 visibles).

const fila = (facet: string, value: string | null): SupplierFacetRow => ({ facet, value })

describe('buildSupplierFilterOptions', () => {
  it('separa cada faceta en su propia lista', () => {
    const rows = [
      fila('country', 'España'),
      fila('country', 'Italia'),
      fila('region', 'Valencia'),
      fila('region', 'Murcia'),
    ]
    expect(buildSupplierFilterOptions(rows)).toEqual({
      countries: ['España', 'Italia'],
      regions: ['Murcia', 'Valencia'],
    })
  })

  it('ignora facetas desconocidas sin contaminar el resultado', () => {
    // Si la RPC añadiera 'city' en el futuro, no debe colarse en países.
    const rows = [fila('country', 'España'), fila('city', 'Valencia'), fila('otra', 'X')]
    expect(buildSupplierFilterOptions(rows)).toEqual({ countries: ['España'], regions: [] })
  })

  it('elimina nulos, cadenas vacías y valores solo con espacios', () => {
    const rows = [
      fila('country', 'España'),
      fila('country', null),
      fila('country', ''),
      fila('country', '   '),
      fila('country', '\t\n'),
    ]
    expect(buildSupplierFilterOptions(rows).countries).toEqual(['España'])
  })

  it('deduplica valores repetidos', () => {
    const rows = [
      fila('country', 'España'),
      fila('country', 'España'),
      fila('country', 'Italia'),
      fila('country', 'España'),
    ]
    expect(buildSupplierFilterOptions(rows).countries).toEqual(['España', 'Italia'])
  })

  it('caso límite: los espacios exteriores no generan opciones duplicadas', () => {
    // "España" y " España " son la misma opción del desplegable.
    const rows = [
      fila('country', 'España'),
      fila('country', ' España'),
      fila('country', 'España '),
      fila('country', '  España  '),
    ]
    expect(buildSupplierFilterOptions(rows).countries).toEqual(['España'])
  })

  it('ordena alfabéticamente respetando acentos (localeCompare es)', () => {
    // Con sort() por defecto, "Ávila" caería detrás de "Zaragoza" porque se
    // compara por unidades de código UTF-16.
    const rows = [
      fila('region', 'Zaragoza'),
      fila('region', 'Ávila'),
      fila('region', 'Barcelona'),
      fila('region', 'Álava'),
    ]
    expect(buildSupplierFilterOptions(rows).regions).toEqual([
      'Álava',
      'Ávila',
      'Barcelona',
      'Zaragoza',
    ])
  })

  it('el orden es estable: no depende del orden de llegada de las filas', () => {
    const a = [fila('country', 'Italia'), fila('country', 'España'), fila('country', 'Francia')]
    const b = [fila('country', 'Francia'), fila('country', 'Italia'), fila('country', 'España')]
    expect(buildSupplierFilterOptions(a)).toEqual(buildSupplierFilterOptions(b))
    expect(buildSupplierFilterOptions(a).countries).toEqual(['España', 'Francia', 'Italia'])
  })

  it('caso inválido: null, undefined o lista vacía devuelven listas vacías, no rompen', () => {
    // Si la RPC falla, la página debe renderizarse con los desplegables vacíos.
    const vacio = { countries: [], regions: [] }
    expect(buildSupplierFilterOptions(null)).toEqual(vacio)
    expect(buildSupplierFilterOptions(undefined)).toEqual(vacio)
    expect(buildSupplierFilterOptions([])).toEqual(vacio)
  })

  it('caso inválido: tolera filas malformadas sin lanzar', () => {
    const rows = [
      null,
      undefined,
      { facet: 'country', value: 'España' },
      { facet: null, value: 'Huérfano' },
      { facet: 'country', value: 123 },
    ] as unknown as SupplierFacetRow[]
    expect(buildSupplierFilterOptions(rows).countries).toEqual(['España'])
  })
})

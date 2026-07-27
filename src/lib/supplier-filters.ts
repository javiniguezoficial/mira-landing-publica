// Construcción de las opciones de los <select> de filtro de proveedores a
// partir de las filas que devuelve la RPC `get_supplier_filter_options`.
//
// Módulo puro (sin Next ni Supabase) para que sea testeable: `suppliers.ts`
// lleva la directiva 'use server' y allí todo export debe ser una función
// async, así que la lógica de mapeo no puede vivir en ese archivo.

export interface SupplierFilterOptions {
  countries: string[]
  regions: string[]
}

/** Fila tal y como la devuelve la RPC: formato largo (una fila por valor). */
export interface SupplierFacetRow {
  facet: string | null
  value: string | null
}

/**
 * Agrupa las filas por faceta y devuelve, para cada una, sus valores ya
 * saneados: sin nulos, sin vacíos, sin duplicados y en orden alfabético.
 *
 * La RPC ya normaliza y ordena en SQL; esto lo repite en cliente a propósito,
 * por dos motivos: deja el contrato del componente garantizado sea cual sea la
 * versión de la función desplegada, y hace la lógica verificable con tests.
 * El coste es irrelevante — el payload son ~200 filas, no 12.288.
 */
export function buildSupplierFilterOptions(
  rows: SupplierFacetRow[] | null | undefined,
): SupplierFilterOptions {
  return {
    countries: collectFacet(rows, 'country'),
    regions: collectFacet(rows, 'region'),
  }
}

function collectFacet(
  rows: SupplierFacetRow[] | null | undefined,
  facet: string,
): string[] {
  if (!Array.isArray(rows)) return []

  const unicos = new Set<string>()
  for (const row of rows) {
    if (!row || row.facet !== facet) continue
    // Los espacios exteriores no deben generar entradas duplicadas en el
    // desplegable ("España" y "España " son la misma opción).
    const valor = typeof row.value === 'string' ? row.value.trim() : ''
    if (valor !== '') unicos.add(valor)
  }

  // localeCompare('es') en lugar de sort() por defecto: el orden por unidades
  // de código UTF-16 colocaría "Ávila" detrás de "Zaragoza".
  return Array.from(unicos).sort((a, b) => a.localeCompare(b, 'es'))
}

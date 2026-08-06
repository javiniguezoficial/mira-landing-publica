// Lonjas disponibles en los precios (2.4 → 034 → reescrita en 037).
//
// ── El fallo que se corrige en 037 ─────────────────────────────────────────
//
// Estas funciones leían FILAS de `product_price_records` y deducían los valores
// distintos en JavaScript. Con `.limit(50_000)` parecía suficiente, pero ese
// límite nunca llegó a aplicarse: PostgREST recorta toda respuesta en
// `db-max-rows` —1.000 filas en este proyecto— y un `limit` mayor no lo levanta.
//
// Consecuencia exacta, medida sobre los datos reales:
//
//   «Canal Estándar»   2.523 precios   20 lonjas
//                      …pero en las 1.000 primeras filas solo hay 8.
//
// Ese es, literalmente, el «solo aparecen las ocho primeras» que reporta el
// cliente. No había ningún `slice(0, 8)`: el recorte lo hacía el servidor, en
// silencio y sin error.
//
// ── La solución ────────────────────────────────────────────────────────────
//
// El `distinct` lo hace PostgreSQL y devuelve UN escalar `jsonb` ya agregado
// (migración 037). Una respuesta de una sola fila no la puede recortar el techo
// de filas, sea cual sea el tamaño de la tabla — el problema desaparece por
// construcción en lugar de moverse a un número mayor.
//
// De paso deja de viajar el histórico entero por la red: antes se traían miles
// de filas para quedarse con veinte cadenas.
//
// ── Sobre RLS ──────────────────────────────────────────────────────────────
//
// Las funciones son SECURITY INVOKER, así que las policies se aplican igual que
// con la consulta directa que sustituyen: una lonja que solo exista en un
// mercado deshabilitado para la organización (028) no llega hasta aquí.

import { createClient } from '@/lib/supabase/server'

/** Orden alfabético español. En JS y no en SQL: sabe de acentos y de ñ. */
function ordenarEs(valores: Iterable<string>): string[] {
  return [...new Set(valores)].sort((a, b) => a.localeCompare(b, 'es'))
}

/** Limpia y descarta vacíos lo que venga del agregado. */
function lonjasLimpias(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const salida: string[] = []
  for (const valor of raw) {
    if (typeof valor !== 'string') continue
    const limpio = valor.trim()
    if (limpio) salida.push(limpio)
  }
  return salida
}

/**
 * Qué lonjas tiene cada producto, según sus precios.
 *
 * Una sola llamada para TODO el catálogo. La alternativa —preguntar por
 * producto— serían cientos de consultas para pintar un desplegable.
 */
export async function getLonjasByProduct(): Promise<Map<string, Set<string>>> {
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('market_catalog_lonjas')

  const mapa = new Map<string, Set<string>>()
  if (error || !data || typeof data !== 'object') {
    if (error) console.error(`[lonjas] market_catalog_lonjas: ${error.code ?? '?'} ${error.message}`)
    return mapa
  }

  for (const [productId, lonjas] of Object.entries(data as Record<string, unknown>)) {
    const limpias = lonjasLimpias(lonjas)
    if (limpias.length > 0) mapa.set(productId, new Set(limpias))
  }

  return mapa
}

/**
 * Lonjas de UN producto, ordenadas en español.
 *
 * Es lo que puebla el selector de la ficha de producto, y desde 037 las
 * devuelve TODAS: veinte para «Canal Estándar», veintisiete para «Leche Mundo».
 */
export async function getProductLonjas(productId: string): Promise<string[]> {
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('market_product_lonjas', {
    p_product_id: productId,
  })

  if (error) {
    console.error(`[lonjas] market_product_lonjas: ${error.code ?? '?'} ${error.message}`)
    return []
  }

  return ordenarEs(lonjasLimpias(data))
}

/** Facetas del panel de precios: valores distintos de lonja y de unidad. */
export interface PriceFacetValues {
  lonjas: string[]
  units: string[]
}

export async function getPriceFacetValues(): Promise<PriceFacetValues> {
  const supabase = await createClient()

  const { data, error } = await supabase.rpc('market_price_facets')

  if (error || !data || typeof data !== 'object') {
    if (error) console.error(`[lonjas] market_price_facets: ${error.code ?? '?'} ${error.message}`)
    return { lonjas: [], units: [] }
  }

  const bruto = data as { lonjas?: unknown; units?: unknown }
  return {
    lonjas: ordenarEs(lonjasLimpias(bruto.lonjas)),
    units: ordenarEs(lonjasLimpias(bruto.units)),
  }
}

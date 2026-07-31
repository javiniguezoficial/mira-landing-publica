// Lonjas disponibles en los precios (Fase 2.4, reescrita en 034).
//
// ── Qué cambia respecto a 2.4 ──────────────────────────────────────────────
//
// El filtro de lonja se construía sobre `products.lonja`: la lonja era un
// atributo del PRODUCTO, así que filtrar precios por lonja era en realidad
// filtrar productos. Desde 034 cada precio lleva su propia lonja y una misma
// referencia puede cotizar en España, Alemania y Europa a la vez, de modo que
// preguntar «¿de qué lonja es este producto?» ya no tiene una única respuesta.
//
// Estas consultas responden a la pregunta correcta: **de qué lonjas hay precios**.
//
// ── Sobre RLS ──────────────────────────────────────────────────────────────
//
// No hay ningún filtro de organización escrito aquí, y es correcto:
// `product_price_records` está bajo RLS y las policies ya excluyen los mercados
// deshabilitados para la organización (028). Lo que devuelven estas funciones es
// exactamente lo que quien pregunta puede ver, sin que este módulo tenga que
// saber quién es.

import { createClient } from '@/lib/supabase/server'

/**
 * Techo de filas leídas al construir el mapa de lonjas.
 *
 * Se leen DOS columnas, no el histórico entero, y nunca viajan al navegador: el
 * resultado que sale de aquí es una lista de nombres. Con 608 precios reales el
 * límite ni se roza; existe para que el día que haya 200.000 la pantalla no
 * intente cargarlos todos en memoria en silencio.
 *
 * Si se alcanza, se avisa por consola: es preferible una lonja que falta en el
 * desplegable y un aviso en los registros, a un proceso sin memoria.
 */
export const MAX_LONJA_SCAN_ROWS = 50_000

/**
 * Qué lonjas tiene cada producto, según sus precios.
 *
 * Una sola consulta para TODO el catálogo. La alternativa —preguntar por
 * producto— serían cientos de consultas para pintar un desplegable.
 */
export async function getLonjasByProduct(): Promise<Map<string, Set<string>>> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('product_price_records')
    .select('product_id, lonja')
    .not('lonja', 'is', null)
    .limit(MAX_LONJA_SCAN_ROWS)

  const mapa = new Map<string, Set<string>>()
  if (error || !data) return mapa

  if (data.length >= MAX_LONJA_SCAN_ROWS) {
    console.warn(
      `[lonjas] se ha alcanzado el techo de ${MAX_LONJA_SCAN_ROWS} filas: ` +
      'el selector puede no mostrar todas las lonjas.',
    )
  }

  for (const fila of data as Array<{ product_id: string; lonja: string | null }>) {
    const lonja = (fila.lonja ?? '').trim()
    if (!lonja) continue
    const actual = mapa.get(fila.product_id)
    if (actual) actual.add(lonja)
    else mapa.set(fila.product_id, new Set([lonja]))
  }

  return mapa
}

/**
 * Lonjas de UN producto, ordenadas en español.
 *
 * Es lo que puebla el selector de la ficha de producto. Se apoya en
 * `idx_ppr_product_lonja_recorded`, así que no recorre la tabla.
 */
export async function getProductLonjas(productId: string): Promise<string[]> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('product_price_records')
    .select('lonja')
    .eq('product_id', productId)
    .not('lonja', 'is', null)
    .limit(MAX_LONJA_SCAN_ROWS)

  const set = new Set<string>()
  for (const fila of (data ?? []) as Array<{ lonja: string | null }>) {
    const lonja = (fila.lonja ?? '').trim()
    if (lonja) set.add(lonja)
  }

  return [...set].sort((a, b) => a.localeCompare(b, 'es'))
}

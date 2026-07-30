// Filtro por lonja de Market Intelligence (Fase 2.4).
//
// Módulo puro.
//
// ── QUÉ ES UNA LONJA EN EL MODELO REAL ──────────────────────────────────────
//
// No es una tabla. Es la columna `products.lonja`, TEXTO LIBRE y nullable.
// Comprobado sobre los datos: 930 de 931 productos la tienen informada y hay
// 102 valores distintos. `product_price_records.source_id` existe pero está sin
// FK y con 0 filas usándola — es una columna huérfana, no la lonja.
//
// Consecuencia de diseño, y es importante: la lonja NO cuelga del registro de
// precio sino del PRODUCTO. Filtrar precios por lonja significa filtrar por un
// atributo del producto al que pertenecen, que es exactamente lo que ya hacía
// `applyPriceListFilters` con `product.lonja` vía embed `!inner`.
//
// ── Por qué NO se normaliza a tabla en este bloque ──────────────────────────
//
// Convertir 102 cadenas libres en una tabla de lonjas exige decidir cuáles son
// la misma con otra grafía, y esa decisión es del negocio, no del código. Una
// migración que agrupe mal fusiona series de precios de mercados distintos y no
// hay forma de deshacerlo desde los datos resultantes. Aquí se implementa la
// solución mínima segura sobre el modelo existente —comparación exacta contra
// la lista real de valores— y la normalización queda propuesta como deuda
// técnica en `docs/market-intelligence-bulk-import-design.md`.

/** Valor del selector que significa «no filtrar». Vacío en la URL. */
export const ALL_LONJAS = ''

/** Nombre del search param. */
export const LONJA_PARAM = 'lonja'

/** Etiqueta de la opción sin filtro. */
export const ALL_LONJAS_LABEL = 'Todas las lonjas'

/**
 * Normaliza un valor de lonja para compararlo.
 *
 * Solo recorta espacios. NO baja a minúsculas ni quita acentos: la comparación
 * contra la base de datos es exacta (`eq`), así que alterar el valor aquí
 * produciría un filtro que no casa con ninguna fila. La normalización agresiva
 * pertenece a la futura tabla de lonjas, no a este filtro.
 */
export function normalizeLonja(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim() : ''
}

/**
 * Valida la lonja recibida contra el conjunto REALMENTE disponible.
 *
 * Es una allowlist, no un saneado. Una lonja que no está en `available` —porque
 * no existe, porque pertenece a otro mercado o porque su mercado está
 * deshabilitado para la organización— cae a «todas», nunca se pasa a la
 * consulta. Así el filtro no puede usarse para sondear qué lonjas existen fuera
 * de lo que esta persona puede ver.
 *
 * Devolver «todas» en lugar de un error es deliberado: la lista de lonjas
 * cambia al cambiar de mercado, y una URL guardada con la lonja de otro mercado
 * debe seguir abriendo la pantalla, no romperla.
 */
export function resolveLonja(raw: unknown, available: readonly string[]): string {
  const value = normalizeLonja(raw)
  if (!value) return ALL_LONJAS
  return available.includes(value) ? value : ALL_LONJAS
}

/** Valores únicos, sin vacíos, ordenados en español. Para poblar el selector. */
export function collectLonjas(values: readonly (string | null | undefined)[]): string[] {
  const set = new Set<string>()
  for (const value of values) {
    const clean = normalizeLonja(value)
    if (clean) set.add(clean)
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'es'))
}

/** Texto accesible del selector según la lonja activa. */
export function lonjaAriaLabel(active: string): string {
  return active ? `Lonja seleccionada: ${active}` : `Lonja: ${ALL_LONJAS_LABEL.toLowerCase()}`
}

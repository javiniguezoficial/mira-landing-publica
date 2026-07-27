// Helpers puros de paginación por URL, compartidos por los listados que paginan
// con `searchParams` (`?page=N`) y navegan mediante enlaces.
//
// Sin dependencias de Next ni de Supabase: son funciones puras y testeables.

/**
 * Normaliza el parámetro `page` de la URL a un entero >= 1.
 *
 * Cualquier valor ausente, no numérico, cero o negativo cae en 1, de modo que
 * el offset calculado a partir de aquí nunca puede ser negativo.
 */
export function parsePage(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? '', 10)
  return Number.isFinite(n) && n > 1 ? n : 1
}

/** Offset 0-based de la página indicada. Nunca negativo si `page` viene de parsePage(). */
export function pageOffset(page: number, pageSize: number): number {
  return Math.max(0, (page - 1) * pageSize)
}

/** Número total de páginas; siempre al menos 1 (una lista vacía es "página 1 de 1"). */
export function totalPages(total: number, pageSize: number): number {
  if (pageSize <= 0) return 1
  return Math.max(1, Math.ceil(total / pageSize))
}

/**
 * Rango 1-based de elementos que se están mostrando ("201–400"), calculado a
 * partir de las filas realmente devueltas para que la última página muestre su
 * tamaño real. Devuelve null si la página no tiene filas.
 */
export function pageRange(
  page: number,
  pageSize: number,
  itemsOnPage: number,
): { from: number; to: number } | null {
  if (itemsOnPage <= 0) return null
  const from = pageOffset(page, pageSize) + 1
  return { from, to: from + itemsOnPage - 1 }
}

/** Convierte un valor de searchParams en número, o undefined si no es válido. */
export function toNum(raw: string | undefined): number | undefined {
  if (!raw || raw.trim() === '') return undefined
  const n = Number.parseFloat(raw.replace(',', '.'))
  return Number.isNaN(n) ? undefined : n
}

/**
 * Construye una URL conservando únicamente los parámetros con valor. Los
 * `undefined` y las cadenas vacías se descartan, así que los filtros inactivos
 * no ensucian la query string al cambiar de página.
 */
export function buildUrl(
  base: string,
  params: Record<string, string | number | undefined>,
): string {
  const sp = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== '') sp.set(k, String(v))
  }
  const qs = sp.toString()
  return `${base}${qs ? `?${qs}` : ''}`
}

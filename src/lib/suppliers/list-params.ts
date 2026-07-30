// Parámetros del listado de proveedores (Fase 3.1, 3.3 y 3.4).
//
// Módulo puro: sin Next, sin Supabase. Es la ÚNICA fuente de verdad sobre qué
// filtros existen, cómo se ordenan los resultados y cómo viaja todo eso por la
// URL. Lo comparten el listado de administración, el de cliente y la
// exportación, para que no pueda ocurrir lo peor de una exportación: que
// devuelva un conjunto distinto del que se está viendo en pantalla.

// ── Ordenación ──────────────────────────────────────────────────────────────
//
// ALLOWLIST cerrada. El valor de la URL NUNCA llega a SQL: se traduce a un
// identificador que la función `search_suppliers` conoce, y esa función tiene
// su propio `case` con los mismos valores. Un nombre de columna escrito en la
// URL no puede acabar en un `order by`.
//
// ── Qué ordenaciones existen y por qué ──────────────────────────────────────
//
// Solo se ofrecen las que los datos reales sostienen. Medido sobre los 12.288
// proveedores:
//
//   name         100 %   → A–Z y Z–A
//   country      100 %   → País A–Z
//   created_at   100 %   → Más recientes / más antiguos
//   city/region   39 %   → se ofrecen con NULLS LAST, ver abajo
//   produccion_value 34 % (4.118) → mayor/menor primero
//   latitude/longitude 100 % → NO se ofrece «distancia»: haría falta un punto
//                              de referencia del usuario, y no existe.
//
// `created_at` tiene solo 125 valores distintos —son lotes de importación, no
// altas individuales—, así que «más recientes» agrupa por lote. Se mantiene
// porque sigue siendo útil para ver lo último cargado, y el desempate por `id`
// la hace determinista.

export const SUPPLIER_SORTS = [
  'name_asc',
  'name_desc',
  'created_desc',
  'created_asc',
  'country_asc',
  'city_asc',
  'region_asc',
  'produccion_desc',
  'produccion_asc',
] as const

export type SupplierSort = (typeof SUPPLIER_SORTS)[number]

export const DEFAULT_SUPPLIER_SORT: SupplierSort = 'name_asc'

/**
 * Etiquetas visibles.
 *
 * Ninguna dice solo «Mayor a menor»: sin el criterio delante no se sabe mayor
 * en qué. Aquí siempre va el campo primero.
 */
export const SUPPLIER_SORT_LABELS: Record<SupplierSort, string> = {
  name_asc: 'Nombre: A–Z',
  name_desc: 'Nombre: Z–A',
  created_desc: 'Más recientes',
  created_asc: 'Más antiguos',
  country_asc: 'País: A–Z',
  city_asc: 'Localidad: A–Z',
  region_asc: 'Provincia: A–Z',
  produccion_desc: 'Producción: mayor primero',
  produccion_asc: 'Producción: menor primero',
}

/**
 * Aviso para las ordenaciones cuyo campo no está informado en todos los
 * proveedores. Se enseña junto al selector: sin esto, quien ordene por
 * localidad creerá que faltan resultados cuando en realidad están al final.
 */
export const SUPPLIER_SORT_NOTES: Partial<Record<SupplierSort, string>> = {
  city_asc: 'Los proveedores sin localidad aparecen al final.',
  region_asc: 'Los proveedores sin provincia aparecen al final.',
  produccion_desc: 'Los proveedores sin producción informada aparecen al final.',
  produccion_asc: 'Los proveedores sin producción informada aparecen al final.',
}

export function isSupplierSort(value: unknown): value is SupplierSort {
  return SUPPLIER_SORTS.some((s) => s === value)
}

/** Normaliza lo que llega de la URL. Un valor inesperado cae al default. */
export function parseSupplierSort(raw: unknown): SupplierSort {
  if (typeof raw !== 'string') return DEFAULT_SUPPLIER_SORT
  const clean = raw.trim().toLowerCase()
  return isSupplierSort(clean) ? clean : DEFAULT_SUPPLIER_SORT
}

// ── Nombres de los search params ────────────────────────────────────────────
//
// Un solo sitio donde cambiarlos. `q` ya existía para el filtro principal por
// nombre; la búsqueda secundaria estrena `qr` («query en resultados») para no
// pisarlo.

export const SUPPLIER_PARAM = {
  search: 'q',
  secondarySearch: 'qr',
  sort: 'sort',
  page: 'page',
} as const

/**
 * Longitud máxima de la búsqueda secundaria.
 *
 * Acotar el término no es cosmético: acaba dentro de un `like '%…%'` sobre
 * 12.288 filas, y una cadena de kilobytes sería trabajo inútil para el motor.
 */
export const MAX_SECONDARY_SEARCH_LENGTH = 100

/**
 * Normaliza la búsqueda secundaria.
 *
 * Solo recorta y colapsa espacios. NO se escapan aquí los comodines de `like`:
 * el término viaja como PARÁMETRO de una función SQL, nunca concatenado, así
 * que no hay inyección posible. El escapado de `%` y `_` se hace en SQL, donde
 * está la comparación, para que un nombre con guion bajo no case de más.
 */
export function parseSecondarySearch(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  return raw.trim().replace(/\s+/g, ' ').slice(0, MAX_SECONDARY_SEARCH_LENGTH)
}

// ── Filtros ─────────────────────────────────────────────────────────────────

/**
 * Filtros del listado, tal y como viajan por la URL.
 *
 * Los nombres coinciden con los search params reales que ya usaban las dos
 * páginas. No se renombra nada: los enlaces guardados deben seguir funcionando.
 */
export interface SupplierListParams {
  q?: string
  qr?: string
  country?: string
  region?: string
  produccion_min?: string
  produccion_max?: string
  supplier_market_id?: string
  supplier_category_id?: string
  supplier_family_id?: string
  supplier_subfamily_id?: string
  sort?: string
  page?: string
  /**
   * Firma de índice para poder pasarlo a los constructores de URL genéricos
   * que ya existen (`buildUrl` de `lib/pagination`). Sin ella habría que
   * duplicar esos ayudantes solo por el tipo.
   */
  [key: string]: string | number | undefined
}

/** Claves de filtro, sin búsqueda secundaria, orden ni paginación. */
export const SUPPLIER_FILTER_KEYS = [
  'q',
  'country',
  'region',
  'produccion_min',
  'produccion_max',
  'supplier_market_id',
  'supplier_category_id',
  'supplier_family_id',
  'supplier_subfamily_id',
] as const

export interface NormalizedSupplierParams {
  filters: Record<string, string | undefined>
  secondarySearch: string
  sort: SupplierSort
  page: number
  /** ¿Hay algún filtro activo, sin contar la búsqueda secundaria? */
  hasFilters: boolean
  /** ¿Hay algo que limpiar, incluida la búsqueda secundaria? */
  hasAnything: boolean
}

/**
 * Convierte los search params crudos en un objeto normalizado.
 *
 * Es el punto por el que pasan el listado y la exportación, y por eso la
 * exportación no puede desviarse de lo que se ve en pantalla.
 */
export function normalizeSupplierParams(sp: SupplierListParams): NormalizedSupplierParams {
  const filters: Record<string, string | undefined> = {}
  for (const key of SUPPLIER_FILTER_KEYS) {
    const value = sp[key]
    if (typeof value === 'string' && value.trim() !== '') filters[key] = value.trim()
  }

  const secondarySearch = parseSecondarySearch(sp.qr)
  const sort = parseSupplierSort(sp.sort)
  const page = Math.max(1, Number(sp.page) || 1)

  const hasFilters = Object.keys(filters).length > 0

  return {
    filters,
    secondarySearch,
    sort,
    page,
    hasFilters,
    hasAnything: hasFilters || secondarySearch !== '' || sort !== DEFAULT_SUPPLIER_SORT,
  }
}

// ── Construcción de URLs ────────────────────────────────────────────────────

type UrlValue = string | number | undefined | null

function toQueryString(entries: Record<string, UrlValue>): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(entries)) {
    if (value === undefined || value === null || value === '') continue
    params.set(key, String(value))
  }
  return params.toString()
}

/**
 * Enlace conservando TODO y cambiando solo lo indicado.
 *
 * ── La regla de la paginación ───────────────────────────────────────────────
 *
 * Cambiar filtro, búsqueda u orden vuelve a la página 1, SIEMPRE. La página 7
 * de otro conjunto no significa nada, y dejarla puesta produce el clásico
 * «no hay resultados» sobre una búsqueda que sí los tiene. Solo cambiar de
 * página conserva la página.
 */
export function buildSupplierUrl(
  basePath: string,
  current: SupplierListParams,
  changes: Partial<Record<keyof SupplierListParams, UrlValue>> = {},
): string {
  const merged: Record<string, UrlValue> = { ...current, ...changes }

  // Cualquier cambio que no sea de página reinicia la paginación.
  const soloCambiaPagina =
    Object.keys(changes).length > 0 &&
    Object.keys(changes).every((k) => k === SUPPLIER_PARAM.page)

  if (!soloCambiaPagina && Object.keys(changes).length > 0) {
    merged[SUPPLIER_PARAM.page] = undefined
  }

  // El orden por defecto no se escribe en la URL: no aporta y la ensucia.
  if (merged[SUPPLIER_PARAM.sort] === DEFAULT_SUPPLIER_SORT) {
    merged[SUPPLIER_PARAM.sort] = undefined
  }
  if (merged[SUPPLIER_PARAM.page] === 1 || merged[SUPPLIER_PARAM.page] === '1') {
    merged[SUPPLIER_PARAM.page] = undefined
  }

  const qs = toQueryString(merged)
  return qs ? `${basePath}?${qs}` : basePath
}

/** Limpia SOLO la búsqueda secundaria. */
export function buildClearSecondarySearchUrl(
  basePath: string,
  current: SupplierListParams,
): string {
  return buildSupplierUrl(basePath, current, { [SUPPLIER_PARAM.secondarySearch]: undefined })
}

/**
 * Limpia TODOS los filtros y la búsqueda, conservando el orden.
 *
 * El orden se conserva a propósito: es una preferencia de visualización, no un
 * filtro, y perderlo al limpiar resulta desconcertante.
 */
export function buildClearFiltersUrl(basePath: string, current: SupplierListParams): string {
  const sort = parseSupplierSort(current.sort)
  return buildSupplierUrl(basePath, {}, { sort: sort === DEFAULT_SUPPLIER_SORT ? undefined : sort })
}

// ── Exportación ─────────────────────────────────────────────────────────────

/**
 * Techo de filas de una exportación.
 *
 * 12.288 proveedores caben, pero el límite se declara igualmente: protege de un
 * catálogo que crezca y hace que el aviso al usuario sea posible en lugar de
 * que el proceso de Node se quede sin memoria en silencio.
 */
export const MAX_EXPORT_ROWS = 15_000

/** Cuántas filas se piden por tanda al construir la exportación. */
export const EXPORT_BATCH_SIZE = 1_000

export const EXPORT_MODES = ['filtered', 'selected'] as const
export type ExportMode = (typeof EXPORT_MODES)[number]

export function parseExportMode(raw: unknown): ExportMode {
  return raw === 'selected' ? 'selected' : 'filtered'
}

/** Cuántos identificadores admite «exportar seleccionados». */
export const MAX_SELECTED_IDS = 1_000

/** `proveedores-2026-07-30.xlsx` */
export function buildExportFilename(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `proveedores-${y}-${m}-${d}.xlsx`
}

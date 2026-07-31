// Borrado administrado de precios (035) — contrato.
//
// Módulo PURO: sin Next, sin Supabase. Define los modos, los filtros admitidos
// y —lo más importante— las frases que hay que teclear para confirmar.
//
// ── Por qué una frase y no un «¿estás seguro?» ─────────────────────────────
//
// Porque un diálogo de confirmación se acepta con la misma inercia con la que
// se pulsó el botón. Escribir «ELIMINAR TODOS LOS PRECIOS» a mano obliga a leer
// qué se está haciendo, y es la única barrera que no se salta por costumbre.
// Es la misma razón por la que GitHub pide el nombre del repositorio para
// borrarlo.

// ── Modos ───────────────────────────────────────────────────────────────────

export const DELETION_MODES = ['import', 'filters', 'all'] as const

export type DeletionMode = (typeof DELETION_MODES)[number]

export function isDeletionMode(value: unknown): value is DeletionMode {
  return DELETION_MODES.some((m) => m === value)
}

export const DELETION_MODE_LABELS: Record<DeletionMode, string> = {
  import: 'Importación completa',
  filters: 'Precios filtrados',
  all: 'Todos los precios',
}

// ── Estados ─────────────────────────────────────────────────────────────────

export const DELETION_BATCH_STATUSES = [
  /** Vista previa hecha y guardada. Pendiente de confirmar. */
  'ready',
  'completed',
  /** Se borró, pero algún precio ya no existía al confirmar. */
  'completed_with_errors',
  'cancelled',
  'failed',
] as const

export type DeletionBatchStatus = (typeof DELETION_BATCH_STATUSES)[number]

export const DELETION_BATCH_STATUS_LABELS: Record<DeletionBatchStatus, string> = {
  ready: 'Pendiente de confirmar',
  completed: 'Completado',
  completed_with_errors: 'Completado con avisos',
  cancelled: 'Descartado',
  failed: 'Fallido',
}

/** Un lote solo se aplica desde `ready`, y una sola vez. */
export function canApplyDeletion(status: DeletionBatchStatus): boolean {
  return status === 'ready'
}

export function canCancelDeletion(status: DeletionBatchStatus): boolean {
  return status === 'ready'
}

export function isDeletionFinal(status: DeletionBatchStatus): boolean {
  return status === 'completed' || status === 'completed_with_errors' || status === 'cancelled'
}

// ── Filtros ─────────────────────────────────────────────────────────────────
//
// Los mismos campos por los que ya se puede filtrar el listado de precios, para
// que quien busca un precio y quien lo borra estén hablando del mismo conjunto.

export interface PriceDeletionFilters {
  market_id?: string
  product_id?: string
  lonja?: string
  date_from?: string
  date_to?: string
  currency?: string
  unit?: string
}

export const DELETION_FILTER_KEYS: readonly (keyof PriceDeletionFilters)[] = [
  'market_id', 'product_id', 'lonja', 'date_from', 'date_to', 'currency', 'unit',
]

export const DELETION_FILTER_LABELS: Record<keyof PriceDeletionFilters, string> = {
  market_id: 'Mercado',
  product_id: 'Referencia',
  lonja: 'Lonja',
  date_from: 'Desde',
  date_to: 'Hasta',
  currency: 'Moneda',
  unit: 'Unidad',
}

/**
 * Deja solo los filtros con valor, ya recortados.
 *
 * Lo que devuelve es lo que se guarda en `filters` del lote y lo que se enseña
 * en la auditoría: si un filtro llegó vacío, es que no se aplicó, y guardarlo
 * como cadena vacía haría creer meses después que sí.
 */
export function normalizeDeletionFilters(raw: PriceDeletionFilters): PriceDeletionFilters {
  const limpio: PriceDeletionFilters = {}
  for (const clave of DELETION_FILTER_KEYS) {
    const valor = raw[clave]
    if (typeof valor === 'string' && valor.trim() !== '') limpio[clave] = valor.trim()
  }
  return limpio
}

export function hasAnyDeletionFilter(filters: PriceDeletionFilters): boolean {
  return Object.keys(normalizeDeletionFilters(filters)).length > 0
}

/** «Mercado: Cereales · Lonja: Ebro · Desde: 2024-01-01» */
export function describeDeletionFilters(filters: PriceDeletionFilters): string {
  const partes = DELETION_FILTER_KEYS
    .filter((k) => filters[k])
    .map((k) => `${DELETION_FILTER_LABELS[k]}: ${filters[k]}`)
  return partes.length > 0 ? partes.join(' · ') : 'Sin filtros'
}

// ── Frases de confirmación ──────────────────────────────────────────────────

export const CONFIRM_PHRASE_IMPORT = 'ELIMINAR IMPORTACIÓN'
export const CONFIRM_PHRASE_ALL = 'ELIMINAR TODOS LOS PRECIOS'

/** `ELIMINAR 608 PRECIOS` */
export function confirmPhraseForFilters(total: number): string {
  return `ELIMINAR ${total} ${total === 1 ? 'PRECIO' : 'PRECIOS'}`
}

/**
 * La frase exacta que hay que escribir para este lote.
 *
 * El recuento va DENTRO de la frase a propósito: si entre la vista previa y la
 * confirmación cambiara el número, la frase escrita dejaría de coincidir y el
 * botón se apagaría solo.
 */
export function confirmPhraseFor(mode: DeletionMode, total: number): string {
  if (mode === 'all') return CONFIRM_PHRASE_ALL
  if (mode === 'import') return CONFIRM_PHRASE_IMPORT
  return confirmPhraseForFilters(total)
}

/**
 * ¿Lo escrito autoriza el borrado?
 *
 * Se comparan las dos cadenas ya recortadas y en mayúsculas: nadie debería
 * fallar por un espacio de más al pegar, pero tampoco vale «eliminar» a secas.
 */
export function isConfirmPhraseValid(input: string, mode: DeletionMode, total: number): boolean {
  return input.trim().toUpperCase().replace(/\s+/g, ' ') === confirmPhraseFor(mode, total)
}

// ── Estructuras ─────────────────────────────────────────────────────────────

export interface DeletionBatchSummary {
  id: string
  mode: DeletionMode
  status: DeletionBatchStatus
  filters: PriceDeletionFilters
  sourceImportBatchId: string | null
  totalRows: number
  deletedRows: number
  failedRows: number
  createdAt: string
  confirmedAt: string | null
  completedAt: string | null
  createdByName: string | null
  /** Contexto legible del origen: nombre de fichero, rangos, lonjas… */
  metadata: Record<string, unknown>
}

/** Una fila de la vista previa, tal y como se enseña. */
export interface DeletionPreviewRow {
  originalPriceId: string
  productName: string | null
  marketName: string | null
  lonja: string | null
  recordedAt: string | null
  price: number | null
  currency: string | null
  unit: string | null
  sourceImportBatchId: string | null
  status: string
}

/** Techo de filas que se pueden preparar en una sola operación. */
export const MAX_DELETION_ROWS = 200_000

/** Cuántas filas de la vista previa viajan al navegador de una vez. */
export const DELETION_PREVIEW_PAGE_SIZE = 50

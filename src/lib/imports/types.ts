// Tipos y constantes de la importación masiva de precios (Fase 2.5, MVP).
//
// Módulo puro, compartido por el validador, las Server Actions y la interfaz.

import type { ImportPeriodType } from './period'

// ── Límites ─────────────────────────────────────────────────────────────────
//
// Se comprueban ANTES de leer el contenido del fichero. Un límite que solo se
// verifica después de cargar 200 MB en memoria no protege de nada.

export const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024 // 10 MB
/**
 * Filas por importación.
 *
 * 15.000 y no 20.000 porque es lo que la base sostiene con margen. Medido
 * contra el remoto con fixtures sintéticos y rollback, `commit_market_import`
 * tarda en el peor de cinco intentos 4,7 s con 15.000 filas y 8,4 s con
 * 20.000 — por encima del `statement_timeout` de 8 s del rol `authenticated`.
 * Prometer 20.000 era prometer una importación que a veces se cancela.
 */
export const MAX_IMPORT_ROWS = 15_000

/**
 * Cuántas filas se envían al navegador de una vez en la previsualización.
 *
 * 15.000 filas serían varios megabytes de JSON y un DOM inmanejable. La tabla
 * pagina contra el servidor.
 */
export const IMPORT_PREVIEW_PAGE_SIZE = 50

/** Extensiones y tipos MIME admitidos. La extensión NO es de fiar por sí sola. */
export const ACCEPTED_IMPORT_EXTENSIONS = ['.csv'] as const
export const ACCEPTED_IMPORT_MIME_TYPES = [
  'text/csv',
  'text/plain',
  'application/csv',
  'application/vnd.ms-excel', // lo que pone Excel al guardar un CSV
  '', // algunos navegadores no envían tipo
] as const

// ── Formato del fichero ─────────────────────────────────────────────────────

export const REQUIRED_IMPORT_COLUMNS = [
  'market_slug',
  'product_slug',
  'recorded_at',
  'price',
  'currency',
  'unit',
] as const

export const OPTIONAL_IMPORT_COLUMNS = [
  'lonja',
  'country',
  'region',
  'min_price',
  'max_price',
  'avg_price',
  'volume',
  'source',
  'notes',
] as const

export const ALL_IMPORT_COLUMNS = [
  ...REQUIRED_IMPORT_COLUMNS,
  ...OPTIONAL_IMPORT_COLUMNS,
] as const

export type ImportColumn = (typeof ALL_IMPORT_COLUMNS)[number]

// ── Estados ─────────────────────────────────────────────────────────────────
//
// Se implementan los estados que el MVP recorre de verdad. `validating` e
// `importing` no existen como estado persistido: ambas operaciones son
// síncronas dentro de una petición, y un estado que nunca se puede observar solo
// añadiría transiciones que probar sin describir nada real.

export const IMPORT_BATCH_STATUSES = [
  /** Validado. Hay al menos una fila importable. */
  'ready',
  /** Validado y NINGUNA fila es importable. */
  'invalid',
  /** Importado. */
  'completed',
  /** Importado, pero había filas inválidas o duplicadas que se omitieron. */
  'completed_with_errors',
  /** Descartado antes de importar. */
  'cancelled',
] as const

export type ImportBatchStatus = (typeof IMPORT_BATCH_STATUSES)[number]

export const IMPORT_ROW_STATUSES = [
  'valid',
  'invalid',
  /** Choca con la clave natural: ya existe en la base o se repite en el fichero. */
  'duplicate',
  'imported',
] as const

export type ImportRowStatus = (typeof IMPORT_ROW_STATUSES)[number]

/** Estados desde los que TODAVÍA se puede importar. */
export function canCommitBatch(status: ImportBatchStatus): boolean {
  return status === 'ready'
}

/** Estados desde los que se puede cancelar. */
export function canCancelBatch(status: ImportBatchStatus): boolean {
  return status === 'ready' || status === 'invalid'
}

/** Un batch ya cerrado no vuelve a tocarse. */
export function isBatchFinal(status: ImportBatchStatus): boolean {
  return status === 'completed' || status === 'completed_with_errors' || status === 'cancelled'
}

// ── Errores de fila ─────────────────────────────────────────────────────────

export interface ImportRowError {
  /** Columna afectada, o `null` si el error es de la fila entera. */
  column: ImportColumn | null
  message: string
}

/**
 * De dónde ha salido la lonja de la fila (034).
 *
 * Se guarda para poder explicarlo en la vista previa: no es lo mismo «lo dice
 * el fichero» que «lo he cogido de la ficha del producto porque el fichero no
 * lo decía».
 */
export type LonjaSource = 'file' | 'product' | null

/** Fila ya normalizada y resuelta contra el catálogo. */
export interface NormalizedImportRow {
  line: number
  status: ImportRowStatus
  errors: ImportRowError[]
  raw: Record<string, string>

  marketSlug: string
  productSlug: string
  marketId: string | null
  marketName: string | null
  productId: string | null
  productName: string | null
  /**
   * 034 — lonja RESUELTA del registro de precio, no la del producto.
   *
   * Prioridad: la del fichero; si no viene, la configurada en el producto. Es
   * lo que se guarda en `product_price_records.lonja`.
   */
  lonja: string | null
  lonjaSource: LonjaSource

  recordedAt: string | null
  price: number | null
  currency: string | null
  unit: string | null
  country: string
  region: string | null
  minPrice: number | null
  maxPrice: number | null
  avgPrice: number | null
  volume: number | null
  source: string | null
  notes: string | null
}

export interface ImportSummary {
  totalRows: number
  validRows: number
  invalidRows: number
  duplicateRows: number
  /** Mercados distintos resueltos correctamente. */
  marketsFound: number
  productsFound: number
}

export interface ImportBatchSummary {
  id: string
  filename: string
  fileHash: string
  periodType: ImportPeriodType
  periodLabel: string
  periodFrom: string
  periodTo: string
  status: ImportBatchStatus
  totalRows: number
  validRows: number
  invalidRows: number
  duplicateRows: number
  importedRows: number
  createdAt: string
  validatedAt: string | null
  importedAt: string | null
  createdByName: string | null
}

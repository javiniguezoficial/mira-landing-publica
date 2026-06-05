// Tipos y constantes compartidos entre server action y client component

export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024  // 5 MB
export const MAX_ROWS = 1000

export const REQUIRED_COLUMNS = [
  'market_slug',
  'product_slug',
  'recorded_at',
  'price',
  'unit',
] as const

export const ALL_COLUMNS = [
  'market_slug',
  'product_slug',
  'recorded_at',
  'price',
  'unit',
  'currency',
  'country',
  'region',
  'min_price',
  'max_price',
  'avg_price',
  'volume',
  'source_name',
  'notes',
] as const

export interface ValidatedRow {
  rowIndex: number
  product_id: string
  product_name: string
  market_slug: string
  product_slug: string
  recorded_at: string
  price: number
  unit: string
  currency: string
  country: string
  region: string | null
  min_price: number | null
  max_price: number | null
  avg_price: number | null
  volume: number | null
  source_name: string | null
  notes: string | null
  isDuplicate: boolean
}

export interface RowError {
  rowIndex: number
  rawData: Record<string, string>
  errors: string[]
}

export interface ColumnIssues {
  missing: string[]
  extra: string[]
}

export interface ParseResult {
  valid: ValidatedRow[]
  errors: RowError[]
  columnIssues: ColumnIssues | null
  totalRows: number
}

export interface ImportResult {
  inserted: number
  skipped: number
}

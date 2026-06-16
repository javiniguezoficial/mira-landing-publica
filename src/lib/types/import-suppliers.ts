// Tipos y constantes compartidos entre la server action de importación de
// proveedores y el client component. Columnas en español por requisito del
// cliente; separador CSV preferente ';' (Excel ES).

export const MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024  // 5 MB
export const MAX_ROWS = 5000

// Solo 'nombre' es obligatorio
export const REQUIRED_COLUMNS = ['nombre'] as const

export const ALL_COLUMNS = [
  'nombre',
  'email',
  'telefono',
  'web',
  'nif_cif',
  'pais',
  'provincia',
  'localidad',
  'codigo_postal',
  'direccion',
  'latitud',
  'longitud',
  'categoria',
  'mercado',
  'familia',
  'subfamilia',
  'produccion',
  'medida',
  'notas',
  'activo',
] as const

// Fila ya validada y lista para insertar (campos en nomenclatura de la tabla)
export interface ValidatedSupplierRow {
  rowIndex: number
  name: string
  email: string | null
  phone: string | null
  website: string | null
  tax_id: string | null
  country: string
  region: string | null
  city: string | null
  postal_code: string | null
  address: string | null
  latitude: number | null
  longitude: number | null
  category: string | null
  market_id: string | null
  market_input: string | null   // nombre de mercado tal como vino en el archivo
  family: string | null
  subfamily: string | null
  produccion: string | null
  medida: string | null
  notes: string | null
  is_active: boolean
  warnings: string[]
  isDuplicate: boolean          // duplicado por nombre + provincia/localidad → se omite
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
  valid: ValidatedSupplierRow[]
  errors: RowError[]
  columnIssues: ColumnIssues | null
  totalRows: number
}

export interface ImportResult {
  inserted: number
  skipped: number   // duplicados omitidos
}

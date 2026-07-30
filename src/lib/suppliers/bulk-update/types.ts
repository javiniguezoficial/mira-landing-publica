// Actualización masiva de proveedores (Fase 3.2) — contrato del formato.
//
// Módulo PURO: sin Next, sin Supabase, sin `xlsx`. Es la única fuente de verdad
// sobre qué columnas se aceptan, qué campos se pueden escribir y qué significa
// cada celda. Lo comparten el parser, el validador, las Server Actions, la
// interfaz y el informe.
//
// ── Por qué una allowlist y no «todo lo que traiga el fichero» ──────────────
//
// Porque el fichero lo edita una persona en Excel y lo puede traer TODO: la
// fecha de alta, el identificador, columnas inventadas, columnas pegadas de
// otra hoja. Aceptar por defecto significa que el día que alguien añada una
// columna `created_at` con un valor cualquiera, la actualización masiva
// reescriba la fecha de alta de 12.000 proveedores.
//
// La misma allowlist está declarada TRES veces, a propósito:
//
//   1. aquí, para el parser y la interfaz;
//   2. en el CHECK `supplier_update_rows_allowed_fields` de la migración 033,
//      que impide guardar una fila con una clave no autorizada;
//   3. en la asignación campo a campo de `apply_supplier_update`, escrita a
//      mano, sin SQL dinámico.
//
// Cualquiera de las tres por separado bastaría en el camino feliz. Las tres
// juntas son lo que hace que un fallo en la aplicación no llegue a los datos.

// ── Límites ─────────────────────────────────────────────────────────────────
//
// Se comprueban ANTES de leer el contenido. Un límite que solo se verifica
// después de cargar el fichero en memoria no protege de nada.
//
// 10 MB y 20.000 filas cubren con holgura la exportación administrativa
// completa (12.288 proveedores ≈ 2,5 MB) y dejan margen para que el catálogo
// crezca sin tocar esto.

export const MAX_UPDATE_FILE_BYTES = 10 * 1024 * 1024
export const MAX_UPDATE_ROWS = 20_000

/** Cuántas filas viajan al navegador de una vez en la vista previa. */
export const UPDATE_PREVIEW_PAGE_SIZE = 50

/**
 * Solo `.xlsx`.
 *
 * XLSM queda fuera EXPRESAMENTE: es el mismo formato con macros dentro, y no
 * hay ninguna razón para que una hoja de datos las lleve.
 */
export const ACCEPTED_UPDATE_EXTENSIONS = ['.xlsx'] as const

export const ACCEPTED_UPDATE_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream', // algunos navegadores y sistemas no afinan más
  '',                          // y otros directamente no envían tipo
] as const

// ── La convención de la celda ───────────────────────────────────────────────
//
// Es la decisión más delicada de todo el bloque, porque se equivoca en
// silencio: si una celda vacía significara «borrar», abrir la exportación en
// Excel, tocar un teléfono y volver a subirla vaciaría el correo, la dirección
// y las notas de los 12.288 proveedores sin que nadie lo pidiera.
//
//   celda vacía   → NO tocar el campo
//   `__CLEAR__`   → borrar el campo (solo donde sea legal)
//
// Borrar tiene que costar escribir algo. Y ese algo es una palabra que nadie
// teclea por accidente.

export const CLEAR_TOKEN = '__CLEAR__'

// ── Campos actualizables ────────────────────────────────────────────────────

export type UpdatableField =
  | 'name'
  | 'email'
  | 'phone'
  | 'website'
  | 'tax_id'
  | 'country'
  | 'region'
  | 'city'
  | 'postal_code'
  | 'address'
  | 'latitude'
  | 'longitude'
  | 'produccion_value'
  | 'produccion_unit'
  | 'medida'
  | 'notes'
  | 'is_active'
  | 'supplier_market_id'
  | 'supplier_category_id'
  | 'supplier_family_id'
  | 'supplier_subfamily_id'

export type FieldKind = 'text' | 'number' | 'boolean' | 'uuid'

export interface FieldSpec {
  field: UpdatableField
  /** Cabecera EXACTA tal y como la escribe la exportación administrativa. */
  header: string
  kind: FieldKind
  /**
   * ¿Admite `__CLEAR__`?
   *
   * Solo los campos que la base declara nullable. `name`, `country` e
   * `is_active` son NOT NULL en `suppliers`: intentar vaciarlos no es una
   * operación con un resultado feo, es una operación imposible.
   */
  clearable: boolean
  /** Etiqueta corta para la vista previa y el informe. */
  label: string
}

/**
 * La allowlist, en el orden en que se enseña.
 *
 * ── Qué se ha dejado FUERA y por qué ───────────────────────────────────────
 *
 *   id                    es el identificador. Cambiarlo no es actualizar un
 *                         proveedor, es apuntar a otro.
 *   created_at            fecha de alta. No es un dato editable.
 *   updated_at            lo escribe el trigger `suppliers_updated_at`. Que lo
 *                         pusiera el fichero destruiría el único rastro fiable
 *                         de cuándo se tocó cada proveedor.
 *   Clasificación         columna DERIVADA de la exportación: es el camino
 *                         «Mercado › Categoría › Familia › Subfamilia» ya
 *                         montado. Reinterpretarla exigiría partir un texto por
 *                         un separador y adivinar niveles. La taxonomía se
 *                         actualiza por identificador, que no admite dudas.
 *   category, family,
 *   subfamily, produccion,
 *   market_id             clasificación LEGACY en texto libre y enlace a
 *                         Pricing. Están en el formulario individual bajo un
 *                         desplegable que avisa de que no es la clasificación
 *                         principal, y NO salen en la exportación. Ponerlos aquí
 *                         sería invitar a escribir en masa sobre un modelo que
 *                         se está retirando.
 */
export const UPDATABLE_FIELDS: readonly FieldSpec[] = [
  { field: 'name',        header: 'Nombre',          kind: 'text',   clearable: false, label: 'Nombre' },
  { field: 'tax_id',      header: 'NIF/CIF',         kind: 'text',   clearable: true,  label: 'NIF/CIF' },
  { field: 'email',       header: 'Correo',          kind: 'text',   clearable: true,  label: 'Correo' },
  { field: 'phone',       header: 'Teléfono',        kind: 'text',   clearable: true,  label: 'Teléfono' },
  { field: 'website',     header: 'Web',             kind: 'text',   clearable: true,  label: 'Web' },
  { field: 'country',     header: 'País',            kind: 'text',   clearable: false, label: 'País' },
  { field: 'region',      header: 'Provincia',       kind: 'text',   clearable: true,  label: 'Provincia' },
  { field: 'city',        header: 'Localidad',       kind: 'text',   clearable: true,  label: 'Localidad' },
  { field: 'postal_code', header: 'Código postal',   kind: 'text',   clearable: true,  label: 'Código postal' },
  { field: 'address',     header: 'Dirección',       kind: 'text',   clearable: true,  label: 'Dirección' },
  { field: 'latitude',    header: 'Latitud',         kind: 'number', clearable: true,  label: 'Latitud' },
  { field: 'longitude',   header: 'Longitud',        kind: 'number', clearable: true,  label: 'Longitud' },
  { field: 'produccion_value', header: 'Producción', kind: 'number', clearable: true,  label: 'Producción' },
  { field: 'produccion_unit',  header: 'Unidad producción', kind: 'text', clearable: true, label: 'Unidad producción' },
  { field: 'medida',      header: 'Medida',          kind: 'text',   clearable: true,  label: 'Medida' },
  { field: 'notes',       header: 'Notas internas',  kind: 'text',   clearable: true,  label: 'Notas internas' },
  { field: 'is_active',   header: 'Activo',          kind: 'boolean', clearable: false, label: 'Activo' },
  { field: 'supplier_market_id',    header: 'Mercado ID',    kind: 'uuid', clearable: true, label: 'Mercado' },
  { field: 'supplier_category_id',  header: 'Categoría ID',  kind: 'uuid', clearable: true, label: 'Categoría' },
  { field: 'supplier_family_id',    header: 'Familia ID',    kind: 'uuid', clearable: true, label: 'Familia' },
  { field: 'supplier_subfamily_id', header: 'Subfamilia ID', kind: 'uuid', clearable: true, label: 'Subfamilia' },
] as const

export const UPDATABLE_FIELD_NAMES: readonly UpdatableField[] =
  UPDATABLE_FIELDS.map((f) => f.field)

export function fieldSpec(field: UpdatableField): FieldSpec {
  const spec = UPDATABLE_FIELDS.find((f) => f.field === field)
  if (!spec) throw new Error(`Campo no actualizable: ${field}`)
  return spec
}

/** Cabecera del identificador, tal y como la escribe la exportación. */
export const ID_HEADER = 'ID interno'

/**
 * Columnas que se RECONOCEN pero no se escriben.
 *
 * Se ignoran en silencio operativo —se listan en la vista previa, no rompen el
 * fichero— porque son justo las que trae la exportación administrativa. Si
 * rechazáramos el fichero por contenerlas, la exportación dejaría de servir
 * como plantilla, que es el objetivo principal del bloque.
 */
export const IGNORED_HEADERS = [
  'Clasificación',
  'Fecha de alta',
  'Última actualización',
] as const

// ── Normalización de cabeceras ──────────────────────────────────────────────

/**
 * Compara cabeceras sin depender de tildes, mayúsculas ni espacios de más.
 *
 * `«  Código Postal »` y `codigo postal` son la misma columna. Lo que NO se
 * hace es adivinar: dos cabeceras distintas nunca se acercan «por parecido».
 */
export function normalizeHeader(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

/**
 * Cabecera → campo.
 *
 * Acepta la cabecera visible («Notas internas») y también el nombre interno
 * («notes»), para que un fichero generado por un script no tenga que traducir.
 * La tabla es ESTABLE: los nombres visibles no se traducen en tiempo de
 * ejecución ni dependen de ningún idioma de la interfaz.
 */
const HEADER_TO_FIELD: ReadonlyMap<string, UpdatableField> = new Map(
  UPDATABLE_FIELDS.flatMap((spec) => [
    [normalizeHeader(spec.header), spec.field] as const,
    [normalizeHeader(spec.field), spec.field] as const,
  ]),
)

const ID_HEADERS: ReadonlySet<string> = new Set([
  normalizeHeader(ID_HEADER),
  'id',
  'uuid',
])

const IGNORED: ReadonlySet<string> = new Set(
  IGNORED_HEADERS.map(normalizeHeader),
)

export type HeaderRole =
  | { role: 'id' }
  | { role: 'field'; field: UpdatableField }
  | { role: 'ignored' }
  | { role: 'unknown' }

export function classifyHeader(raw: string): HeaderRole {
  const clave = normalizeHeader(raw)
  if (clave === '') return { role: 'unknown' }
  if (ID_HEADERS.has(clave)) return { role: 'id' }
  const field = HEADER_TO_FIELD.get(clave)
  if (field) return { role: 'field', field }
  if (IGNORED.has(clave)) return { role: 'ignored' }
  return { role: 'unknown' }
}

// ── Estados ─────────────────────────────────────────────────────────────────

export const UPDATE_BATCH_STATUSES = [
  /** Validado. Hay al menos una fila que aplicar. */
  'ready',
  /** Validado. Todo coincide ya con la base: no hay nada que hacer. */
  'no_changes',
  /** Validado. Ninguna fila aplicable y hay errores. */
  'invalid',
  'completed',
  /** Aplicado, pero algo se quedó fuera. */
  'completed_with_errors',
  'cancelled',
] as const

export type UpdateBatchStatus = (typeof UPDATE_BATCH_STATUSES)[number]

export const UPDATE_ROW_STATUSES = [
  'valid',
  /** El fichero dice lo mismo que ya hay guardado. */
  'unchanged',
  'invalid',
  /** El mismo UUID aparece más de una vez en el fichero. */
  'duplicate_id',
  'updated',
  /** Era válida, pero el proveedor ya no existía al aplicar. */
  'skipped',
  /** La escritura falló por una restricción de la base. */
  'failed',
] as const

export type UpdateRowStatus = (typeof UPDATE_ROW_STATUSES)[number]

export const ROW_STATUS_LABELS: Record<UpdateRowStatus, string> = {
  valid: 'Se actualizará',
  unchanged: 'Sin cambios',
  invalid: 'Inválida',
  duplicate_id: 'ID repetido',
  updated: 'Actualizada',
  skipped: 'Omitida',
  failed: 'Fallida',
}

export const BATCH_STATUS_LABELS: Record<UpdateBatchStatus, string> = {
  ready: 'Pendiente de confirmar',
  no_changes: 'Sin cambios',
  invalid: 'Sin filas aplicables',
  completed: 'Completada',
  completed_with_errors: 'Con incidencias',
  cancelled: 'Descartada',
}

/** Un batch solo se aplica desde `ready`, y una sola vez. */
export function canApplyBatch(status: UpdateBatchStatus): boolean {
  return status === 'ready'
}

export function canCancelBatch(status: UpdateBatchStatus): boolean {
  return status === 'ready' || status === 'invalid' || status === 'no_changes'
}

export function isBatchFinal(status: UpdateBatchStatus): boolean {
  return status === 'completed' || status === 'completed_with_errors' || status === 'cancelled'
}

// ── Estructuras ─────────────────────────────────────────────────────────────

export interface UpdateRowError {
  /** Cabecera afectada, o `null` si el error es de la fila entera. */
  column: string | null
  message: string
}

/** Valor ya convertido al tipo real de la columna. `null` = borrar. */
export type NormalizedValue = string | number | boolean | null

/** Fila validada, tal y como se persiste. */
export interface NormalizedUpdateRow {
  line: number
  status: UpdateRowStatus
  supplierId: string | null
  supplierName: string | null
  raw: Record<string, string>
  /** Valor guardado hoy, solo de los campos que la fila toca. */
  currentValues: Record<string, NormalizedValue>
  /** Solo lo que cambia. Clave ausente = no tocar; `null` = borrar. */
  changes: Record<string, NormalizedValue>
  updatedFields: UpdatableField[]
  errors: UpdateRowError[]
}

export interface UpdateSummary {
  totalRows: number
  validRows: number
  unchangedRows: number
  invalidRows: number
  duplicateRows: number
}

export function summarizeRows(rows: NormalizedUpdateRow[]): UpdateSummary {
  return {
    totalRows: rows.length,
    validRows: rows.filter((r) => r.status === 'valid').length,
    unchangedRows: rows.filter((r) => r.status === 'unchanged').length,
    invalidRows: rows.filter((r) => r.status === 'invalid').length,
    duplicateRows: rows.filter((r) => r.status === 'duplicate_id').length,
  }
}

/**
 * Estado del batch a partir del recuento.
 *
 * `no_changes` existe porque «ninguna fila que aplicar» y «el fichero está mal»
 * son dos cosas distintas, y llamar inválido a un fichero perfecto que
 * simplemente no cambia nada sería mentirle a quien lo subió.
 */
export function resolveBatchStatus(resumen: UpdateSummary): UpdateBatchStatus {
  if (resumen.validRows > 0) return 'ready'
  if (resumen.invalidRows > 0 || resumen.duplicateRows > 0) return 'invalid'
  return 'no_changes'
}

export interface UpdateBatchSummary {
  id: string
  filename: string
  fileHash: string
  status: UpdateBatchStatus
  totalRows: number
  validRows: number
  unchangedRows: number
  invalidRows: number
  duplicateRows: number
  updatedRows: number
  skippedRows: number
  failedRows: number
  createdAt: string
  validatedAt: string | null
  appliedAt: string | null
  createdByName: string | null
  /** Cabeceras del fichero que no se han usado. */
  ignoredColumns: string[]
  unknownColumns: string[]
}

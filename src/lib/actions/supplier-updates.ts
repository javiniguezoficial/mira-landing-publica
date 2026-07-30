'use server'

// Actualización masiva de proveedores (Fase 3.2) — Server Actions.
//
// ── El principio que ordena todo este fichero ───────────────────────────────
//
// Lo validado se PERSISTE, y la confirmación solo manda un `batch_id`.
//
// La alternativa —validar, devolver las filas al navegador y volver a
// recibirlas— es la que traía el importador de proveedores antiguo, y significa
// que entre los dos pasos el cliente puede cambiar un UUID y escribir sobre
// otro proveedor. Aquí las filas validadas viven en `supplier_update_rows` y
// `apply_supplier_update` decide qué escribe leyendo lo que el propio servidor
// validó.

import { createHash } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { requirePlatformAdmin } from '@/lib/auth/guards'
import { getSupplierNotes } from '@/lib/actions/suppliers'
import type { ReportRow } from '@/lib/suppliers/bulk-update/report'
import {
  ACCEPTED_UPDATE_EXTENSIONS,
  ACCEPTED_UPDATE_MIME_TYPES,
  MAX_UPDATE_FILE_BYTES,
  UPDATE_PREVIEW_PAGE_SIZE,
  canCancelBatch,
  resolveBatchStatus,
  summarizeRows,
  type NormalizedUpdateRow,
  type NormalizedValue,
  type UpdatableField,
  type UpdateBatchStatus,
  type UpdateBatchSummary,
  type UpdateRowError,
  type UpdateRowStatus,
} from '@/lib/suppliers/bulk-update/types'
import { readUpdateSheet } from '@/lib/suppliers/bulk-update/workbook'
import {
  collectSupplierIds,
  planColumns,
  validateUpdateRows,
  type SupplierSnapshot,
  type TaxonomyCatalog,
} from '@/lib/suppliers/bulk-update/validation'

const MESSAGES = {
  sinArchivo: 'No se ha recibido ningún archivo.',
  extension: `Formato no admitido. Sube un archivo ${ACCEPTED_UPDATE_EXTENSIONS.join(' o ')}.`,
  tipo: 'El contenido del archivo no parece una hoja de cálculo .xlsx.',
  tamano: `El archivo supera el límite de ${MAX_UPDATE_FILE_BYTES / 1024 / 1024} MB.`,
  sinColumnas:
    'El archivo no contiene ninguna columna actualizable. Descarga la plantilla o ' +
    'usa una exportación de proveedores.',
  generico: 'No se ha podido procesar el archivo. Inténtalo de nuevo.',
  noEncontrado: 'No se ha encontrado la actualización indicada.',
} as const

/** Campos que se leen de `suppliers` para comparar. `notes` va aparte (032). */
const SNAPSHOT_COLUMNS =
  'id, name, email, phone, website, tax_id, country, region, city, postal_code, ' +
  'address, latitude, longitude, produccion_value, produccion_unit, medida, is_active, ' +
  'supplier_market_id, supplier_category_id, supplier_family_id, supplier_subfamily_id'

/**
 * Tamaño de tanda al consultar por lista de identificadores.
 *
 * PostgREST manda los `in.(…)` en la URL. Con 12.000 UUID serían ~450 KB de
 * cadena de consulta y cualquier proxy la corta antes de llegar.
 */
const LOOKUP_CHUNK = 300
/** Tamaño de tanda al insertar filas validadas. */
const INSERT_CHUNK = 500

function trocear<T>(items: T[], tamano: number): T[][] {
  const trozos: T[][] = []
  for (let i = 0; i < items.length; i += tamano) trozos.push(items.slice(i, i + tamano))
  return trozos
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. Validar el fichero y crear el batch
// ═══════════════════════════════════════════════════════════════════════════

export interface HeaderIssues {
  /** Falta la columna del identificador: sin ella no se puede hacer nada. */
  missingId?: boolean
  /** El mismo campo llega en dos columnas y no se puede decidir cuál manda. */
  ambiguous?: string[]
}

export interface ValidateUpdateResult {
  batchId?: string
  error?: string
  headerIssues?: HeaderIssues
  /** Aviso, no error: ya se aplicó un fichero con este mismo contenido. */
  duplicateFileWarning?: { batchId: string; appliedAt: string | null; status: string }
}

export async function validateSupplierUpdateFile(
  formData: FormData,
): Promise<ValidateUpdateResult> {
  const { supabase, userId } = await requirePlatformAdmin('throw')

  // ── El fichero, comprobado ANTES de leer su contenido ─────────────────────
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) return { error: MESSAGES.sinArchivo }
  if (file.size > MAX_UPDATE_FILE_BYTES) return { error: MESSAGES.tamano }

  const nombre = file.name.toLowerCase()
  if (!ACCEPTED_UPDATE_EXTENSIONS.some((ext) => nombre.endsWith(ext))) {
    return { error: MESSAGES.extension }
  }
  // Ni la extensión ni el MIME son de fiar por sí solos —los pone quien sube el
  // fichero—, así que se exigen los dos y además `readUpdateSheet` comprueba la
  // firma ZIP del contenido real.
  if (!ACCEPTED_UPDATE_MIME_TYPES.includes(file.type as never)) {
    return { error: MESSAGES.tipo }
  }

  const bytes = new Uint8Array(await file.arrayBuffer())
  const fileHash = createHash('sha256').update(bytes).digest('hex')

  // Reaplicar el MISMO fichero es el error humano más común. No se bloquea
  // —puede ser legítimo— pero se avisa, y de todos modos la segunda pasada
  // dejaría todas las filas en `unchanged` porque los valores ya coinciden.
  const { data: previo } = await supabase
    .from('supplier_update_batches')
    .select('id, applied_at, status')
    .eq('file_hash', fileHash)
    .in('status', ['completed', 'completed_with_errors'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const lectura = readUpdateSheet(bytes)
  if (!lectura.ok) return { error: lectura.error }

  const { headers, rows, sheetName } = lectura.sheet

  // ── Columnas ──────────────────────────────────────────────────────────────
  const plan = planColumns(headers)
  if (plan.idIndex === null) return { headerIssues: { missingId: true } }
  if (plan.ambiguous.length > 0) return { headerIssues: { ambiguous: plan.ambiguous } }
  if (plan.fields.length === 0) return { error: MESSAGES.sinColumnas }

  // ── Proveedores implicados, en tandas fijas ───────────────────────────────
  //
  // Una consulta por tanda para TODO el fichero, no una por fila.
  const ids = collectSupplierIds(rows, plan)
  const suppliers = new Map<string, SupplierSnapshot>()

  for (const trozo of trocear(ids, LOOKUP_CHUNK)) {
    const { data, error } = await supabase
      .from('suppliers')
      .select(SNAPSHOT_COLUMNS)
      .in('id', trozo)

    if (error) {
      console.error(`[supplier-update] lectura de proveedores falló: ${error.code ?? '?'} ${error.message}`)
      return { error: MESSAGES.generico }
    }

    for (const fila of (data ?? []) as unknown as Array<Record<string, unknown>>) {
      const id = String(fila.id)
      suppliers.set(id, {
        id,
        name: String(fila.name ?? ''),
        email: (fila.email as string | null) ?? null,
        phone: (fila.phone as string | null) ?? null,
        website: (fila.website as string | null) ?? null,
        tax_id: (fila.tax_id as string | null) ?? null,
        country: String(fila.country ?? ''),
        region: (fila.region as string | null) ?? null,
        city: (fila.city as string | null) ?? null,
        postal_code: (fila.postal_code as string | null) ?? null,
        address: (fila.address as string | null) ?? null,
        latitude: fila.latitude != null ? Number(fila.latitude) : null,
        longitude: fila.longitude != null ? Number(fila.longitude) : null,
        produccion_value: fila.produccion_value != null ? Number(fila.produccion_value) : null,
        produccion_unit: (fila.produccion_unit as string | null) ?? null,
        medida: (fila.medida as string | null) ?? null,
        notes: null, // se rellena abajo
        is_active: Boolean(fila.is_active),
        supplier_market_id: (fila.supplier_market_id as string | null) ?? null,
        supplier_category_id: (fila.supplier_category_id as string | null) ?? null,
        supplier_family_id: (fila.supplier_family_id as string | null) ?? null,
        supplier_subfamily_id: (fila.supplier_subfamily_id as string | null) ?? null,
      })
    }
  }

  // 032 — `notes` no se puede leer de la tabla ni con sesión de administrador:
  // el privilegio de columna está revocado. Se piden a `admin_supplier_notes`,
  // que valida `platform_admin` por dentro. Solo se piden si el fichero trae
  // esa columna: no hay ninguna razón para sacar 12.000 notas internas si nadie
  // las va a comparar.
  const tocaNotas = plan.fields.some((f) => f.field === 'notes')
  if (tocaNotas && suppliers.size > 0) {
    for (const trozo of trocear([...suppliers.keys()], 1_000)) {
      const notas = await getSupplierNotes(trozo)
      for (const [id, valor] of notas) {
        const s = suppliers.get(id)
        if (s) s.notes = valor
      }
    }
  }

  // ── Taxonomía completa: cuatro consultas, no una por fila ─────────────────
  const [mercados, categorias, familias, subfamilias] = await Promise.all([
    supabase.from('supplier_markets').select('id').eq('is_active', true),
    supabase.from('supplier_categories').select('id, supplier_market_id').eq('is_active', true),
    supabase.from('supplier_families').select('id, supplier_category_id').eq('is_active', true),
    supabase.from('supplier_subfamilies').select('id, supplier_family_id').eq('is_active', true),
  ])

  const taxonomy: TaxonomyCatalog = {
    markets: new Set((mercados.data ?? []).map((m) => String(m.id))),
    categories: new Map(
      (categorias.data ?? []).map((c) => [String(c.id), String(c.supplier_market_id)]),
    ),
    families: new Map(
      (familias.data ?? []).map((f) => [String(f.id), String(f.supplier_category_id)]),
    ),
    subfamilies: new Map(
      (subfamilias.data ?? []).map((s) => [String(s.id), String(s.supplier_family_id)]),
    ),
  }

  // ── Validar ───────────────────────────────────────────────────────────────
  //
  // En dos pasadas: la segunda marca los identificadores repetidos, que solo se
  // conocen con el fichero entero leído.
  const validadas: NormalizedUpdateRow[] = validateUpdateRows(rows, { plan, suppliers, taxonomy })

  const resumen = summarizeRows(validadas)
  const estado = resolveBatchStatus(resumen)

  // ── Persistir ─────────────────────────────────────────────────────────────
  const { data: batch, error: batchError } = await supabase
    .from('supplier_update_batches')
    .insert({
      filename: file.name.slice(0, 255),
      file_hash: fileHash,
      file_size: file.size,
      status: estado,
      total_rows: resumen.totalRows,
      valid_rows: resumen.validRows,
      unchanged_rows: resumen.unchangedRows,
      invalid_rows: resumen.invalidRows,
      duplicate_rows: resumen.duplicateRows,
      created_by: userId,
      validated_at: new Date().toISOString(),
      metadata: {
        sheetName,
        ignoredColumns: plan.ignored,
        unknownColumns: plan.unknown,
        updatableColumns: plan.fields.map((f) => f.header),
      },
    })
    .select('id')
    .single()

  if (batchError || !batch) {
    console.error(`[supplier-update] alta de batch falló: ${batchError?.code ?? '?'} ${batchError?.message ?? ''}`)
    return { error: MESSAGES.generico }
  }

  for (const trozo of trocear(validadas, INSERT_CHUNK)) {
    const { error } = await supabase.from('supplier_update_rows').insert(
      trozo.map((f) => ({
        batch_id: batch.id,
        row_number: f.line,
        supplier_id: f.supplierId,
        status: f.status,
        raw_data: f.raw,
        current_values: f.currentValues,
        normalized_changes: f.changes,
        validation_errors: f.errors,
        updated_fields: f.updatedFields,
      })),
    )

    if (error) {
      console.error(`[supplier-update] alta de filas falló: ${error.code ?? '?'} ${error.message}`)
      // El batch quedaría a medias y confirmarlo aplicaría solo una parte del
      // fichero sin decirlo. Se descarta entero.
      await supabase
        .from('supplier_update_batches')
        .update({ status: 'cancelled', error_summary: 'No se pudieron guardar todas las filas validadas.' })
        .eq('id', batch.id)
      return { error: MESSAGES.generico }
    }
  }

  revalidatePath('/admin/proveedores/actualizar')

  return {
    batchId: batch.id,
    duplicateFileWarning: previo
      ? { batchId: previo.id, appliedAt: previo.applied_at, status: previo.status }
      : undefined,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. Consultar
// ═══════════════════════════════════════════════════════════════════════════

const BATCH_SELECT = `
  id, filename, file_hash, status,
  total_rows, valid_rows, unchanged_rows, invalid_rows, duplicate_rows,
  updated_rows, skipped_rows, failed_rows,
  created_at, validated_at, applied_at, metadata,
  creator:profiles!supplier_update_batches_created_by_fkey(first_name, last_name)
`

function toBatchSummary(d: Record<string, unknown>): UpdateBatchSummary {
  const creator = (Array.isArray(d.creator) ? d.creator[0] : d.creator) as
    | { first_name: string | null; last_name: string | null }
    | null
  const metadata = (d.metadata ?? {}) as Record<string, unknown>

  return {
    id: d.id as string,
    filename: d.filename as string,
    fileHash: d.file_hash as string,
    status: d.status as UpdateBatchStatus,
    totalRows: Number(d.total_rows ?? 0),
    validRows: Number(d.valid_rows ?? 0),
    unchangedRows: Number(d.unchanged_rows ?? 0),
    invalidRows: Number(d.invalid_rows ?? 0),
    duplicateRows: Number(d.duplicate_rows ?? 0),
    updatedRows: Number(d.updated_rows ?? 0),
    skippedRows: Number(d.skipped_rows ?? 0),
    failedRows: Number(d.failed_rows ?? 0),
    createdAt: d.created_at as string,
    validatedAt: (d.validated_at as string | null) ?? null,
    appliedAt: (d.applied_at as string | null) ?? null,
    createdByName: creator
      ? [creator.first_name, creator.last_name].filter(Boolean).join(' ') || null
      : null,
    ignoredColumns: Array.isArray(metadata.ignoredColumns) ? (metadata.ignoredColumns as string[]) : [],
    unknownColumns: Array.isArray(metadata.unknownColumns) ? (metadata.unknownColumns as string[]) : [],
  }
}

export async function getSupplierUpdateBatch(batchId: string): Promise<UpdateBatchSummary | null> {
  const { supabase } = await requirePlatformAdmin()

  const { data } = await supabase
    .from('supplier_update_batches')
    .select(BATCH_SELECT)
    .eq('id', batchId)
    .maybeSingle()

  return data ? toBatchSummary(data as unknown as Record<string, unknown>) : null
}

export async function listSupplierUpdateBatches(limit = 10): Promise<UpdateBatchSummary[]> {
  const { supabase } = await requirePlatformAdmin()

  const { data } = await supabase
    .from('supplier_update_batches')
    .select(BATCH_SELECT)
    .order('created_at', { ascending: false })
    .limit(limit)

  return ((data ?? []) as unknown as Array<Record<string, unknown>>).map(toBatchSummary)
}

export interface UpdateRowView {
  line: number
  status: UpdateRowStatus
  supplierId: string | null
  supplierName: string | null
  updatedFields: string[]
  currentValues: Record<string, NormalizedValue>
  changes: Record<string, NormalizedValue>
  errors: UpdateRowError[]
}

export interface UpdateRowsPage {
  rows: UpdateRowView[]
  total: number
  page: number
  pageSize: number
}

/**
 * Filas del batch, PAGINADAS en servidor.
 *
 * Nunca viajan 12.000 filas al navegador: sería un JSON de varios megabytes y
 * un DOM que ningún portátil mueve. El filtro por estado también se resuelve en
 * la consulta, apoyado en `idx_sur_batch_status`.
 *
 * El nombre del proveedor sale del embed a `suppliers`, no de `raw_data`: el
 * fichero pudo traer un nombre distinto —de hecho puede estar cambiándolo—, y
 * en la vista previa hay que ver a QUIÉN se está tocando de verdad.
 */
export async function getSupplierUpdateRows(
  batchId: string,
  options: { status?: UpdateRowStatus | 'all'; page?: number } = {},
): Promise<UpdateRowsPage> {
  const { supabase } = await requirePlatformAdmin()

  const page = Math.max(1, options.page ?? 1)
  const desde = (page - 1) * UPDATE_PREVIEW_PAGE_SIZE

  let query = supabase
    .from('supplier_update_rows')
    .select(
      `row_number, status, supplier_id, updated_fields, current_values,
       normalized_changes, validation_errors, raw_data,
       supplier:suppliers!supplier_update_rows_supplier_id_fkey(name)`,
      { count: 'exact' },
    )
    .eq('batch_id', batchId)
    .order('row_number')

  if (options.status && options.status !== 'all') query = query.eq('status', options.status)

  const { data, count } = await query.range(desde, desde + UPDATE_PREVIEW_PAGE_SIZE - 1)

  const rows: UpdateRowView[] = ((data ?? []) as unknown as Array<Record<string, unknown>>).map((r) => {
    const supplier = (Array.isArray(r.supplier) ? r.supplier[0] : r.supplier) as { name: string } | null
    const raw = (r.raw_data ?? {}) as Record<string, string>

    return {
      line: Number(r.row_number),
      status: r.status as UpdateRowStatus,
      // Una fila con ID inexistente no tiene `supplier_id` —la clave foránea no
      // lo permitiría—, pero hay que poder ver lo que se escribió para saber
      // dónde está la errata.
      supplierId: (r.supplier_id as string | null) ?? raw['ID interno'] ?? null,
      supplierName: supplier?.name ?? raw['Nombre'] ?? null,
      updatedFields: (r.updated_fields as string[]) ?? [],
      currentValues: (r.current_values as Record<string, NormalizedValue>) ?? {},
      changes: (r.normalized_changes as Record<string, NormalizedValue>) ?? {},
      errors: (r.validation_errors as UpdateRowError[]) ?? [],
    }
  })

  return { rows, total: count ?? 0, page, pageSize: UPDATE_PREVIEW_PAGE_SIZE }
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. Aplicar
// ═══════════════════════════════════════════════════════════════════════════

export interface ApplyUpdateResult {
  updatedRows?: number
  skippedRows?: number
  failedRows?: number
  status?: string
  error?: string
}

/**
 * Confirma la actualización.
 *
 * Solo se manda el identificador del batch. Qué se escribe lo decide
 * `apply_supplier_update` leyendo las filas que el propio servidor validó: la
 * función corre en una sola transacción, comprueba `platform_admin` por su
 * cuenta y bloquea el batch con `for update`, así que un doble clic o dos
 * pestañas abiertas no pueden aplicar dos veces.
 */
export async function applySupplierUpdateBatch(batchId: string): Promise<ApplyUpdateResult> {
  const { supabase } = await requirePlatformAdmin('throw')

  if (!batchId?.trim()) return { error: MESSAGES.noEncontrado }

  const { data, error } = await supabase.rpc('apply_supplier_update', { p_batch_id: batchId })

  if (error) {
    console.error(`[supplier-update] confirmación falló: ${error.code ?? '?'} ${error.message}`)
    // Los mensajes de la función ya son legibles y no filtran nada interno.
    return { error: error.message || MESSAGES.generico }
  }

  const resultado = data as {
    updated_rows?: number
    skipped_rows?: number
    failed_rows?: number
    status?: string
  } | null

  revalidatePath('/admin/proveedores/actualizar')
  revalidatePath('/admin/proveedores')
  revalidatePath('/app/proveedores')

  return {
    updatedRows: resultado?.updated_rows ?? 0,
    skippedRows: resultado?.skipped_rows ?? 0,
    failedRows: resultado?.failed_rows ?? 0,
    status: resultado?.status,
  }
}

export async function cancelSupplierUpdateBatch(batchId: string): Promise<{ error?: string }> {
  const { supabase } = await requirePlatformAdmin('throw')

  const { data: batch } = await supabase
    .from('supplier_update_batches')
    .select('status')
    .eq('id', batchId)
    .maybeSingle()

  if (!batch) return { error: MESSAGES.noEncontrado }
  if (!canCancelBatch(batch.status as UpdateBatchStatus)) {
    return { error: 'Esta actualización ya no se puede descartar.' }
  }

  const { error } = await supabase
    .from('supplier_update_batches')
    .update({ status: 'cancelled' })
    .eq('id', batchId)
    .eq('status', batch.status) // no pisar un cambio concurrente

  if (error) return { error: MESSAGES.generico }

  revalidatePath('/admin/proveedores/actualizar')
  return {}
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. Informe
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Todas las filas del batch para el informe descargable.
 *
 * Se traen enteras y de una vez —a diferencia de la vista previa— porque el
 * informe ES el fichero completo. El techo real lo pone `MAX_UPDATE_ROWS`.
 */
export async function getSupplierUpdateReportRows(batchId: string): Promise<ReportRow[]> {
  const { supabase } = await requirePlatformAdmin()

  const { data } = await supabase
    .from('supplier_update_rows')
    .select(
      `row_number, status, supplier_id, updated_fields, current_values,
       normalized_changes, validation_errors, raw_data,
       supplier:suppliers!supplier_update_rows_supplier_id_fkey(name)`,
    )
    .eq('batch_id', batchId)
    .order('row_number')

  return ((data ?? []) as unknown as Array<Record<string, unknown>>).map((r) => {
    const raw = (r.raw_data ?? {}) as Record<string, string>
    const supplier = (Array.isArray(r.supplier) ? r.supplier[0] : r.supplier) as { name: string } | null
    return {
      line: Number(r.row_number),
      // El ID de `raw_data` como respaldo: una fila inválida por ID inexistente
      // no tiene `supplier_id`, y en el informe hay que poder ver qué se
      // escribió para saber dónde estaba la errata.
      supplierId: (r.supplier_id as string | null) ?? raw['ID interno'] ?? null,
      supplierName: supplier?.name ?? raw['Nombre'] ?? null,
      status: r.status as UpdateRowStatus,
      updatedFields: ((r.updated_fields as string[]) ?? []) as UpdatableField[],
      currentValues: (r.current_values as Record<string, NormalizedValue>) ?? {},
      changes: (r.normalized_changes as Record<string, NormalizedValue>) ?? {},
      errors: (r.validation_errors as UpdateRowError[]) ?? [],
    }
  })
}

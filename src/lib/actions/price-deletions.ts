'use server'

// Borrado administrado de precios (035) — Server Actions.
//
// ── El principio que ordena este fichero ───────────────────────────────────
//
// La vista previa PERSISTE, con una copia completa de cada precio, y la
// confirmación solo manda el identificador del lote.
//
// La alternativa —guardar los filtros y volver a ejecutarlos al confirmar—
// parece más simple y es peligrosa: entre que alguien revisa 40 filas y pulsa
// el botón pueden entrar precios nuevos que casen con los mismos filtros, y se
// borrarían sin que nadie los haya visto. Aquí se borra exactamente lo que se
// enseñó, ni una fila más.

import { revalidatePath } from 'next/cache'
import { requirePlatformAdmin } from '@/lib/auth/guards'
import {
  MAX_DELETION_ROWS,
  DELETION_PREVIEW_PAGE_SIZE,
  hasAnyDeletionFilter,
  normalizeDeletionFilters,
  type DeletionBatchStatus,
  type DeletionBatchSummary,
  type DeletionMode,
  type DeletionPreviewRow,
  type PriceDeletionFilters,
} from '@/lib/prices/deletion'

const MESSAGES = {
  permiso: 'No tienes permiso para realizar esta acción.',
  sinFiltros:
    'Un borrado filtrado necesita al menos un filtro. Para vaciar el histórico entero usa ' +
    '«Eliminar todos los precios», que tiene su propia confirmación.',
  sinImportacion: 'Debes indicar qué importación quieres eliminar.',
  vacio: 'No hay ningún precio que coincida con lo indicado.',
  demasiados: `La operación afecta a más de ${MAX_DELETION_ROWS.toLocaleString('es-ES')} precios. Acota los filtros.`,
  noEncontrado: 'No se ha encontrado la operación de borrado indicada.',
  generico: 'No se ha podido preparar el borrado. Inténtalo de nuevo.',
} as const

/** Columnas del snapshot. Explícitas para que la copia sea siempre la misma. */
const PRICE_COLUMNS =
  'id, product_id, source_id, price, unit, currency, country, region, recorded_at, ' +
  'min_price, max_price, avg_price, volume, metadata, created_at, updated_at, ' +
  'import_batch_id, import_row_id, lonja'

/** Cuántos precios se leen por tanda al construir los snapshots. */
const SCAN_CHUNK = 1_000
/** Cuántas filas de auditoría se insertan de una vez. */
const INSERT_CHUNK = 500

function trocear<T>(items: T[], tamano: number): T[][] {
  const trozos: T[][] = []
  for (let i = 0; i < items.length; i += tamano) trozos.push(items.slice(i, i + tamano))
  return trozos
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. Vista previa: selecciona, copia y persiste
// ═══════════════════════════════════════════════════════════════════════════

export interface CreateDeletionInput {
  mode: DeletionMode
  filters?: PriceDeletionFilters
  sourceImportBatchId?: string
}

export interface CreateDeletionResult {
  batchId?: string
  totalRows?: number
  error?: string
}

export async function createDeletionPreview(
  input: CreateDeletionInput,
): Promise<CreateDeletionResult> {
  const { supabase, userId } = await requirePlatformAdmin('throw')

  const filtros = normalizeDeletionFilters(input.filters ?? {})

  // ── El cerrojo del borrado sin filtros ────────────────────────────────────
  //
  // Se comprueba aquí Y en el CHECK `mpdb_filters_not_empty` de la tabla. Un
  // modo `filters` sin filtros borraría el histórico entero mientras la
  // pantalla dice «borrado filtrado»; para eso está el modo `all`, que exige
  // teclear otra frase.
  if (input.mode === 'filters' && !hasAnyDeletionFilter(filtros)) {
    return { error: MESSAGES.sinFiltros }
  }
  if (input.mode === 'import' && !input.sourceImportBatchId) {
    return { error: MESSAGES.sinImportacion }
  }

  // ── Contexto del origen, para que la auditoría siga siendo legible ────────
  //
  // En modo `import` el lote original se borra, así que su nombre y sus
  // contadores se copian AHORA. Después ya no habría dónde leerlos.
  const metadata: Record<string, unknown> = {}

  if (input.mode === 'import') {
    const { data: origen } = await supabase
      .from('market_import_batches')
      .select('filename, status, period_label, imported_rows, total_rows, created_at, file_hash')
      .eq('id', input.sourceImportBatchId!)
      .maybeSingle()

    if (!origen) return { error: MESSAGES.sinImportacion }
    metadata.sourceImportBatch = origen
  }

  // ── Reunir los precios afectados ──────────────────────────────────────────
  const precios: Record<string, unknown>[] = []
  let desde = 0

  // El mercado NO está en la tabla de precios: se filtra a través del producto.
  // El embed `!inner` solo se pide cuando hace falta, porque convierte la
  // consulta en un join y no tiene sentido pagarlo si nadie filtra por mercado.
  const seleccion = filtros.market_id && input.mode !== 'import'
    ? `${PRICE_COLUMNS}, product:products!inner(market_id)`
    : PRICE_COLUMNS

  for (;;) {
    let consulta = supabase
      .from('product_price_records')
      .select(seleccion)
      .order('recorded_at', { ascending: true })
      .order('id', { ascending: true })
      .range(desde, desde + SCAN_CHUNK - 1)

    if (input.mode === 'import') {
      consulta = consulta.eq('import_batch_id', input.sourceImportBatchId!)
    } else {
      if (filtros.market_id) consulta = consulta.eq('product.market_id', filtros.market_id)
      if (filtros.product_id) consulta = consulta.eq('product_id', filtros.product_id)
      if (filtros.lonja) consulta = consulta.eq('lonja', filtros.lonja)
      if (filtros.currency) consulta = consulta.eq('currency', filtros.currency)
      if (filtros.unit) consulta = consulta.eq('unit', filtros.unit)
      if (filtros.date_from) consulta = consulta.gte('recorded_at', filtros.date_from)
      if (filtros.date_to) consulta = consulta.lte('recorded_at', filtros.date_to)
    }

    const { data, error } = await consulta

    if (error) {
      console.error(`[price-deletion] lectura falló: ${error.code ?? '?'} ${error.message}`)
      return { error: MESSAGES.generico }
    }

    const tanda = (data ?? []) as unknown as Record<string, unknown>[]
    for (const fila of tanda) {
      // El embed solo servía para filtrar; no forma parte del precio.
      delete fila.product
      precios.push(fila)
    }

    if (tanda.length < SCAN_CHUNK) break
    if (precios.length >= MAX_DELETION_ROWS) return { error: MESSAGES.demasiados }
    desde += SCAN_CHUNK
  }

  // En modo `import` puede no haber ningún precio y AUN ASÍ tener sentido: es
  // justo el caso de una importación que falló y solo dejó filas técnicas.
  if (precios.length === 0 && input.mode !== 'import') {
    return { error: MESSAGES.vacio }
  }

  // ── Persistir el lote y las copias ────────────────────────────────────────
  const { data: lote, error: loteError } = await supabase
    .from('market_price_deletion_batches')
    .insert({
      mode: input.mode,
      status: 'ready',
      filters: input.mode === 'filters' ? filtros : {},
      source_import_batch_id: input.sourceImportBatchId ?? null,
      total_rows: precios.length,
      created_by: userId,
      metadata,
    })
    .select('id')
    .single()

  if (loteError || !lote) {
    console.error(`[price-deletion] alta de lote falló: ${loteError?.code ?? '?'} ${loteError?.message ?? ''}`)
    return { error: MESSAGES.generico }
  }

  for (const trozo of trocear(precios, INSERT_CHUNK)) {
    const { error } = await supabase.from('market_price_deletion_rows').insert(
      trozo.map((p) => ({
        deletion_batch_id: lote.id,
        original_price_id: p.id as string,
        // La copia ÍNTEGRA, antes de borrar nada. Es lo que permite reconstruir.
        original_data: p,
        source_import_batch_id: (p.import_batch_id as string | null) ?? null,
        status: 'pending',
      })),
    )

    if (error) {
      console.error(`[price-deletion] alta de copias falló: ${error.code ?? '?'} ${error.message}`)
      // Un lote con las copias a medias borraría menos de lo que dice, y sin
      // copia de parte de lo borrado. Se descarta entero.
      await supabase
        .from('market_price_deletion_batches')
        .update({ status: 'cancelled', error_summary: 'No se pudieron guardar todas las copias de seguridad.' })
        .eq('id', lote.id)
      return { error: MESSAGES.generico }
    }
  }

  revalidatePath('/admin/precios/eliminar')

  return { batchId: lote.id, totalRows: precios.length }
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. Consultar
// ═══════════════════════════════════════════════════════════════════════════

const BATCH_SELECT = `
  id, mode, status, filters, source_import_batch_id,
  total_rows, deleted_rows, failed_rows,
  created_at, confirmed_at, completed_at, metadata,
  creator:profiles!market_price_deletion_batches_created_by_fkey(first_name, last_name)
`

function toSummary(d: Record<string, unknown>): DeletionBatchSummary {
  const creator = (Array.isArray(d.creator) ? d.creator[0] : d.creator) as
    | { first_name: string | null; last_name: string | null }
    | null

  return {
    id: d.id as string,
    mode: d.mode as DeletionMode,
    status: d.status as DeletionBatchStatus,
    filters: (d.filters ?? {}) as PriceDeletionFilters,
    sourceImportBatchId: (d.source_import_batch_id as string | null) ?? null,
    totalRows: Number(d.total_rows ?? 0),
    deletedRows: Number(d.deleted_rows ?? 0),
    failedRows: Number(d.failed_rows ?? 0),
    createdAt: d.created_at as string,
    confirmedAt: (d.confirmed_at as string | null) ?? null,
    completedAt: (d.completed_at as string | null) ?? null,
    createdByName: creator
      ? [creator.first_name, creator.last_name].filter(Boolean).join(' ') || null
      : null,
    metadata: (d.metadata ?? {}) as Record<string, unknown>,
  }
}

export async function getDeletionBatch(batchId: string): Promise<DeletionBatchSummary | null> {
  const { supabase } = await requirePlatformAdmin()

  const { data } = await supabase
    .from('market_price_deletion_batches')
    .select(BATCH_SELECT)
    .eq('id', batchId)
    .maybeSingle()

  return data ? toSummary(data as unknown as Record<string, unknown>) : null
}

export async function listDeletionBatches(limit = 10): Promise<DeletionBatchSummary[]> {
  const { supabase } = await requirePlatformAdmin()

  const { data } = await supabase
    .from('market_price_deletion_batches')
    .select(BATCH_SELECT)
    .order('created_at', { ascending: false })
    .limit(limit)

  return ((data ?? []) as unknown as Array<Record<string, unknown>>).map(toSummary)
}

export interface DeletionRowsPage {
  rows: DeletionPreviewRow[]
  total: number
  page: number
  pageSize: number
}

/**
 * Filas de la vista previa, PAGINADAS en servidor.
 *
 * Los datos se leen del snapshot (`original_data`), no de la tabla de precios:
 * después de confirmar, el precio ya no existe y la vista previa tiene que
 * seguir siendo consultable.
 */
export async function getDeletionRows(
  batchId: string,
  options: { page?: number } = {},
): Promise<DeletionRowsPage> {
  const { supabase } = await requirePlatformAdmin()

  const page = Math.max(1, options.page ?? 1)
  const desde = (page - 1) * DELETION_PREVIEW_PAGE_SIZE

  const { data, count } = await supabase
    .from('market_price_deletion_rows')
    .select('original_price_id, original_data, source_import_batch_id, status', { count: 'exact' })
    .eq('deletion_batch_id', batchId)
    .order('created_at')
    .range(desde, desde + DELETION_PREVIEW_PAGE_SIZE - 1)

  const filas = (data ?? []) as unknown as Array<Record<string, unknown>>

  // Los nombres de producto y mercado no están en el snapshot —el snapshot es
  // la fila de precios tal cual—, así que se resuelven en UNA consulta para
  // toda la página, no una por fila.
  const productIds = [...new Set(filas.map((f) => (f.original_data as Record<string, unknown>)?.product_id as string).filter(Boolean))]
  const nombres = new Map<string, { producto: string; mercado: string | null }>()

  if (productIds.length > 0) {
    const { data: productos } = await supabase
      .from('products')
      .select('id, name, market:markets(name)')
      .in('id', productIds)

    for (const p of (productos ?? []) as unknown as Array<Record<string, unknown>>) {
      const market = (Array.isArray(p.market) ? p.market[0] : p.market) as { name: string } | null
      nombres.set(p.id as string, { producto: p.name as string, mercado: market?.name ?? null })
    }
  }

  const rows: DeletionPreviewRow[] = filas.map((f) => {
    const snap = (f.original_data ?? {}) as Record<string, unknown>
    const info = nombres.get(snap.product_id as string)
    return {
      originalPriceId: f.original_price_id as string,
      productName: info?.producto ?? null,
      marketName: info?.mercado ?? null,
      lonja: (snap.lonja as string | null) ?? null,
      recordedAt: (snap.recorded_at as string | null) ?? null,
      price: snap.price != null ? Number(snap.price) : null,
      currency: (snap.currency as string | null) ?? null,
      unit: (snap.unit as string | null) ?? null,
      sourceImportBatchId: (f.source_import_batch_id as string | null) ?? null,
      status: f.status as string,
    }
  })

  return { rows, total: count ?? 0, page, pageSize: DELETION_PREVIEW_PAGE_SIZE }
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. Confirmar
// ═══════════════════════════════════════════════════════════════════════════

export interface ApplyDeletionResult {
  deletedRows?: number
  skippedRows?: number
  importRowsDeleted?: number
  importBatchDeleted?: number
  status?: string
  error?: string
}

/**
 * Ejecuta el borrado.
 *
 * Solo se manda el identificador del lote. Qué se borra lo decide
 * `apply_price_deletion` leyendo las copias que el propio servidor guardó: la
 * función corre en una sola transacción, comprueba `platform_admin` por su
 * cuenta y bloquea el lote con `for update`, así que un doble clic o dos
 * pestañas no pueden borrar dos veces.
 */
export async function applyDeletion(batchId: string): Promise<ApplyDeletionResult> {
  const { supabase } = await requirePlatformAdmin('throw')

  if (!batchId?.trim()) return { error: MESSAGES.noEncontrado }

  const { data, error } = await supabase.rpc('apply_price_deletion', { p_batch_id: batchId })

  if (error) {
    console.error(`[price-deletion] confirmación falló: ${error.code ?? '?'} ${error.message}`)
    return { error: error.message || MESSAGES.generico }
  }

  const r = data as Record<string, number | string> | null

  revalidatePath('/admin/precios/eliminar')
  revalidatePath('/admin/precios')
  revalidatePath('/admin/precios/importar')
  revalidatePath('/app/market-intelligent')

  return {
    deletedRows: Number(r?.deleted_rows ?? 0),
    skippedRows: Number(r?.skipped_rows ?? 0),
    importRowsDeleted: Number(r?.import_rows_deleted ?? 0),
    importBatchDeleted: Number(r?.import_batch_deleted ?? 0),
    status: r?.status as string | undefined,
  }
}

export async function cancelDeletion(batchId: string): Promise<{ error?: string }> {
  const { supabase } = await requirePlatformAdmin('throw')

  const { data: lote } = await supabase
    .from('market_price_deletion_batches')
    .select('status')
    .eq('id', batchId)
    .maybeSingle()

  if (!lote) return { error: MESSAGES.noEncontrado }
  if (lote.status !== 'ready') return { error: 'Esta operación ya no se puede descartar.' }

  const { error } = await supabase
    .from('market_price_deletion_batches')
    .update({ status: 'cancelled' })
    .eq('id', batchId)
    .eq('status', 'ready') // no pisar un cambio concurrente

  if (error) return { error: MESSAGES.generico }

  revalidatePath('/admin/precios/eliminar')
  return {}
}

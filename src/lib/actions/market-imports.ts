'use server'

import { createHash } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { requirePlatformAdmin } from '@/lib/auth/guards'
import { fetchAllRows } from '@/lib/supabase/fetch-all'
import { buildCsv, parseCsv } from '@/lib/imports/csv'
import { buildImportTemplateCsv } from '@/lib/imports/template'
import {
  isImportPeriodType,
  resolveImportPeriod,
  type ImportPeriodType,
} from '@/lib/imports/period'
import {
  ACCEPTED_IMPORT_EXTENSIONS,
  ACCEPTED_IMPORT_MIME_TYPES,
  IMPORT_PREVIEW_PAGE_SIZE,
  MAX_IMPORT_FILE_BYTES,
  MAX_IMPORT_ROWS,
  canCancelBatch,
  type ImportBatchStatus,
  type ImportBatchSummary,
  type ImportRowStatus,
} from '@/lib/imports/types'
import { safeCommitErrorMessage } from '@/lib/imports/errors'
import { deriveImportRowStatus, hasImportedPrice } from '@/lib/imports/row-state'
import {
  naturalKey,
  flagConflictingDuplicates,
  summarize,
  validateHeaders,
  validateRow,
  type CatalogProduct,
  type ValidationCatalog,
} from '@/lib/imports/validation'

// ── Mensajes ────────────────────────────────────────────────────────────────

const MESSAGES = {
  sinArchivo: 'No se ha recibido ningún archivo.',
  extension: `Formato no admitido. Sube un archivo ${ACCEPTED_IMPORT_EXTENSIONS.join(' o ')}.`,
  tipo: 'El contenido del archivo no parece un CSV.',
  tamano: `El archivo supera el límite de ${MAX_IMPORT_FILE_BYTES / 1024 / 1024} MB.`,
  filas: `El archivo supera el límite de ${MAX_IMPORT_ROWS.toLocaleString('es-ES')} filas por importación.`,
  periodo: 'El periodo seleccionado no es válido.',
  vacio: 'El archivo no contiene ninguna fila de datos.',
  generico: 'No se ha podido procesar el archivo. Inténtalo de nuevo.',
  noEncontrado: 'No se ha encontrado la importación indicada.',
} as const

export interface ValidateImportResult {
  batchId?: string
  error?: string
  /** Cabecera mal formada: se explica aparte porque no es un error de fila. */
  headerIssues?: { missing: string[]; unknown: string[] }
  /** Aviso, no error: ya se subió un fichero con el mismo contenido. */
  duplicateFileWarning?: { batchId: string; importedAt: string | null; status: string }
}

// ── 1. Validar y crear el batch ─────────────────────────────────────────────

/**
 * Lee el CSV, valida cada fila y PERSISTE el resultado.
 *
 * ── Por qué se guarda en la base y no se devuelve al navegador ─────────────
 *
 * El importador anterior validaba, devolvía las filas al cliente y volvía a
 * recibirlas para insertar. Entre los dos pasos el navegador podía cambiar
 * cualquier valor —un `product_id`, un precio— y el servidor lo insertaba
 * confiando en su validación previa. Aquí lo validado vive en
 * `market_import_rows` y la confirmación solo manda un identificador de batch.
 *
 * No se conserva el archivo original, solo su hash y sus metadatos. Coolify
 * corre con un sistema de ficheros efímero, así que guardarlo ahí sería
 * perderlo en el siguiente despliegue; y un bucket de Storage para esto exige
 * política de retención propia que el MVP no necesita — las filas ya están en
 * `raw_data`, que es lo que hace falta para revisar y reexportar errores.
 */
export async function validateImportFile(formData: FormData): Promise<ValidateImportResult> {
  const { supabase, userId } = await requirePlatformAdmin('throw')

  // ── Periodo ───────────────────────────────────────────────────────────────
  const periodTypeRaw = String(formData.get('periodType') ?? '')
  if (!isImportPeriodType(periodTypeRaw)) return { error: MESSAGES.periodo }

  const periodo = resolveImportPeriod({
    type: periodTypeRaw as ImportPeriodType,
    year: Number(formData.get('year')),
    week: formData.get('week') ? Number(formData.get('week')) : undefined,
    month: formData.get('month') ? Number(formData.get('month')) : undefined,
  })
  if (periodo.error || !periodo.range) return { error: periodo.error ?? MESSAGES.periodo }
  const rango = periodo.range

  // ── Archivo: se comprueba ANTES de leer el contenido ──────────────────────
  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) return { error: MESSAGES.sinArchivo }

  if (file.size > MAX_IMPORT_FILE_BYTES) return { error: MESSAGES.tamano }

  const nombre = file.name.toLowerCase()
  if (!ACCEPTED_IMPORT_EXTENSIONS.some((ext) => nombre.endsWith(ext))) {
    return { error: MESSAGES.extension }
  }
  // La extensión no basta, pero el MIME tampoco es de fiar por sí solo: se
  // exigen los dos y aun así el parser trata el contenido como texto plano,
  // nunca lo evalúa.
  if (!ACCEPTED_IMPORT_MIME_TYPES.includes(file.type as never)) {
    return { error: MESSAGES.tipo }
  }

  const bytes = Buffer.from(await file.arrayBuffer())
  const fileHash = createHash('sha256').update(bytes).digest('hex')

  // Reimportar el MISMO fichero es el error humano más común. No se bloquea
  // —puede ser legítimo tras corregir datos maestros— pero se avisa.
  const { data: previo } = await supabase
    .from('market_import_batches')
    .select('id, imported_at, status')
    .eq('file_hash', fileHash)
    .in('status', ['completed', 'completed_with_errors'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const parsed = parseCsv(bytes.toString('utf8'), { maxRows: MAX_IMPORT_ROWS + 1 })

  if (parsed.truncated || parsed.rows.length > MAX_IMPORT_ROWS) return { error: MESSAGES.filas }

  const cabecera = validateHeaders(parsed.headers)
  if (!cabecera.ok) {
    return { headerIssues: { missing: cabecera.missing, unknown: cabecera.unknown } }
  }
  if (parsed.rows.length === 0) return { error: MESSAGES.vacio }

  // ── Catálogo, en consultas fijas ──────────────────────────────────────────
  //
  // DOS consultas para TODO el fichero, no una por fila. Con 15.000 filas la
  // diferencia entre esto y un N+1 es entre segundos y horas.
  //
  // 034 — desaparece la tercera consulta, la que sacaba las monedas y unidades
  // «admitidas» de los valores que ya existían. Esa allowlist se calculaba a
  // partir del histórico y por tanto no admitía nada nuevo NUNCA: como los 608
  // registros son todos EUR, `USD` salía como moneda no reconocida. Ahora la
  // lista es explícita y vive en `imports/currency.ts` e `imports/units.ts`.
  //
  // 037 — el catálogo se lee PAGINADO. Hay 973 productos activos y PostgREST
  // recorta toda respuesta en 1.000 filas sin dar ningún error: 27 altas más y
  // el producto 1.001 habría empezado a rechazarse con «no existe o no está
  // activo», que es exactamente el error que nadie sabría dónde buscar.
  const productosResult = await fetchAllRows<Record<string, unknown>>(
    () =>
      supabase
        .from('products')
        .select('id, name, slug, lonja, unit, market:markets!inner(id, name, slug, is_active)')
        .eq('is_active', true)
        .order('id'),
    { label: 'import/products' },
  )

  if (!productosResult.complete) {
    // Un catálogo incompleto resolvería mal los productos y marcaría filas
    // buenas como inexistentes. Mejor no validar que validar con medio catálogo.
    console.error('[import] catálogo de productos incompleto: se aborta la validación.')
    return { error: MESSAGES.generico }
  }

  const products = new Map<string, CatalogProduct>()
  const marketSlugs = new Set<string>()

  for (const p of productosResult.rows) {
    const market = (Array.isArray(p.market) ? p.market[0] : p.market) as
      | { id: string; name: string; slug: string; is_active: boolean }
      | undefined
    if (!market || market.is_active === false) continue

    marketSlugs.add(market.slug)
    products.set(`${market.slug}::${p.slug as string}`, {
      productId: p.id as string,
      productSlug: p.slug as string,
      productName: p.name as string,
      marketId: market.id,
      marketSlug: market.slug,
      marketName: market.name,
      lonja: (p.lonja as string | null) ?? null,
      // 034 — la unidad CONFIGURADA de la referencia, del tipo «€/100 Kg». Es la
      // que el validador usa para resolver y comprobar la del fichero.
      unit: (p.unit as string | null) ?? null,
    })
  }

  // ── Claves ya guardadas (037) ─────────────────────────────────────────────
  //
  // Se leía `product_price_records` ENTERA para saber qué filas del fichero ya
  // existían. Con 73.340 precios eso era inviable y, sobre todo, silenciosamente
  // erróneo: PostgREST devolvía 1.000 filas y la vista previa daba por nuevas
  // las otras 72.340. El índice único seguía protegiendo la base —esas filas se
  // descartaban en la confirmación—, pero el resumen prometía importar miles de
  // registros que luego no entraban.
  //
  // Ahora lo agrega PostgreSQL, acotado por los dos ejes que el propio
  // importador ya garantiza: los productos que aparecen en el fichero y el
  // periodo del batch. Una fila fuera del periodo se rechaza por fecha, así que
  // sus duplicados no pueden importar.
  const productIds = [...new Set([...products.values()].map((p) => p.productId))]

  const { data: existentes, error: existentesError } = await supabase.rpc(
    'market_existing_price_keys',
    { p_product_ids: productIds, p_from: rango.from, p_to: rango.to },
  )

  if (existentesError) {
    console.error(`[import] claves existentes: ${existentesError.code ?? '?'} ${existentesError.message}`)
    return { error: MESSAGES.generico }
  }

  const existingKeys = new Set<string>()
  for (const tupla of (Array.isArray(existentes) ? existentes : []) as unknown[]) {
    if (!Array.isArray(tupla) || tupla.length < 5) continue
    const [productId, recordedAt, currency, unit, lonja] = tupla as string[]
    // La moneda llega ya colapsada a cadena vacía cuando es NULL, igual que hace
    // el índice único con `coalesce(currency, '')`.
    existingKeys.add(naturalKey(productId, recordedAt, currency || null, unit, lonja || null))
  }

  const catalog: ValidationCatalog = { products, marketSlugs, existingKeys }

  // ── Validar ───────────────────────────────────────────────────────────────
  const seenKeys = new Set<string>()
  const filas = parsed.rows.map((r) => validateRow(r.line, r.values, catalog, rango, seenKeys))

  // Los errores estructurales del CSV (columnas descuadradas) también son filas
  // rechazadas: se añaden para que aparezcan en la previsualización.
  for (const e of parsed.errors) {
    if (e.line === 1) continue
    filas.push({
      line: e.line,
      status: 'invalid',
      errors: [{ column: null, message: e.message }],
      raw: {},
      marketSlug: '', productSlug: '', marketId: null, marketName: null,
      productId: null, productName: null, lonja: null, lonjaSource: null,
      recordedAt: null, price: null, currency: null, unit: null,
      country: 'ES', region: null, minPrice: null, maxPrice: null,
      avgPrice: null, volume: null, source: null, notes: null,
    })
  }
  filas.sort((a, b) => a.line - b.line)

  // 034 — segunda pasada: si dos filas comparten clave natural pero traen
  // precios DISTINTOS, no entra ninguna. Quedarse con la primera sería elegir a
  // ciegas entre dos precios de mercado.
  const revisadas = flagConflictingDuplicates(filas)

  const resumen = summarize(revisadas)
  const estado: ImportBatchStatus = resumen.validRows > 0 ? 'ready' : 'invalid'

  // ── Persistir ─────────────────────────────────────────────────────────────
  const { data: batch, error: batchError } = await supabase
    .from('market_import_batches')
    .insert({
      filename: file.name.slice(0, 255),
      file_hash: fileHash,
      file_size: file.size,
      period_type: rango.type,
      period_from: rango.from,
      period_to: rango.to,
      period_label: rango.label,
      status: estado,
      total_rows: resumen.totalRows,
      valid_rows: resumen.validRows,
      invalid_rows: resumen.invalidRows,
      duplicate_rows: resumen.duplicateRows,
      created_by: userId,
      validated_at: new Date().toISOString(),
      metadata: { marketsFound: resumen.marketsFound, productsFound: resumen.productsFound },
    })
    .select('id')
    .single()

  if (batchError || !batch) {
    console.error(`[import] alta de batch falló: ${batchError?.code ?? '?'} ${batchError?.message ?? ''}`)
    return { error: MESSAGES.generico }
  }

  // Inserción por lotes: un solo INSERT de 15.000 filas puede superar los
  // límites de tamaño de petición de PostgREST.
  const LOTE = 500
  for (let i = 0; i < revisadas.length; i += LOTE) {
    const trozo = revisadas.slice(i, i + LOTE).map((f) => ({
      batch_id: batch.id,
      row_number: f.line,
      status: f.status,
      raw_data: f.raw,
      validation_errors: f.errors,
      resolved_market_id: f.marketId,
      resolved_product_id: f.productId,
      resolved_recorded_at: f.recordedAt,
      resolved_price: f.price,
      resolved_currency: f.currency,
      resolved_unit: f.unit,
      // 034 — la lonja resuelta por el SERVIDOR. Es lo que escribirá
      // `commit_market_import`; el navegador no interviene.
      resolved_lonja: f.lonja,
      resolved_country: f.country,
      resolved_region: f.region,
      resolved_min_price: f.minPrice,
      resolved_max_price: f.maxPrice,
      resolved_avg_price: f.avgPrice,
      resolved_volume: f.volume,
      resolved_source: f.source,
      resolved_notes: f.notes,
    }))

    const { error } = await supabase.from('market_import_rows').insert(trozo)
    if (error) {
      console.error(`[import] alta de filas falló: ${error.code ?? '?'} ${error.message}`)
      // El batch queda huérfano y sin filas completas: se marca cancelado para
      // que nadie pueda confirmarlo a medias.
      await supabase.from('market_import_batches').update({ status: 'cancelled' }).eq('id', batch.id)
      return { error: MESSAGES.generico }
    }
  }

  revalidatePath('/admin/precios/importar')

  return {
    batchId: batch.id,
    duplicateFileWarning: previo
      ? { batchId: previo.id, importedAt: previo.imported_at, status: previo.status }
      : undefined,
  }
}

// ── 2. Consultar el batch ───────────────────────────────────────────────────

export async function getImportBatch(batchId: string): Promise<ImportBatchSummary | null> {
  const { supabase } = await requirePlatformAdmin()

  const { data } = await supabase
    .from('market_import_batches')
    .select(`
      id, filename, file_hash, period_type, period_label, period_from, period_to,
      status, total_rows, valid_rows, invalid_rows, duplicate_rows, imported_rows,
      created_at, validated_at, imported_at,
      creator:profiles!market_import_batches_created_by_fkey(first_name, last_name)
    `)
    .eq('id', batchId)
    .maybeSingle()

  if (!data) return null

  const creator = (Array.isArray(data.creator) ? data.creator[0] : data.creator) as
    | { first_name: string | null; last_name: string | null }
    | null

  return {
    id: data.id,
    filename: data.filename,
    fileHash: data.file_hash,
    periodType: data.period_type as ImportPeriodType,
    periodLabel: data.period_label,
    periodFrom: data.period_from,
    periodTo: data.period_to,
    status: data.status as ImportBatchStatus,
    totalRows: data.total_rows,
    validRows: data.valid_rows,
    invalidRows: data.invalid_rows,
    duplicateRows: data.duplicate_rows,
    importedRows: data.imported_rows,
    createdAt: data.created_at,
    validatedAt: data.validated_at,
    importedAt: data.imported_at,
    createdByName: creator
      ? [creator.first_name, creator.last_name].filter(Boolean).join(' ') || null
      : null,
  }
}

export interface ImportRowView {
  line: number
  status: ImportRowStatus
  marketName: string | null
  productName: string | null
  lonja: string | null
  recordedAt: string | null
  price: number | null
  currency: string | null
  unit: string | null
  errors: { column: string | null; message: string }[]
}

export interface ImportRowsPage {
  rows: ImportRowView[]
  total: number
  page: number
  pageSize: number
}

/**
 * Filas del batch, PAGINADAS en servidor.
 *
 * Nunca se mandan 15.000 filas al navegador: sería un JSON de varios megabytes
 * y un DOM que ningún portátil mueve. El filtro por estado también se resuelve
 * en la consulta, apoyado en `idx_mir_batch_status`.
 */
export async function getImportRows(
  batchId: string,
  options: { status?: ImportRowStatus | 'all'; page?: number } = {},
): Promise<ImportRowsPage> {
  const { supabase } = await requirePlatformAdmin()

  const page = Math.max(1, options.page ?? 1)
  const desde = (page - 1) * IMPORT_PREVIEW_PAGE_SIZE

  // Los embeds se desambiguan por el NOMBRE de la clave foránea: la tabla tiene
  // dos columnas que apuntan a catálogo (`resolved_market_id`,
  // `resolved_product_id`) y PostgREST no puede adivinar cuál usar.
  // 049 — el estado «importada» ya no se guarda en la fila: se deriva de que
  // exista un precio que la referencie. El embed inverso va por el NOMBRE de la
  // FK porque entre estas dos tablas hay dos relaciones (`import_row_id` hacia
  // aquí, `imported_record_id` hacia allá) y PostgREST no puede elegir sola.
  let query = supabase
    .from('market_import_rows')
    .select(
      `row_number, status, resolved_recorded_at, resolved_price, resolved_currency,
       resolved_unit, resolved_lonja, validation_errors,
       market:markets!market_import_rows_resolved_market_id_fkey(name),
       product:products!market_import_rows_resolved_product_id_fkey(name),
       precios:product_price_records!product_price_records_import_row_id_fkey(id)`,
      { count: 'exact' },
    )
    .eq('batch_id', batchId)
    .order('row_number')

  if (options.status && options.status !== 'all') query = query.eq('status', options.status)

  const { data, count } = await query.range(desde, desde + IMPORT_PREVIEW_PAGE_SIZE - 1)

  const rows: ImportRowView[] = ((data ?? []) as unknown as Array<Record<string, unknown>>).map((r) => {
    const market = (Array.isArray(r.market) ? r.market[0] : r.market) as { name: string } | null
    const product = (Array.isArray(r.product) ? r.product[0] : r.product) as { name: string } | null

    return {
      line: r.row_number as number,
      status: deriveImportRowStatus(r.status as ImportRowStatus, hasImportedPrice(r.precios)),
      marketName: market?.name ?? null,
      productName: product?.name ?? null,
      // 034 — la lonja que se va a ESCRIBIR, no la del producto. Son cosas
      // distintas desde que una referencia puede cotizar en varias plazas.
      lonja: (r.resolved_lonja as string | null) ?? null,
      recordedAt: (r.resolved_recorded_at as string | null) ?? null,
      price: r.resolved_price != null ? Number(r.resolved_price) : null,
      currency: (r.resolved_currency as string | null) ?? null,
      unit: (r.resolved_unit as string | null) ?? null,
      errors: (r.validation_errors as { column: string | null; message: string }[]) ?? [],
    }
  })

  return { rows, total: count ?? 0, page, pageSize: IMPORT_PREVIEW_PAGE_SIZE }
}

// ── 3. Confirmar ────────────────────────────────────────────────────────────

export interface CommitImportResult {
  importedRows?: number
  status?: string
  error?: string
}

/**
 * Confirma la importación.
 *
 * Solo manda el identificador del batch: qué se inserta lo decide
 * `commit_market_import` leyendo las filas que el propio servidor validó. La
 * función corre en una única transacción, comprueba `platform_admin` por su
 * cuenta y bloquea el batch, así que un doble clic o dos pestañas no pueden
 * importar dos veces.
 */
export async function commitImportBatch(batchId: string): Promise<CommitImportResult> {
  const { supabase } = await requirePlatformAdmin('throw')

  if (!batchId?.trim()) return { error: MESSAGES.noEncontrado }

  const { data, error } = await supabase.rpc('commit_market_import', { p_batch_id: batchId })

  if (error) {
    console.error(`[import] confirmación falló: ${error.code ?? '?'} ${error.message}`)
    // El mensaje se elige por SQLSTATE, no por el texto. Los tres códigos que
    // lanza `commit_market_import` traen mensajes escritos para leerse; el
    // resto —un timeout de sentencia, una violación de restricción— trae texto
    // de PostgreSQL que nombra tablas y columnas y no sale a pantalla.
    return { error: safeCommitErrorMessage(error.code, error.message) }
  }

  const resultado = data as { imported_rows?: number; status?: string } | null

  revalidatePath('/admin/precios/importar')
  revalidatePath('/admin/precios')
  revalidatePath('/app/market-intelligent')

  return { importedRows: resultado?.imported_rows ?? 0, status: resultado?.status }
}

export async function cancelImportBatch(batchId: string): Promise<{ error?: string }> {
  const { supabase } = await requirePlatformAdmin('throw')

  const { data: batch } = await supabase
    .from('market_import_batches')
    .select('status')
    .eq('id', batchId)
    .maybeSingle()

  if (!batch) return { error: MESSAGES.noEncontrado }
  if (!canCancelBatch(batch.status as ImportBatchStatus)) {
    return { error: 'Esta importación ya no se puede cancelar.' }
  }

  const { error } = await supabase
    .from('market_import_batches')
    .update({ status: 'cancelled' })
    .eq('id', batchId)
    .eq('status', batch.status) // no pisar un cambio concurrente

  if (error) return { error: MESSAGES.generico }

  revalidatePath('/admin/precios/importar')
  return {}
}

// ── 4. Descargas ────────────────────────────────────────────────────────────

/**
 * Plantilla oficial.
 *
 * El contenido vive en `imports/template.ts`, junto a las columnas que valida el
 * importador, para que un test pueda comprobar que lo que se descarga es lo que
 * el parser acepta. La ruta anterior servía una plantilla desfasada y nadie lo
 * habría notado hasta rellenar una columna que se ignoraba.
 */
export async function getImportTemplateCsv(): Promise<string> {
  await requirePlatformAdmin()
  return buildImportTemplateCsv()
}

/**
 * CSV con las filas rechazadas.
 *
 * Va por `buildCsv`, que antepone un apóstrofo a cualquier celda que empiece
 * por `=`, `+`, `-` o `@`. Ese es el punto: el contenido de este fichero VIENE
 * del que subió alguien, así que sin neutralizar se ejecutaría como fórmula en
 * el Excel de quien descarga los errores.
 */
export async function getImportErrorsCsv(batchId: string): Promise<string> {
  const { supabase } = await requirePlatformAdmin()

  const { data } = await supabase
    .from('market_import_rows')
    .select('row_number, status, raw_data, validation_errors')
    .eq('batch_id', batchId)
    .in('status', ['invalid', 'duplicate'])
    .order('row_number')

  const filas = (data ?? []) as Array<{
    row_number: number
    status: string
    raw_data: Record<string, string>
    validation_errors: { column: string | null; message: string }[]
  }>

  const columnas = [
    'market_slug', 'product_slug', 'recorded_at', 'price', 'currency', 'unit',
    'lonja', 'country', 'region', 'min_price', 'max_price', 'avg_price',
    'volume', 'source', 'notes',
  ]

  return buildCsv(
    ['linea', 'estado', ...columnas, 'errores'],
    filas.map((f) => [
      f.row_number,
      f.status === 'duplicate' ? 'duplicada' : 'inválida',
      ...columnas.map((c) => f.raw_data?.[c] ?? ''),
      (f.validation_errors ?? []).map((e) => (e.column ? `${e.column}: ${e.message}` : e.message)).join(' | '),
    ]),
  )
}

/** Historial de importaciones. */
export async function listImportBatches(limit = 20): Promise<ImportBatchSummary[]> {
  const { supabase } = await requirePlatformAdmin()

  const { data } = await supabase
    .from('market_import_batches')
    .select(`
      id, filename, file_hash, period_type, period_label, period_from, period_to,
      status, total_rows, valid_rows, invalid_rows, duplicate_rows, imported_rows,
      created_at, validated_at, imported_at,
      creator:profiles!market_import_batches_created_by_fkey(first_name, last_name)
    `)
    .order('created_at', { ascending: false })
    .limit(limit)

  return ((data ?? []) as unknown as Array<Record<string, unknown>>).map((d) => {
    const creator = (Array.isArray(d.creator) ? d.creator[0] : d.creator) as
      | { first_name: string | null; last_name: string | null }
      | null
    return {
      id: d.id as string,
      filename: d.filename as string,
      fileHash: d.file_hash as string,
      periodType: d.period_type as ImportPeriodType,
      periodLabel: d.period_label as string,
      periodFrom: d.period_from as string,
      periodTo: d.period_to as string,
      status: d.status as ImportBatchStatus,
      totalRows: d.total_rows as number,
      validRows: d.valid_rows as number,
      invalidRows: d.invalid_rows as number,
      duplicateRows: d.duplicate_rows as number,
      importedRows: d.imported_rows as number,
      createdAt: d.created_at as string,
      validatedAt: (d.validated_at as string | null) ?? null,
      importedAt: (d.imported_at as string | null) ?? null,
      createdByName: creator
        ? [creator.first_name, creator.last_name].filter(Boolean).join(' ') || null
        : null,
    }
  })
}

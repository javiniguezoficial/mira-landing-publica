'use server'

import { requirePlatformAdmin } from '@/lib/auth/guards'
import * as XLSX from 'xlsx'
import {
  MAX_FILE_SIZE_BYTES,
  MAX_ROWS,
  REQUIRED_COLUMNS,
  ALL_COLUMNS,
  type ValidatedRow,
  type RowError,
  type ColumnIssues,
  type ParseResult,
  type ImportResult,
} from '@/lib/types/import-prices'


// ── Helpers ───────────────────────────────────────────────────────────────────

function isValidDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s))
}

function parseNum(s: string | undefined | null): number | null {
  if (s == null || String(s).trim() === '') return null
  const n = parseFloat(String(s).replace(',', '.'))
  return isNaN(n) ? null : n
}

function cellStr(v: unknown): string {
  if (v == null) return ''
  return String(v).trim()
}

// ── Acción: parsear y validar archivo ─────────────────────────────────────────

export async function parseAndValidatePriceFile(
  formData: FormData,
): Promise<ParseResult> {
  const { supabase } = await requirePlatformAdmin()

  const file = formData.get('file') as File | null
  if (!file) throw new Error('No se ha recibido ningún archivo.')

  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(`El archivo supera el límite de 5 MB (${(file.size / 1024 / 1024).toFixed(1)} MB).`)
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: false,
  })

  if (rawRows.length > MAX_ROWS) {
    throw new Error(`El archivo contiene ${rawRows.length} filas. El límite es ${MAX_ROWS} filas por importación.`)
  }

  if (rawRows.length === 0) {
    return { valid: [], errors: [], columnIssues: null, totalRows: 0 }
  }

  // ── Verificar columnas ────────────────────────────────────────────────────
  const fileColumns = Object.keys(rawRows[0])
  const allColSet = new Set(ALL_COLUMNS as readonly string[])
  const fileColSet = new Set(fileColumns)
  const reqColSet = new Set(REQUIRED_COLUMNS as readonly string[])

  const missing = [...reqColSet].filter(c => !fileColSet.has(c))
  const extra   = fileColumns.filter(c => !allColSet.has(c))

  if (missing.length > 0) {
    return {
      valid: [],
      errors: [],
      columnIssues: { missing, extra },
      totalRows: rawRows.length,
    }
  }

  const columnIssues: ColumnIssues | null = extra.length > 0
    ? { missing: [], extra }
    : null

  // ── Catálogo de productos ─────────────────────────────────────────────────
  const { data: productRows } = await supabase
    .from('products')
    .select('id, name, slug, market:markets(slug)')
    .eq('is_active', true)

  const productMap = new Map<string, { id: string; name: string }>()
  for (const p of productRows ?? []) {
    const mkt = Array.isArray(p.market) ? p.market[0] : p.market
    if (mkt?.slug) {
      productMap.set(`${mkt.slug}::${p.slug}`, { id: p.id, name: p.name })
    }
  }

  // ── Existentes para duplicados ────────────────────────────────────────────
  const { data: existingRows } = await supabase
    .from('product_price_records')
    .select('product_id, recorded_at, country, region, unit')

  const existingSet = new Set<string>()
  for (const r of existingRows ?? []) {
    existingSet.add(`${r.product_id}|${r.recorded_at}|${r.country}|${r.region ?? ''}|${r.unit}`)
  }

  // ── Validar filas ─────────────────────────────────────────────────────────
  const valid: ValidatedRow[] = []
  const errors: RowError[]    = []

  rawRows.forEach((raw, idx) => {
    const rowIndex = idx + 2
    const rowErrors: string[] = []

    const market_slug  = cellStr(raw['market_slug'])
    const product_slug = cellStr(raw['product_slug'])
    const recorded_at  = cellStr(raw['recorded_at'])
    const priceStr     = cellStr(raw['price'])
    const unit         = cellStr(raw['unit'])
    const currency     = cellStr(raw['currency'])   || 'EUR'
    const country      = cellStr(raw['country'])    || 'ES'
    const region       = cellStr(raw['region'])     || null
    const source_name  = cellStr(raw['source_name']) || null
    const notes        = cellStr(raw['notes'])        || null

    let productEntry: { id: string; name: string } | undefined
    if (!market_slug)  rowErrors.push('market_slug vacío')
    if (!product_slug) rowErrors.push('product_slug vacío')
    if (market_slug && product_slug) {
      productEntry = productMap.get(`${market_slug}::${product_slug}`)
      if (!productEntry) rowErrors.push(`Producto no encontrado: ${market_slug}/${product_slug}`)
    }

    if (!recorded_at) {
      rowErrors.push('recorded_at vacío')
    } else if (!isValidDate(recorded_at)) {
      rowErrors.push(`Fecha inválida "${recorded_at}" — usa YYYY-MM-DD`)
    }

    const price = parseNum(priceStr)
    if (price == null)   rowErrors.push(`price no es un número válido: "${priceStr}"`)
    else if (price <= 0) rowErrors.push(`price debe ser mayor que 0 (recibido: ${price})`)

    if (!unit) rowErrors.push('unit vacío')

    if (rowErrors.length > 0) {
      errors.push({
        rowIndex,
        rawData: Object.fromEntries(
          Object.entries(raw).map(([k, v]) => [k, String(v)])
        ),
        errors: rowErrors,
      })
      return
    }

    const dupKey = `${productEntry!.id}|${recorded_at}|${country}|${region ?? ''}|${unit}`
    const isDuplicate = existingSet.has(dupKey)

    valid.push({
      rowIndex,
      product_id:   productEntry!.id,
      product_name: productEntry!.name,
      market_slug,
      product_slug,
      recorded_at,
      price:        price!,
      unit,
      currency,
      country,
      region:    region || null,
      min_price: parseNum(cellStr(raw['min_price'])),
      max_price: parseNum(cellStr(raw['max_price'])),
      avg_price: parseNum(cellStr(raw['avg_price'])),
      volume:    parseNum(cellStr(raw['volume'])),
      source_name,
      notes,
      isDuplicate,
    })
  })

  return { valid, errors, columnIssues, totalRows: rawRows.length }
}

// ── Acción: insertar filas confirmadas ────────────────────────────────────────

export async function importPriceRecords(
  rows: ValidatedRow[],
): Promise<ImportResult> {
  const { supabase } = await requirePlatformAdmin()

  const toInsert = rows.filter(r => !r.isDuplicate)

  if (toInsert.length === 0) {
    return { inserted: 0, skipped: rows.length }
  }

  const { error } = await supabase
    .from('product_price_records')
    .insert(
      toInsert.map(r => ({
        product_id:  r.product_id,
        price:       r.price,
        unit:        r.unit,
        currency:    r.currency,
        country:     r.country,
        region:      r.region,
        recorded_at: r.recorded_at,
        min_price:   r.min_price,
        max_price:   r.max_price,
        avg_price:   r.avg_price,
        volume:      r.volume,
        metadata:    r.source_name || r.notes
          ? { source_name: r.source_name, notes: r.notes }
          : null,
      }))
    )

  if (error) throw new Error(error.message)

  return {
    inserted: toInsert.length,
    skipped:  rows.length - toInsert.length,
  }
}

'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import * as XLSX from 'xlsx'
import {
  MAX_FILE_SIZE_BYTES,
  MAX_ROWS,
  REQUIRED_COLUMNS,
  ALL_COLUMNS,
  type ValidatedSupplierRow,
  type RowError,
  type ColumnIssues,
  type ParseResult,
  type ImportResult,
} from '@/lib/types/import-suppliers'

// ── Guard ─────────────────────────────────────────────────────────────────────

async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'platform_admin') redirect('/app/dashboard')
  return supabase
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function cellStr(v: unknown): string {
  if (v == null) return ''
  return String(v).trim()
}

// Convierte "1,25" o "1.25" a número; vacío → null; inválido → NaN sentinela
function parseNumOrNaN(s: string): number | null | typeof NaN {
  if (s === '') return null
  const n = parseFloat(s.replace(',', '.'))
  return isNaN(n) ? NaN : n
}

// Acepta 1, 0, sí, si, no, true, false, yes, etc. Vacío → default true.
function parseActivo(s: string): boolean {
  const v = s.trim().toLowerCase()
  if (v === '') return true
  if (['0', 'false', 'no', 'n', 'inactivo', 'falso'].includes(v)) return false
  if (['1', 'true', 'si', 'sí', 'yes', 'y', 's', 'activo', 'verdadero'].includes(v)) return true
  return true   // valor desconocido → activo por defecto
}

// Clave de duplicado: nombre + provincia + localidad (case-insensitive)
function dupKey(name: string, region: string | null, city: string | null): string {
  return `${name.toLowerCase()}|${(region ?? '').toLowerCase()}|${(city ?? '').toLowerCase()}`
}

// ── Acción: parsear y validar archivo ─────────────────────────────────────────

export async function parseAndValidateSupplierFile(
  formData: FormData,
): Promise<ParseResult> {
  const supabase = await requireAdmin()

  const file = formData.get('file') as File | null
  if (!file) throw new Error('No se ha recibido ningún archivo.')

  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error(`El archivo supera el límite de 5 MB (${(file.size / 1024 / 1024).toFixed(1)} MB).`)
  }

  const buffer = Buffer.from(await file.arrayBuffer())
  // XLSX.read autodetecta el separador en CSV (',' o ';') y también lee XLSX
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: false })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: false,
  })

  if (rawRows.length > MAX_ROWS) {
    throw new Error(
      `El archivo contiene ${rawRows.length} filas. El límite es ${MAX_ROWS} filas por importación. ` +
      `Para importaciones superiores, divide el archivo en varios lotes.`
    )
  }

  if (rawRows.length === 0) {
    return { valid: [], errors: [], columnIssues: null, totalRows: 0 }
  }

  // ── Verificar columnas ──────────────────────────────────────────────────────
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

  // ── Catálogo de mercados (resolución por nombre, case-insensitive) ──────────
  const { data: marketRows } = await supabase
    .from('markets')
    .select('id, name')
    .eq('is_active', true)

  const marketMap = new Map<string, { id: string; name: string }>()
  for (const m of marketRows ?? []) {
    marketMap.set(m.name.toLowerCase(), { id: m.id, name: m.name })
  }

  // ── Proveedores existentes (detección de duplicados por nombre+prov+localidad)
  const { data: existingRows } = await supabase
    .from('suppliers')
    .select('name, region, city')

  const existingSet = new Set<string>()
  for (const r of existingRows ?? []) {
    existingSet.add(dupKey(r.name ?? '', r.region ?? null, r.city ?? null))
  }

  // Duplicados dentro del propio archivo
  const seenInFile = new Set<string>()

  // ── Validar filas ───────────────────────────────────────────────────────────
  const valid: ValidatedSupplierRow[] = []
  const errors: RowError[] = []

  rawRows.forEach((raw, idx) => {
    const rowIndex = idx + 2   // +2: cabecera + base 1
    const rowErrors: string[] = []
    const warnings: string[] = []

    const name = cellStr(raw['nombre'])
    if (!name) rowErrors.push('nombre vacío')

    // Email
    const emailRaw = cellStr(raw['email'])
    let email: string | null = null
    if (emailRaw) {
      if (EMAIL_RE.test(emailRaw)) email = emailRaw
      else rowErrors.push(`email inválido: "${emailRaw}"`)
    }

    // Latitud / Longitud
    const latRaw = cellStr(raw['latitud'])
    const lngRaw = cellStr(raw['longitud'])
    let latitude: number | null = null
    let longitude: number | null = null

    const latParsed = parseNumOrNaN(latRaw)
    if (Number.isNaN(latParsed)) rowErrors.push(`latitud inválida: "${latRaw}"`)
    else if (latParsed != null && (latParsed < -90 || latParsed > 90)) rowErrors.push(`latitud fuera de rango: ${latParsed}`)
    else latitude = latParsed

    const lngParsed = parseNumOrNaN(lngRaw)
    if (Number.isNaN(lngParsed)) rowErrors.push(`longitud inválida: "${lngRaw}"`)
    else if (lngParsed != null && (lngParsed < -180 || lngParsed > 180)) rowErrors.push(`longitud fuera de rango: ${lngParsed}`)
    else longitude = lngParsed

    // Si hay errores, no seguimos validando esta fila
    if (rowErrors.length > 0) {
      errors.push({
        rowIndex,
        rawData: Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, String(v)])),
        errors: rowErrors,
      })
      return
    }

    // ── Campos restantes ──────────────────────────────────────────────────────
    const region = cellStr(raw['provincia']) || null
    const city   = cellStr(raw['localidad']) || null

    // Resolución de mercado por nombre
    const marketInputRaw = cellStr(raw['mercado'])
    let market_id: string | null = null
    if (marketInputRaw) {
      const found = marketMap.get(marketInputRaw.toLowerCase())
      if (found) market_id = found.id
      else warnings.push(`Mercado no encontrado: "${marketInputRaw}" — se deja sin asignar`)
    }

    // Warning: duplicado (BD o dentro del archivo) → se omitirá en la inserción
    const key = dupKey(name, region, city)
    let isDuplicate = false
    if (existingSet.has(key)) {
      isDuplicate = true
      warnings.push('Posible duplicado: ya existe un proveedor con mismo nombre + provincia/localidad')
    } else if (seenInFile.has(key)) {
      isDuplicate = true
      warnings.push('Duplicado dentro del archivo: mismo nombre + provincia/localidad en una fila anterior')
    }
    seenInFile.add(key)

    // Warnings informativos por campos opcionales relevantes
    if (!emailRaw && !cellStr(raw['telefono'])) {
      warnings.push('Sin email ni teléfono')
    }
    if (latitude == null || longitude == null) {
      warnings.push('Sin coordenadas: no aparecerá en el mapa')
    }

    valid.push({
      rowIndex,
      name,
      email,
      phone:       cellStr(raw['telefono']) || null,
      website:     cellStr(raw['web']) || null,
      tax_id:      cellStr(raw['nif_cif']) || null,
      country:     cellStr(raw['pais']) || 'ES',
      region,
      city,
      postal_code: cellStr(raw['codigo_postal']) || null,
      address:     cellStr(raw['direccion']) || null,
      latitude,
      longitude,
      category:    cellStr(raw['categoria']) || null,
      market_id,
      market_input: marketInputRaw || null,
      family:      cellStr(raw['familia']) || null,
      subfamily:   cellStr(raw['subfamilia']) || null,
      produccion:  cellStr(raw['produccion']) || null,
      medida:      cellStr(raw['medida']) || null,
      notes:       cellStr(raw['notas']) || null,
      is_active:   parseActivo(cellStr(raw['activo'])),
      warnings,
      isDuplicate,
    })
  })

  return { valid, errors, columnIssues, totalRows: rawRows.length }
}

// ── Acción: insertar filas confirmadas ────────────────────────────────────────

export async function importSuppliers(
  rows: ValidatedSupplierRow[],
): Promise<ImportResult> {
  const supabase = await requireAdmin()

  // Solo insertamos filas válidas no duplicadas
  const toInsert = rows.filter(r => !r.isDuplicate)

  if (toInsert.length === 0) {
    return { inserted: 0, skipped: rows.length }
  }

  const payload = toInsert.map(r => ({
    name:        r.name,
    email:       r.email,
    phone:       r.phone,
    website:     r.website,
    tax_id:      r.tax_id,
    country:     r.country,
    region:      r.region,
    city:        r.city,
    postal_code: r.postal_code,
    address:     r.address,
    latitude:    r.latitude,
    longitude:   r.longitude,
    category:    r.category,
    market_id:   r.market_id,
    family:      r.family,
    subfamily:   r.subfamily,
    produccion:  r.produccion,
    medida:      r.medida,
    notes:       r.notes,
    is_active:   r.is_active,
  }))

  // Inserción por lotes de 500 para no enviar arrays enormes en una sola llamada
  const CHUNK = 500
  let inserted = 0
  for (let i = 0; i < payload.length; i += CHUNK) {
    const chunk = payload.slice(i, i + CHUNK)
    const { error } = await supabase.from('suppliers').insert(chunk)
    if (error) throw new Error(error.message)
    inserted += chunk.length
  }

  return {
    inserted,
    skipped: rows.length - toInsert.length,
  }
}

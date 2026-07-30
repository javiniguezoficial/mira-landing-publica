// Validación de filas de la importación masiva (Fase 2.5, MVP).
//
// Módulo puro: recibe el catálogo ya cargado y devuelve filas normalizadas. No
// consulta nada, así que se puede probar exhaustivamente sin red ni base de
// datos — que es justo lo que hace falta cuando de estas reglas depende que no
// se corrompa el histórico de precios.

import { isFormulaLike } from './csv'
import { isDateInPeriod, parseDateOnly, type ImportPeriodRange } from './period'
import {
  REQUIRED_IMPORT_COLUMNS,
  type ImportColumn,
  type ImportRowError,
  type ImportSummary,
  type NormalizedImportRow,
} from './types'

/** Entrada del catálogo: un producto resuelto con su mercado. */
export interface CatalogProduct {
  productId: string
  productSlug: string
  productName: string
  marketId: string
  marketSlug: string
  marketName: string
  /** `products.lonja`. Texto libre, puede faltar. */
  lonja: string | null
}

export interface ValidationCatalog {
  /** Clave `marketSlug::productSlug`. Los slugs son únicos por mercado. */
  products: Map<string, CatalogProduct>
  /** Slugs de mercado existentes, para distinguir «mercado no existe» de «producto no existe». */
  marketSlugs: Set<string>
  /** Monedas admitidas, tomadas de los datos reales. */
  currencies: Set<string>
  /** Unidades admitidas, tomadas de los datos reales. */
  units: Set<string>
  /** Claves naturales ya presentes en la base: `productId|recordedAt|currency|unit`. */
  existingKeys: Set<string>
}

/** La clave natural. Debe coincidir EXACTAMENTE con el índice único de la 030. */
export function naturalKey(
  productId: string,
  recordedAt: string,
  currency: string,
  unit: string,
): string {
  return `${productId}|${recordedAt}|${currency}|${unit}`
}

// ── Normalizadores ──────────────────────────────────────────────────────────

function texto(raw: string | undefined): string {
  return (raw ?? '').trim().replace(/\s+/g, ' ')
}

/**
 * Convierte a número.
 *
 * ── Sobre la coma decimal ───────────────────────────────────────────────────
 *
 * Se acepta la coma como separador decimal SOLO si no hay ningún punto en el
 * mismo valor. Un `1.482` es mil cuatrocientos ochenta y dos o uno coma cuatro
 * ocho dos según el país, y equivocarse multiplica el precio por mil.
 *
 *   "1,48"    → 1.48   (coma decimal, sin ambigüedad)
 *   "1.48"    → 1.48   (punto decimal)
 *   "1.482,5" → error  (ambos separadores: no se adivina)
 *   "1,482.5" → error
 *
 * Tampoco se admiten separadores de miles: `1.482` se lee como uno coma cuatro
 * ocho dos, que es lo que dice la plantilla, y quien escriba miles con punto
 * verá un precio raro en la previsualización antes de confirmar.
 */
export function parseDecimal(raw: string | undefined): number | null {
  const s = texto(raw)
  if (s === '') return null

  const tienePunto = s.includes('.')
  const tieneComa = s.includes(',')
  if (tienePunto && tieneComa) return null

  const normalizado = tieneComa ? s.replace(',', '.') : s
  if (!/^-?\d+(\.\d+)?$/.test(normalizado)) return null

  const n = Number(normalizado)
  return Number.isFinite(n) ? n : null
}

// ── Validación de una fila ──────────────────────────────────────────────────

function error(column: ImportColumn | null, message: string): ImportRowError {
  return { column, message }
}

/**
 * Valida y normaliza UNA fila.
 *
 * `seenKeys` acumula las claves naturales ya vistas en ESTE fichero, para
 * detectar duplicados internos además de los que ya están en la base.
 */
export function validateRow(
  line: number,
  raw: Record<string, string>,
  catalog: ValidationCatalog,
  period: ImportPeriodRange,
  seenKeys: Set<string>,
): NormalizedImportRow {
  const errors: ImportRowError[] = []

  const marketSlug = texto(raw['market_slug']).toLowerCase()
  const productSlug = texto(raw['product_slug']).toLowerCase()
  const lonjaArchivo = texto(raw['lonja'])

  // ── Contenido peligroso ───────────────────────────────────────────────────
  // Se rechaza en la ENTRADA además de neutralizarlo en la salida. Un valor que
  // empieza por `=` en una columna de texto no es un dato de mercado.
  for (const columna of ['region', 'source', 'notes', 'lonja'] as const) {
    const valor = texto(raw[columna])
    if (valor && isFormulaLike(valor)) {
      errors.push(error(columna, `El valor no puede empezar por «${valor[0]}» (se interpretaría como fórmula).`))
    }
  }

  // ── Mercado y producto ────────────────────────────────────────────────────
  //
  // Resolución DETERMINISTA por slug exacto. `products_market_slug_key` garantiza
  // que `(market_id, slug)` es único, así que no hay ambigüedad posible: o casa
  // una fila o ninguna. Nada de búsqueda difusa ni de elegir «la más parecida».
  let producto: CatalogProduct | undefined

  if (!marketSlug) errors.push(error('market_slug', 'El mercado es obligatorio.'))
  if (!productSlug) errors.push(error('product_slug', 'El producto es obligatorio.'))

  if (marketSlug && productSlug) {
    producto = catalog.products.get(`${marketSlug}::${productSlug}`)
    if (!producto) {
      if (!catalog.marketSlugs.has(marketSlug)) {
        errors.push(error('market_slug', `El mercado «${marketSlug}» no existe o no está activo.`))
      } else {
        // El mercado existe: el producto no está en ÉL. Puede existir en otro,
        // y decirlo así evita que alguien lo busque donde no está.
        errors.push(
          error('product_slug', `El producto «${productSlug}» no existe en el mercado «${marketSlug}» o no está activo.`),
        )
      }
    }
  }

  // ── Lonja ─────────────────────────────────────────────────────────────────
  //
  // Se VALIDA contra `products.lonja`, nunca se escribe. Que el importador
  // pudiera reasignar la lonja de un producto significaría que una errata en una
  // columna opcional altera retroactivamente cómo se agrupan sus precios.
  if (producto && lonjaArchivo) {
    const esperada = (producto.lonja ?? '').trim()
    if (!esperada) {
      errors.push(error('lonja', `El producto no tiene lonja asignada y el archivo indica «${lonjaArchivo}».`))
    } else if (esperada !== lonjaArchivo) {
      errors.push(error('lonja', `La lonja no coincide: el producto es de «${esperada}» y el archivo dice «${lonjaArchivo}».`))
    }
  }

  // ── Fecha ─────────────────────────────────────────────────────────────────
  const recordedAtRaw = texto(raw['recorded_at'])
  let recordedAt: string | null = null

  if (!recordedAtRaw) {
    errors.push(error('recorded_at', 'La fecha es obligatoria.'))
  } else {
    const fecha = parseDateOnly(recordedAtRaw)
    if (!fecha) {
      errors.push(error('recorded_at', `Fecha no válida: «${recordedAtRaw}». Formato esperado AAAA-MM-DD.`))
    } else {
      recordedAt = recordedAtRaw.trim()
      if (!isDateInPeriod(recordedAt, period)) {
        // NO se corrige la fecha. Se rechaza la fila.
        errors.push(
          error('recorded_at', `La fecha ${recordedAt} está fuera del periodo seleccionado (${period.from} a ${period.to}).`),
        )
      }
    }
  }

  // ── Precio ────────────────────────────────────────────────────────────────
  const priceRaw = texto(raw['price'])
  const price = parseDecimal(priceRaw)

  if (priceRaw === '') {
    errors.push(error('price', 'El precio es obligatorio.'))
  } else if (price === null) {
    errors.push(error('price', `El precio no es un número válido: «${priceRaw}». Usa punto o coma decimal, sin separador de miles.`))
  } else if (price <= 0) {
    errors.push(error('price', `El precio debe ser mayor que 0 (recibido ${price}).`))
  }

  // ── Moneda y unidad ───────────────────────────────────────────────────────
  //
  // Allowlist tomada de los valores REALES que ya existen. Es lo que impide que
  // entren «Tn», «TN» y «ton» como tres unidades distintas y partan las series.
  const currency = texto(raw['currency']).toUpperCase()
  if (!currency) {
    errors.push(error('currency', 'La moneda es obligatoria.'))
  } else if (!catalog.currencies.has(currency)) {
    errors.push(
      error('currency', `Moneda no reconocida: «${currency}». Admitidas: ${[...catalog.currencies].sort().join(', ')}.`),
    )
  }

  const unit = texto(raw['unit'])
  if (!unit) {
    errors.push(error('unit', 'La unidad es obligatoria.'))
  } else if (!catalog.units.has(unit)) {
    errors.push(
      error('unit', `Unidad no reconocida: «${unit}». Admitidas: ${[...catalog.units].sort().join(', ')}.`),
    )
  }

  // ── Opcionales numéricos ──────────────────────────────────────────────────
  const numeroOpcional = (columna: ImportColumn): number | null => {
    const bruto = texto(raw[columna])
    if (bruto === '') return null
    const n = parseDecimal(bruto)
    if (n === null) {
      errors.push(error(columna, `No es un número válido: «${bruto}».`))
      return null
    }
    if (n < 0) {
      errors.push(error(columna, `No puede ser negativo (recibido ${n}).`))
      return null
    }
    return n
  }

  const minPrice = numeroOpcional('min_price')
  const maxPrice = numeroOpcional('max_price')
  const avgPrice = numeroOpcional('avg_price')
  const volume = numeroOpcional('volume')

  if (minPrice !== null && maxPrice !== null && minPrice > maxPrice) {
    errors.push(error('min_price', `El mínimo (${minPrice}) no puede ser mayor que el máximo (${maxPrice}).`))
  }
  if (price !== null && minPrice !== null && price < minPrice) {
    errors.push(error('price', `El precio (${price}) no puede ser menor que el mínimo (${minPrice}).`))
  }
  if (price !== null && maxPrice !== null && price > maxPrice) {
    errors.push(error('price', `El precio (${price}) no puede ser mayor que el máximo (${maxPrice}).`))
  }

  const country = texto(raw['country']).toUpperCase() || 'ES'
  const region = texto(raw['region']) || null
  const source = texto(raw['source']) || null
  const notes = texto(raw['notes']) || null

  const base: NormalizedImportRow = {
    line,
    status: 'invalid',
    errors,
    raw,
    marketSlug,
    productSlug,
    marketId: producto?.marketId ?? null,
    marketName: producto?.marketName ?? null,
    productId: producto?.productId ?? null,
    productName: producto?.productName ?? null,
    lonja: producto?.lonja ?? null,
    recordedAt,
    price,
    currency: currency || null,
    unit: unit || null,
    country,
    region,
    minPrice,
    maxPrice,
    avgPrice,
    volume,
    source,
    notes,
  }

  if (errors.length > 0) return base

  // ── Duplicados ────────────────────────────────────────────────────────────
  //
  // Solo se comprueba en filas por lo demás válidas: no tiene sentido decir
  // «además está duplicada» de una fila que ni siquiera resuelve el producto.
  //
  // Se miran DOS orígenes, y ambos cuentan como duplicado:
  //   · el fichero contra sí mismo (`seenKeys`);
  //   · el fichero contra lo ya almacenado (`existingKeys`).
  const key = naturalKey(base.productId!, base.recordedAt!, base.currency!, base.unit!)

  if (catalog.existingKeys.has(key)) {
    return { ...base, status: 'duplicate', errors: [error(null, 'Ya existe un precio para este producto, fecha, moneda y unidad.')] }
  }
  if (seenKeys.has(key)) {
    return { ...base, status: 'duplicate', errors: [error(null, 'Fila repetida dentro del propio archivo.')] }
  }

  seenKeys.add(key)
  return { ...base, status: 'valid', errors: [] }
}

// ── Cabecera ────────────────────────────────────────────────────────────────

export interface HeaderValidation {
  missing: string[]
  unknown: string[]
  ok: boolean
}

export function validateHeaders(headers: string[]): HeaderValidation {
  const presentes = new Set(headers.filter(Boolean))
  const conocidas = new Set<string>([
    ...REQUIRED_IMPORT_COLUMNS,
    'lonja', 'country', 'region', 'min_price', 'max_price', 'avg_price', 'volume', 'source', 'notes',
  ])

  const missing = REQUIRED_IMPORT_COLUMNS.filter((c) => !presentes.has(c))
  // Las columnas de más se avisan pero NO bloquean: un fichero con una columna
  // interna de más sigue siendo utilizable, y solo se ignora esa columna.
  const unknown = [...presentes].filter((c) => !conocidas.has(c))

  return { missing, unknown, ok: missing.length === 0 }
}

// ── Resumen ─────────────────────────────────────────────────────────────────

export function summarize(rows: NormalizedImportRow[]): ImportSummary {
  const mercados = new Set<string>()
  const productos = new Set<string>()
  let validRows = 0
  let invalidRows = 0
  let duplicateRows = 0

  for (const fila of rows) {
    if (fila.marketId) mercados.add(fila.marketId)
    if (fila.productId) productos.add(fila.productId)
    if (fila.status === 'valid') validRows++
    else if (fila.status === 'duplicate') duplicateRows++
    else invalidRows++
  }

  return {
    totalRows: rows.length,
    validRows,
    invalidRows,
    duplicateRows,
    marketsFound: mercados.size,
    productsFound: productos.size,
  }
}

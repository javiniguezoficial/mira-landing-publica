// Validación de filas de la importación masiva (Fase 2.5, MVP).
//
// Módulo puro: recibe el catálogo ya cargado y devuelve filas normalizadas. No
// consulta nada, así que se puede probar exhaustivamente sin red ni base de
// datos — que es justo lo que hace falta cuando de estas reglas depende que no
// se corrompa el histórico de precios.

import { isFormulaLike } from './csv'
import { currencyHelpText, parseCurrency, type ImportCurrency } from './currency'
import { ACCEPTED_DATE_FORMATS, parseImportDate } from './date-input'
import { parseMoney } from './money'
import { isDateInPeriod, type ImportPeriodRange } from './period'
import { canonicalMeasure, measureHelpText, parseUnitExpression } from './units'
import {
  REQUIRED_IMPORT_COLUMNS,
  type ImportColumn,
  type ImportRowError,
  type ImportSummary,
  type LonjaSource,
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
  /**
   * `products.lonja`. Texto libre, puede faltar.
   *
   * 034 — pasa a ser el VALOR POR DEFECTO de la lonja del precio, no su
   * autoridad. Si el fichero indica otra, manda el fichero.
   */
  lonja: string | null
  /**
   * `products.unit` tal cual: una expresión combinada del tipo «€/100 Kg».
   *
   * 034 — es la unidad CONFIGURADA de la referencia y la autoridad para validar
   * lo que traiga el fichero. Antes no se miraba, y por eso `€/100 Kg` salía
   * como «unidad no reconocida» aunque fuera exactamente lo que dice la ficha.
   */
  unit: string | null
}

export interface ValidationCatalog {
  /** Clave `marketSlug::productSlug`. Los slugs son únicos por mercado. */
  products: Map<string, CatalogProduct>
  /** Slugs de mercado existentes, para distinguir «mercado no existe» de «producto no existe». */
  marketSlugs: Set<string>
  /**
   * Claves naturales ya presentes en la base.
   *
   * 034 — incluyen la lonja. Ver `naturalKey`.
   */
  existingKeys: Set<string>
}

/**
 * La clave natural (034).
 *
 * ── Por qué la lonja forma parte de ella ───────────────────────────────────
 *
 * Porque una misma referencia cotiza el mismo día, en la misma moneda y en la
 * misma unidad, en España, Alemania, Bélgica, Italia y Europa. Con la clave
 * anterior —sin lonja— la segunda de esas cinco filas se marcaba como duplicada
 * y se descartaba: se perdían cuatro de cada cinco precios sin que el resumen
 * dijera que faltaba nada.
 *
 * ── Por qué la unidad se canoniza al comparar ──────────────────────────────
 *
 * El histórico guarda «Unidades», «unidad» y «unidades» para el MISMO producto
 * —65, 2 y 1 filas—, herencia de cargas anteriores. Comparando el texto crudo,
 * reimportar ese histórico no reconocería sus propios duplicados y crearía una
 * serie paralela. Se comparan las formas canónicas, así que las tres cuentan
 * como la misma unidad.
 *
 * El índice único de PostgreSQL sigue comparando el texto exacto: es un suelo,
 * no el techo. Esta comparación es más estricta, y es la que ve el usuario en la
 * vista previa.
 */
export function naturalKey(
  productId: string,
  recordedAt: string,
  currency: string,
  unit: string,
  lonja: string | null,
): string {
  const medida = canonicalMeasure(unit) ?? unit.trim().toLowerCase()
  return `${productId}|${recordedAt}|${currency}|${medida}|${normalizeLonjaKey(lonja)}`
}

/**
 * Forma de comparación de una lonja.
 *
 * Solo recorta, colapsa espacios y baja a minúsculas sin acentos. NO fusiona
 * nombres distintos: «España» y «Europa» son dos lonjas y lo seguirán siendo.
 * Lo único que se evita es que «  España » y «España» se traten como dos.
 */
export function normalizeLonjaKey(raw: string | null | undefined): string {
  return (raw ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

/**
 * Forma en que se GUARDA una lonja.
 *
 * Conserva mayúsculas y acentos —es un nombre propio— y solo limpia los
 * espacios. Normalizar más fusionaría «Lérida» y «Lleida», que son decisiones de
 * negocio, no de código.
 */
export function normalizeLonjaValue(raw: string | null | undefined): string | null {
  const limpio = (raw ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ')
  return limpio === '' ? null : limpio
}

// ── Normalizadores ──────────────────────────────────────────────────────────

function texto(raw: string | undefined): string {
  return (raw ?? '').trim().replace(/\s+/g, ' ')
}

/**
 * Convierte a número (034).
 *
 * Delega en `parseMoney`, que es el único sitio donde se decide qué es un
 * separador decimal y qué es uno de miles. Antes esta función rechazaba
 * cualquier valor con los dos separadores y también cualquier símbolo de
 * moneda, así que `1.285,50 €` —el formato con el que Excel guarda un precio en
 * España— era «no es un número válido».
 *
 * Se conserva la firma que devuelve `number | null` porque la usan los campos
 * numéricos opcionales, a los que no les interesa la moneda.
 */
export function parseDecimal(raw: string | undefined): number | null {
  const { value } = parseMoney(raw)
  return value
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

  // ── Lonja (034) ───────────────────────────────────────────────────────────
  //
  // Cambia por completo respecto a 2.5. Antes la lonja del fichero se VALIDABA
  // contra `products.lonja` y cualquier discrepancia era un error, así que un
  // boletín con precios de España, Alemania, Bélgica, Italia y Europa para la
  // misma referencia solo podía importar una de las cinco filas.
  //
  // Ahora la lonja pertenece al REGISTRO DE PRECIO, no al producto:
  //
  //   1. si el fichero la trae, manda el fichero;
  //   2. si no, se hereda la del producto;
  //   3. si no hay ninguna de las dos, es un error.
  //
  // El punto 3 es deliberado: sin lonja, dos precios del mismo producto y día no
  // se pueden distinguir, y la clave natural dejaría de proteger nada. Obligar a
  // decirlo cuesta una columna; no obligarlo cuesta una serie mezclada.
  //
  // `products.lonja` NO se toca nunca. Pasa a ser el valor por defecto de la
  // referencia, no la autoridad de su histórico.
  let lonja: string | null = null
  let lonjaSource: LonjaSource = null

  if (producto) {
    const delArchivo = normalizeLonjaValue(lonjaArchivo)
    const delProducto = normalizeLonjaValue(producto.lonja)

    if (delArchivo) {
      lonja = delArchivo
      lonjaSource = 'file'
    } else if (delProducto) {
      lonja = delProducto
      lonjaSource = 'product'
    } else {
      errors.push(error(
        'lonja',
        'Falta la lonja: ni el archivo la indica ni el producto la tiene configurada. ' +
        'Sin ella no se pueden distinguir dos precios del mismo día.',
      ))
    }
  }

  // ── Fecha (034) ───────────────────────────────────────────────────────────
  //
  // Se admiten `AAAA-MM-DD`, `DD/MM/AAAA` y el serial de Excel. La fecha se
  // NORMALIZA a `AAAA-MM-DD` para guardarla, pero no se corrige ni se desplaza:
  // una fila fuera del periodo sigue siendo un error de esa fila.
  const recordedAtRaw = texto(raw['recorded_at'])
  let recordedAt: string | null = null

  if (!recordedAtRaw) {
    errors.push(error('recorded_at', 'La fecha es obligatoria.'))
  } else {
    const fecha = parseImportDate(recordedAtRaw)
    if (!fecha.iso) {
      errors.push(error('recorded_at', `${fecha.error ?? `Fecha no válida: «${recordedAtRaw}»`}. Formatos admitidos: ${ACCEPTED_DATE_FORMATS}.`))
    } else {
      recordedAt = fecha.iso
      if (!isDateInPeriod(recordedAt, period)) {
        // NO se corrige la fecha. Se rechaza la fila.
        errors.push(
          error('recorded_at', `La fecha ${recordedAt} está fuera del periodo seleccionado (${period.from} a ${period.to}).`),
        )
      }
    }
  }

  // ── Precio (034) ──────────────────────────────────────────────────────────
  //
  // `parseMoney` admite símbolo delante o detrás, coma o punto decimal y
  // separador de miles, y devuelve además la moneda que viniera escrita dentro.
  const priceRaw = texto(raw['price'])
  const precio = parseMoney(priceRaw)
  const price = precio.value

  if (priceRaw === '') {
    errors.push(error('price', 'El precio es obligatorio.'))
  } else if (price === null) {
    errors.push(error('price', `El precio no es un número válido: ${precio.error ?? `«${priceRaw}»`}.`))
  } else if (price <= 0) {
    errors.push(error('price', `El precio debe ser mayor que 0 (recibido ${price}).`))
  }

  // ── Moneda y unidad (034) ─────────────────────────────────────────────────
  //
  // Aquí confluyen TRES fuentes que pueden decir la moneda:
  //
  //   · la columna `currency`            → «USD»
  //   · la columna `unit`, si es combinada → «€/100 Kg» lleva EUR dentro
  //   · el propio precio                 → «285,00 €»
  //
  // Cuando coinciden, no hay nada que decidir. Cuando NO coinciden, se devuelve
  // un error que las nombra todas. Elegir una en silencio es lo único que no se
  // puede hacer: guardaría una serie entera bajo la divisa equivocada y nadie lo
  // vería hasta comparar con la fuente original meses después.
  const currencyRaw = texto(raw['currency'])
  const unitRaw = texto(raw['unit'])

  const expresion = parseUnitExpression(unitRaw)
  const monedaColumna = currencyRaw ? parseCurrency(currencyRaw) : null

  if (currencyRaw && !monedaColumna) {
    errors.push(error('currency', `Moneda no reconocida: «${currencyRaw}». Admitidas: ${currencyHelpText()}.`))
  }
  if (unitRaw && expresion.error) {
    errors.push(error('unit', `${expresion.error}. Medidas admitidas: ${measureHelpText()}.`))
  }

  // Candidatas, con su procedencia, para poder explicar el conflicto.
  const candidatas: { valor: ImportCurrency; origen: string }[] = []
  if (monedaColumna) candidatas.push({ valor: monedaColumna, origen: 'la columna currency' })
  if (expresion.currency) candidatas.push({ valor: expresion.currency, origen: `la unidad «${unitRaw}»` })
  if (precio.currency) candidatas.push({ valor: precio.currency, origen: `el precio «${priceRaw}»` })

  const distintas = [...new Set(candidatas.map((c) => c.valor))]
  let currency: ImportCurrency | null = null

  if (distintas.length > 1) {
    errors.push(error(
      'currency',
      `Contradicción de moneda: ${candidatas.map((c) => `${c.origen} dice ${c.valor}`).join(', ')}. ` +
      'Corrige el archivo para que todas digan lo mismo.',
    ))
  } else if (distintas.length === 1) {
    currency = distintas[0]
  } else if (!currencyRaw) {
    errors.push(error('currency', `La moneda es obligatoria. Admitidas: ${currencyHelpText()}.`))
  }

  // ── Medida ────────────────────────────────────────────────────────────────
  //
  //   1. la del fichero, si la trae y se reconoce;
  //   2. si no, la configurada en `products.unit`;
  //   3. si no hay ninguna, error.
  //
  // Cuando el fichero trae una medida Y el producto tiene otra configurada, es
  // un ERROR, no una preferencia: un mismo producto no cotiza en «kg» y en
  // «100 kg» a la vez, y mezclarlas en la misma serie da un salto de ×100 en el
  // gráfico. Este es exactamente el caso que hacía fallar el fichero real:
  // el producto está configurado como «€/100 Kg» y el importador solo aceptaba
  // las medidas que ya estaban en el histórico.
  const configurada = parseUnitExpression(producto?.unit ?? null)
  let unit: string | null = null

  if (expresion.measure && configurada.measure && expresion.measure !== configurada.measure) {
    errors.push(error(
      'unit',
      `La unidad no coincide con la configurada para «${producto?.productName ?? productSlug}»: ` +
      `el archivo dice «${expresion.measure}» y la referencia está configurada en «${configurada.measure}» ` +
      `(${producto?.unit}). Corrige la columna o déjala vacía para heredar la de la referencia.`,
    ))
  } else if (expresion.measure) {
    unit = expresion.measure
  } else if (!unitRaw && configurada.measure) {
    // El fichero no trae unidad: se hereda la de la referencia.
    // El fichero no trae unidad: se hereda la de la referencia.
    unit = configurada.measure
  } else if (!unitRaw && !configurada.measure) {
    errors.push(error(
      'unit',
      `Falta la unidad: ni el archivo la indica ni la referencia la tiene configurada. Admitidas: ${measureHelpText()}.`,
    ))
  }

  // ── Lo que NO se comprueba, a propósito ───────────────────────────────────
  //
  // La moneda del fichero NO se valida contra la que lleva `products.unit`.
  //
  // Sería tentador —«€/100 Kg» dice euros— pero `products.unit` es una cadena de
  // presentación que ya ha demostrado quedarse desfasada: «Pollo Vivo» está
  // configurado como «€/100 Kg» y sus 90 precios históricos están guardados en
  // «kg». Convertir ese texto en autoridad sobre la moneda bloquearía
  // importaciones legítimas en USD o GBP por una configuración antigua.
  //
  // La MEDIDA sí se valida contra él, y la diferencia no es caprichosa:
  // equivocarse de moneda produce un número raro que salta a la vista;
  // equivocarse entre «kg» y «100 kg» produce una serie multiplicada por cien
  // que parece perfectamente normal.

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

  // ── País ──────────────────────────────────────────────────────────────────
  //
  // Solo se pasa a mayúsculas cuando es un código de dos letras: los 608
  // registros usan `ES` y `EU`, y ese es el formato de la columna. Un fichero
  // real llegó con «España», «Bélgica» y «República Checa», que en mayúsculas
  // quedarían como «ESPAÑA» y «REPÚBLICA CHECA» en los filtros.
  //
  // NO se traduce el nombre a código: eso exigiría una tabla de países y
  // decidir qué es «España UE». Se guarda lo que venga, tal cual se escribió.
  const countryRaw = texto(raw['country'])
  const country = countryRaw === ''
    ? 'ES'
    : countryRaw.length === 2 ? countryRaw.toUpperCase() : countryRaw
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
    lonja,
    lonjaSource,
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
  const key = naturalKey(base.productId!, base.recordedAt!, base.currency!, base.unit!, base.lonja)

  // El aviso sobre la lonja no es decorativo. En el fichero real que motivó
  // este bloque, 19 filas compartían producto, fecha, moneda, unidad y lonja
  // («Europa») y solo se distinguían por el país. Sin decirlo, quien lo suba ve
  // «18 duplicadas» y no tiene forma de adivinar qué columna cambiar.
  const PISTA_LONJA =
    ` Las columnas «country» y «region» NO distinguen la serie: no forman parte de la clave.` +
    ` Si lo que separa estas filas es el país o la plaza, escríbelo en la columna «lonja»` +
    ` en lugar de repetir «${base.lonja}» en todas.`

  if (catalog.existingKeys.has(key)) {
    return {
      ...base,
      status: 'duplicate',
      errors: [error(
        null,
        `Ya existe un precio guardado para este producto, fecha, moneda, unidad y lonja («${base.lonja}»).`,
      )],
    }
  }
  if (seenKeys.has(key)) {
    return {
      ...base,
      status: 'duplicate',
      errors: [error(
        null,
        `Otra fila de este archivo repite producto, fecha, moneda, unidad y lonja («${base.lonja}»).${PISTA_LONJA}`,
      )],
    }
  }

  seenKeys.add(key)
  return { ...base, status: 'valid', errors: [] }
}

/**
 * Segunda pasada: filas repetidas que además NO dicen lo mismo.
 *
 * ── Por qué hace falta ─────────────────────────────────────────────────────
 *
 * `validateRow` marca como duplicada la SEGUNDA aparición de una clave natural
 * y deja pasar la primera. Para una fila literalmente repetida eso es correcto:
 * el hecho es uno solo y da igual cuál de las dos lo represente.
 *
 * Pero el fichero real trae Polonia dos veces el mismo día, en la misma moneda
 * y unidad, con 199,98 y 245,25. Ahí quedarse con la primera es ELEGIR, y
 * elegir a ciegas entre dos precios distintos es exactamente lo que no puede
 * hacer un importador: guardaría un dato de mercado que nadie ha confirmado.
 *
 * Cuando los precios discrepan se marcan TODAS las filas de esa clave y no
 * entra ninguna. Quien sube el fichero decide cuál vale, o las separa por lonja.
 */
export function flagConflictingDuplicates(rows: NormalizedImportRow[]): NormalizedImportRow[] {
  const porClave = new Map<string, NormalizedImportRow[]>()

  for (const fila of rows) {
    if (fila.productId === null || fila.recordedAt === null || fila.currency === null || fila.unit === null) continue
    if (fila.status !== 'valid' && fila.status !== 'duplicate') continue
    const clave = naturalKey(fila.productId, fila.recordedAt, fila.currency, fila.unit, fila.lonja)
    const grupo = porClave.get(clave)
    if (grupo) grupo.push(fila)
    else porClave.set(clave, [fila])
  }

  const enConflicto = new Set<NormalizedImportRow>()
  for (const grupo of porClave.values()) {
    if (grupo.length < 2) continue
    const precios = new Set(grupo.map((f) => f.price))
    if (precios.size > 1) for (const fila of grupo) enConflicto.add(fila)
  }

  if (enConflicto.size === 0) return rows

  return rows.map((fila) => {
    if (!enConflicto.has(fila)) return fila
    return {
      ...fila,
      status: 'duplicate' as const,
      errors: [{
        column: null,
        message:
          `Este archivo trae ${
            [...new Set(rows.filter((f) => enConflicto.has(f) && f.lonja === fila.lonja).map((f) => f.price))].length
          } precios DISTINTOS para el mismo producto, fecha, moneda, unidad y lonja («${fila.lonja}»). ` +
          'No se importa ninguno: decide cuál es el bueno o separa las filas por lonja. ' +
          'Las columnas «country» y «region» no distinguen la serie.',
      }],
    }
  })
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

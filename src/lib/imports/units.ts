// Unidades de la importación de precios (034).
//
// Módulo PURO y CENTRAL.
//
// ═══════════════════════════════════════════════════════════════════════════
// EL PROBLEMA REAL, MEDIDO SOBRE LOS DATOS
// ═══════════════════════════════════════════════════════════════════════════
//
// El modelo guarda la unidad en DOS sitios que hablan idiomas distintos:
//
//   products.unit               22 valores, del tipo «€/100 Kg», «€/TN»,
//                               «$/BRT», «GBP/TN». Mezclan MONEDA y MEDIDA en
//                               una sola cadena. Es la CONFIGURACIÓN de la
//                               referencia y es lo que se ve en pantalla.
//
//   product_price_records.unit   6 valores: «ton», «kg», «MWh», «Unidades»,
//                               «unidad», «unidades». Solo la MEDIDA, sin
//                               moneda — que va en su propia columna.
//
// El importador validaba la unidad del fichero contra el segundo conjunto, así
// que `€/100 Kg` —que es exactamente lo que dice la ficha del producto— salía
// como «Unidad no reconocida». La unidad configurada para la referencia nunca
// entraba en la validación.
//
// ── El modelo que se adopta ────────────────────────────────────────────────
//
// `currency` y `unit` siguen separados en `product_price_records`, que es lo
// correcto y ya estaba bien:
//
//     currency = EUR        unit = 100 kg
//
// NO se guarda «€/100 Kg» entero en `unit`: habiendo una columna `currency`,
// meter la moneda dentro de la unidad duplica el dato y garantiza que algún día
// las dos digan cosas distintas.
//
// `products.unit` se sigue leyendo como lo que es: una expresión combinada que
// este módulo sabe PARTIR en moneda + medida. No se reescribe.

import { parseCurrency, type ImportCurrency } from './currency'

// ── Medidas canónicas ───────────────────────────────────────────────────────
//
// Cada medida tiene UNA forma canónica y varias formas admitidas al escribir.
// Las canónicas se eligen para coincidir con lo que YA hay guardado —«ton»,
// «kg», «MWh»— y así no partir las series históricas.

export const CANONICAL_MEASURES = [
  'kg',
  '100 kg',
  'ton',
  'MWh',
  'Unidades',
  '100 uds',
  '100 docenas',
  '100 libras',
  'l',
  '100 l',
  'hl',
  'oz',
  'cabeza',
  'BRT',
  '%',
] as const

export type CanonicalMeasure = (typeof CANONICAL_MEASURES)[number]

/**
 * Medidas que NO llevan moneda (037).
 *
 * ── El caso real ───────────────────────────────────────────────────────────
 *
 * El catálogo tiene ya 16 referencias que no son precios y llevan años sin
 * poder cargarse:
 *
 *   · 12 índices FAO —«Food Price Index», «Real Sugar Price»…— configurados
 *     como `unidad`: números adimensionales, base 100. No están en euros.
 *   ·  4 indicadores del INE —IPC, IPRI con y sin energía, tasa de paro—
 *     configurados como `%`.
 *
 * Con `currency` obligatoria había que inventarles una moneda, y una tarjeta
 * que dice «123,45 €» sobre el índice de precios de los alimentos es un dato
 * falso, no una aproximación.
 *
 * ── Por qué la canónica es «Unidades» y no «unidad» ────────────────────────
 *
 * Porque es lo que se lee en pantalla —«123,45 Unidades»— y porque el histórico
 * ya usaba esa grafía antes de que se borraran esas series. Las tres formas
 * (`unidad`, `unidades`, `Unidades`) siguen aceptándose al escribir: se
 * canonizan a la misma, así que una reimportación reconoce sus propios
 * duplicados. Ningún precio guardado usa hoy ninguna de las tres, de modo que
 * el cambio de canónica no parte ninguna serie existente.
 *
 * ── Lo que NO se hace ──────────────────────────────────────────────────────
 *
 * No se interpreta el `%` como una variación calculada. Es el VALOR importado
 * tal cual: si el boletín del INE dice 2,5, se guarda 2,5 y se enseña «2,5 %».
 * Nada se convierte, ni entre monedas ni entre bases.
 */
export const NON_MONETARY_MEASURES = ['%', 'Unidades'] as const

export type NonMonetaryMeasure = (typeof NON_MONETARY_MEASURES)[number]

/** ¿La medida describe una magnitud sin moneda? */
export function isNonMonetaryMeasure(
  measure: string | null | undefined,
): measure is NonMonetaryMeasure {
  return NON_MONETARY_MEASURES.some((m) => m === measure)
}

/** Lista legible de las no monetarias, para los mensajes de error. */
export function nonMonetaryHelpText(): string {
  return NON_MONETARY_MEASURES.join(' y ')
}

/**
 * Formas admitidas → forma canónica.
 *
 * Las claves están ya en minúsculas y con los espacios colapsados: la búsqueda
 * normaliza antes de mirar aquí.
 *
 * «unidad», «unidades» y «Unidades» apuntan todas a «Unidades» A PROPÓSITO. En
 * el histórico convivían las tres grafías para el MISMO producto —«Cereal Price
 * Index» llegó a tener 65 filas «Unidades», 2 «unidad» y 1 «unidades»—, y sin
 * unificarlas al comparar una reimportación no vería sus propios duplicados.
 *
 * 037 — la canónica pasa de «unidad» a «Unidades»: ver `NON_MONETARY_MEASURES`.
 * No hay ningún precio guardado con ninguna de las tres grafías, así que el
 * cambio no separa ninguna serie en dos.
 */
const MEASURE_ALIAS: ReadonlyMap<string, CanonicalMeasure> = new Map([
  ['kg', 'kg'], ['kilo', 'kg'], ['kilos', 'kg'], ['kilogramo', 'kg'], ['kilogramos', 'kg'],
  ['100 kg', '100 kg'], ['100 kilos', '100 kg'], ['100kg', '100 kg'],
  ['ton', 'ton'], ['tn', 'ton'], ['t', 'ton'], ['tonelada', 'ton'], ['toneladas', 'ton'],
  ['tonne', 'ton'], ['tonnes', 'ton'], ['tm', 'ton'],
  ['mwh', 'MWh'], ['mw/h', 'MWh'],
  ['unidad', 'Unidades'], ['unidades', 'Unidades'], ['ud', 'Unidades'], ['uds', 'Unidades'], ['u', 'Unidades'],
  ['indice', 'Unidades'], ['índice', 'Unidades'], ['index', 'Unidades'],
  ['100 uds', '100 uds'], ['100 ud', '100 uds'], ['100 unidades', '100 uds'],
  ['100 docenas', '100 docenas'], ['100 doc', '100 docenas'],
  ['100 libras', '100 libras'], ['100 lb', '100 libras'], ['100 lbs', '100 libras'],
  ['l', 'l'], ['litro', 'l'], ['litros', 'l'],
  ['100 l', '100 l'], ['100 litros', '100 l'],
  ['hl', 'hl'], ['hectolitro', 'hl'], ['hectolitros', 'hl'],
  ['oz', 'oz'], ['onza', 'oz'], ['onzas', 'oz'],
  ['cabeza', 'cabeza'], ['cabezas', 'cabeza'],
  ['brt', 'BRT'],
  ['%', '%'], ['porcentaje', '%'], ['percent', '%'], ['pct', '%'],
])

/**
 * Prepara un texto para buscarlo en la tabla de equivalencias.
 *
 * Separa el número de la letra —«100Kg» → «100 kg»— porque quien rellena a mano
 * lo escribe de las dos formas y ninguna es un error.
 */
export function measureKey(raw: string): string {
  return raw
    .normalize('NFKC')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/(\d)\s*([a-zA-Zµ%])/g, '$1 $2')
    .toLowerCase()
}

/** Medida canónica, o `null` si no se reconoce. */
export function canonicalMeasure(raw: string | undefined | null): CanonicalMeasure | null {
  const clave = measureKey(raw ?? '')
  if (clave === '') return null
  return MEASURE_ALIAS.get(clave) ?? null
}

/** Lista legible para los mensajes de error. */
export function measureHelpText(): string {
  return CANONICAL_MEASURES.join(', ')
}

// ── Expresiones combinadas ──────────────────────────────────────────────────

export interface UnitExpression {
  /** Moneda que venía DENTRO de la expresión, si la había. */
  currency: ImportCurrency | null
  /** Medida canónica. */
  measure: CanonicalMeasure | null
  /** Motivo por el que no se ha podido interpretar. */
  error?: string
}

/**
 * Interpreta lo que venga en la columna `unit` o en `products.unit`.
 *
 * Acepta las dos formas:
 *
 *   «100 kg»        → { currency: null, measure: '100 kg' }
 *   «€/100 Kg»      → { currency: 'EUR', measure: '100 kg' }
 *   «USD/100 kg»    → { currency: 'USD', measure: '100 kg' }
 *   «GBP/TN»        → { currency: 'GBP', measure: 'ton' }
 *
 * La moneda que salga de aquí es una PISTA, no una decisión: quien resuelve el
 * conflicto entre esta y la columna `currency` es el validador, que tiene las
 * dos delante.
 *
 * `c€/Kg` —céntimos de euro, 2 productos del catálogo— NO se acepta: no es
 * ninguna de las tres monedas admitidas y tratarlo como EUR multiplicaría el
 * precio por cien.
 */
export function parseUnitExpression(raw: string | undefined | null): UnitExpression {
  const texto = (raw ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ')
  if (texto === '') return { currency: null, measure: null }

  const barra = texto.indexOf('/')

  if (barra >= 0) {
    const izquierda = texto.slice(0, barra).trim()
    const derecha = texto.slice(barra + 1).trim()

    // «mw/h» es una medida con barra, no una moneda partida.
    const completa = canonicalMeasure(texto)
    if (completa) return { currency: null, measure: completa }

    const moneda = parseCurrency(izquierda)
    if (!moneda) {
      return {
        currency: null,
        measure: null,
        error: `no se reconoce la moneda «${izquierda}» de la unidad «${texto}»`,
      }
    }

    const medida = canonicalMeasure(derecha)
    if (!medida) {
      return {
        currency: moneda,
        measure: null,
        error: `no se reconoce la medida «${derecha}» de la unidad «${texto}»`,
      }
    }

    return { currency: moneda, measure: medida }
  }

  const medida = canonicalMeasure(texto)
  if (medida) return { currency: null, measure: medida }

  // Una moneda suelta en la columna de unidad no es una unidad.
  if (parseCurrency(texto)) {
    return {
      currency: parseCurrency(texto),
      measure: null,
      error: `«${texto}» es una moneda, no una unidad de medida`,
    }
  }

  return { currency: null, measure: null, error: `unidad no reconocida: «${texto}»` }
}

/**
 * Cómo se ENSEÑA una unidad: «€/100 kg», «%», «Unidades».
 *
 * Se construye a partir de las dos columnas, nunca se lee de un texto guardado.
 * Es lo que permite que un precio en USD se etiquete «$/ton» sin que nadie haya
 * escrito esa cadena en ninguna parte.
 *
 * 037 — con una medida no monetaria la moneda se ignora: un porcentaje se
 * enseña «%» aunque la fila traiga EUR.
 */
export function formatUnitLabel(currency: string | null, measure: string | null): string {
  if (isNonMonetaryMeasure(measure)) return measure
  const simbolo = currency === 'USD' ? '$' : currency === 'GBP' ? '£' : currency === 'EUR' ? '€' : (currency ?? '')
  if (!measure) return simbolo
  if (!simbolo) return measure
  return `${simbolo}/${measure}`
}

import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ── Formato numérico ────────────────────────────────────────────────────────
// Helpers compartidos para mostrar cifras con separador de miles y la medida
// al final (€/kg, €/TN, €/litro, unidades…). Pensados para dashboards y tablas.
// Nota: se usa 'de-DE' en lugar de 'es-ES' porque ambos comparten el mismo
// formato visual (punto miles, coma decimal) pero de-DE agrupa desde 1.000
// mientras que es-ES (CLDR) solo agrupa desde 10.000.

/** Número con separador de miles (1.303,56 — punto miles, coma decimal). */
export function formatNumber(value: number | null | undefined, decimals = 0): string {
  if (value == null || Number.isNaN(value)) return '—'
  return new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
}

// ── Indicadores monetarios y no monetarios (037) ────────────────────────────
//
// Market Intelligence deja de ser solo precios. Conviven tres tipos de valor y
// se distinguen ÚNICAMENTE por la unidad:
//
//   A. PRECIO      currency = EUR/USD/GBP   unit = «100 kg», «ton», «MWh»…
//   B. PORCENTAJE  currency = NULL          unit = «%»          → «2,5 %»
//   C. ÍNDICE      currency = NULL          unit = «Unidades»   → «123,45 Unidades»
//
// Un IPC no está en euros y un índice FAO tampoco. Guardar EUR en esas filas
// «porque la columna lo pedía» produce tarjetas que dicen «123,45 €» sobre un
// número que no es dinero, y eso es peor que no enseñar nada.

/** Unidades canónicas que NO llevan moneda. Ver `lib/imports/units.ts`. */
export const NON_MONETARY_UNITS = ['%', 'Unidades'] as const

/**
 * ¿Esta unidad describe una magnitud sin moneda?
 *
 * Se normaliza a minúsculas porque el histórico trae «Unidades», «unidades» y
 * «unidad» para lo mismo, herencia de cargas anteriores a la canonización.
 */
export function isNonMonetaryUnit(unit: string | null | undefined): boolean {
  const u = (unit ?? '').trim().toLowerCase()
  return u === '%' || u === 'unidades' || u === 'unidad' || u === 'ud' || u === 'uds'
}

/** Normaliza el código de unidad almacenado a su etiqueta de presentación. */
export function unitLabel(unit: string | null | undefined): string {
  if (!unit) return ''
  const u = unit.trim().toLowerCase()
  const MAP: Record<string, string> = {
    ton: 'TN', tn: 'TN', t: 'TN', tonelada: 'TN', toneladas: 'TN',
    l: 'litro', lt: 'litro', litro: 'litro', litros: 'litro',
    // 037 — todas las grafías del índice adimensional se enseñan «Unidades».
    ud: 'Unidades', uds: 'Unidades', unidad: 'Unidades', unidades: 'Unidades', unit: 'Unidades',
  }
  return MAP[u] ?? unit
}

/**
 * Símbolo de moneda a partir del código ISO (EUR → €).
 *
 * 037 — sin código devuelve CADENA VACÍA, no «€». Antes suponía euros, y esa
 * suposición es exactamente la que pinta un `€` sobre un porcentaje.
 */
export function currencySymbol(code: string | null | undefined): string {
  if (!code) return ''
  const MAP: Record<string, string> = { EUR: '€', USD: '$', GBP: '£' }
  return MAP[code.trim().toUpperCase()] ?? code
}

/**
 * Etiqueta de la magnitud, que es lo que va bajo la cifra en tarjetas y ejes.
 *
 *   EUR + «100 kg»   → «€/100 kg»
 *   USD + «ton»      → «$/TN»
 *   NULL + «%»       → «%»
 *   NULL + «Unidades»→ «Unidades»
 *
 * Se construye a partir de las DOS columnas; nunca se lee de un texto guardado.
 */
export function magnitudeLabel(
  currency: string | null | undefined,
  unit: string | null | undefined,
): string {
  const medida = unitLabel(unit)
  if (isNonMonetaryUnit(unit)) return medida
  const sym = currencySymbol(currency)
  if (!sym) return medida
  return medida ? `${sym}/${medida}` : sym
}

/**
 * Valor con separador de miles y su magnitud detrás.
 *
 *   «1.234,56 €/kg»   ·   «2,5 %»   ·   «123,45 Unidades»
 *
 * ── Sobre la moneda ────────────────────────────────────────────────────────
 *
 * El default sigue siendo `EUR` para no cambiar el resultado de las llamadas
 * que no la pasan. Un `null` EXPLÍCITO sí significa «sin moneda».
 *
 * Y cuando la unidad es no monetaria la moneda se IGNORA, venga como venga:
 * un `%` no se enseña en euros ni aunque la fila traiga EUR por error.
 */
export function formatPrice(
  value: number | null | undefined,
  opts: { unit?: string | null; currency?: string | null; decimals?: number } = {},
): string {
  const { unit, currency = 'EUR', decimals = 2 } = opts
  const num = formatNumber(value, decimals)
  if (num === '—') return num

  if (isNonMonetaryUnit(unit)) return `${num} ${unitLabel(unit)}`

  const sym = currencySymbol(currency)
  if (!sym) return unit ? `${num} ${unitLabel(unit)}` : num
  return unit ? `${num} ${sym}/${unitLabel(unit)}` : `${num} ${sym}`
}

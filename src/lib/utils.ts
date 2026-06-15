import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// ── Formato numérico (es-ES) ────────────────────────────────────────────────
// Helpers compartidos para mostrar cifras con separador de miles y la medida
// al final (€/kg, €/TN, €/litro, unidades…). Pensados para dashboards y tablas.

/** Número con separador de miles en formato es-ES (1.234,56). */
export function formatNumber(value: number | null | undefined, decimals = 0): string {
  if (value == null || Number.isNaN(value)) return '—'
  return new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
}

/** Normaliza el código de unidad almacenado a su etiqueta de presentación. */
export function unitLabel(unit: string | null | undefined): string {
  if (!unit) return ''
  const u = unit.trim().toLowerCase()
  const MAP: Record<string, string> = {
    ton: 'TN', tn: 'TN', t: 'TN', tonelada: 'TN', toneladas: 'TN',
    l: 'litro', lt: 'litro', litro: 'litro', litros: 'litro',
    ud: 'unidades', uds: 'unidades', unidad: 'unidades', unidades: 'unidades', unit: 'unidades',
  }
  return MAP[u] ?? unit
}

/** Símbolo de moneda a partir del código ISO (EUR → €). */
export function currencySymbol(code: string | null | undefined): string {
  if (!code) return '€'
  const MAP: Record<string, string> = { EUR: '€', USD: '$', GBP: '£' }
  return MAP[code.trim().toUpperCase()] ?? code
}

/** Precio con separador de miles + sufijo de medida (ej. "1.234,56 €/kg"). */
export function formatPrice(
  value: number | null | undefined,
  opts: { unit?: string | null; currency?: string | null; decimals?: number } = {},
): string {
  const { unit, currency = 'EUR', decimals = 2 } = opts
  const num = formatNumber(value, decimals)
  if (num === '—') return num
  const sym = currencySymbol(currency)
  return unit ? `${num} ${sym}/${unitLabel(unit)}` : `${num} ${sym}`
}

import { Hash, TrendingDown, TrendingUp, Coins, Calendar, Package } from 'lucide-react'
import { MiraKpiCard } from '@/components/mira/MiraKpiCard'
import { formatNumber, formatPrice, unitLabel } from '@/lib/utils'
import type { PriceInsights } from '@/lib/actions/prices'

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
}

// Formatea un valor de precio: con símbolo/unidad si la muestra es homogénea
// (mismo unit + currency en todos los registros), o como número plano si no lo
// es (mostrar un símbolo de moneda fijo sería engañoso con monedas mixtas).
function formatMaybeMixedPrice(value: number | null, unit: string | null, currency: string | null): string {
  if (value == null) return '—'
  if (unit != null && currency != null) return formatPrice(value, { unit, currency })
  return formatNumber(value, 2)
}

/** Resumen de precios (PR3.2): KPIs sobre el conjunto filtrado actual. Reutilizable en cliente y admin. */
export function PriceSummaryCards({ insights }: { insights: PriceInsights }) {
  const homogeneous = insights.unit != null && insights.currency != null

  // Aviso sobre los valores que SÍ dependen de la muestra acotada (mín/máx/prom):
  // "Registros" siempre es el total exacto (no limitado por la cota) y "Última
  // fecha" también es exacta (viene ordenada DESC), así que no lo necesitan.
  const sampleCaveats: string[] = []
  if (insights.capped) sampleCaveats.push(`sobre los ${formatNumber(insights.sampleSize)} más recientes`)
  if (!homogeneous) sampleCaveats.push('unidad/moneda mixtas')
  const sampleCaveat = sampleCaveats.length ? sampleCaveats.join(' · ') : undefined

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <MiraKpiCard
        label="Registros"
        value={insights.count}
        sublabel="coinciden con los filtros"
        icon={Hash}
        tint="magenta"
      />
      <MiraKpiCard
        label="Mínimo"
        value={formatMaybeMixedPrice(insights.min, insights.unit, insights.currency)}
        sublabel={sampleCaveat}
        icon={TrendingDown}
        tint="emerald"
      />
      <MiraKpiCard
        label="Máximo"
        value={formatMaybeMixedPrice(insights.max, insights.unit, insights.currency)}
        sublabel={sampleCaveat}
        icon={TrendingUp}
        tint="amber"
      />
      <MiraKpiCard
        label="Promedio"
        value={formatMaybeMixedPrice(insights.avg, insights.unit, insights.currency)}
        sublabel={sampleCaveat}
        icon={Coins}
        tint="violet"
      />
      <MiraKpiCard
        label="Última fecha"
        value={insights.lastDate ? formatDate(insights.lastDate) : '—'}
        sublabel={insights.capped ? 'exacta, no afectada por la muestra' : undefined}
        icon={Calendar}
        tint="cyan"
      />
      <MiraKpiCard
        label="Unidad · Moneda"
        value={`${insights.unit ? unitLabel(insights.unit) : 'Varias'} · ${insights.currency ?? 'Varias'}`}
        icon={Package}
        tint="blue"
      />
    </div>
  )
}

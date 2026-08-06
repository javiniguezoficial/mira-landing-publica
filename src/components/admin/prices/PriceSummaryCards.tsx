import { Hash, TrendingDown, TrendingUp, Coins, Calendar, Package } from 'lucide-react'
import { MiraKpiCard } from '@/components/mira/MiraKpiCard'
import { formatChartDateLong } from '@/lib/markets/chart-dates'
import { formatNumber, formatPrice, magnitudeLabel } from '@/lib/utils'
import type { PriceInsights } from '@/lib/actions/prices'

// 037 — fecha civil, sin pasar por UTC. Ver `lib/markets/chart-dates.ts`.
function formatDate(d: string) {
  return formatChartDateLong(d)
}

// Formatea un valor: con su magnitud si la muestra es homogénea (misma unidad y
// misma moneda en todos los registros), o como número plano si no lo es —
// enseñar un símbolo fijo sería engañoso con monedas mezcladas.
//
// 037 — la homogeneidad ya no se deduce de «currency != null». Una muestra
// entera de índices tiene la moneda a NULL y es perfectamente homogénea; lo que
// la rompe es que haya VARIAS, y eso lo dicen `mixedUnit` y `mixedCurrency`.
function formatMaybeMixedPrice(
  value: number | null,
  unit: string | null,
  currency: string | null,
  homogeneous: boolean,
): string {
  if (value == null) return '—'
  if (homogeneous) return formatPrice(value, { unit, currency })
  return formatNumber(value, 2)
}

/** Resumen de precios (PR3.2): KPIs sobre el conjunto filtrado actual. Reutilizable en cliente y admin. */
export function PriceSummaryCards({ insights }: { insights: PriceInsights }) {
  const homogeneous = !insights.mixedUnit && !insights.mixedCurrency && insights.unit != null

  // Aviso sobre los valores que SÍ dependen de la muestra acotada (mín/máx/prom):
  // "Registros" siempre es el total exacto (no limitado por la cota) y "Última
  // fecha" también es exacta (viene ordenada DESC), así que no lo necesitan.
  const sampleCaveats: string[] = []
  if (insights.capped) sampleCaveats.push(`sobre los ${formatNumber(insights.sampleSize)} más recientes`)
  if (!homogeneous) sampleCaveats.push('magnitudes mixtas')
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
        value={formatMaybeMixedPrice(insights.min, insights.unit, insights.currency, homogeneous)}
        sublabel={sampleCaveat}
        icon={TrendingDown}
        tint="emerald"
      />
      <MiraKpiCard
        label="Máximo"
        value={formatMaybeMixedPrice(insights.max, insights.unit, insights.currency, homogeneous)}
        sublabel={sampleCaveat}
        icon={TrendingUp}
        tint="amber"
      />
      <MiraKpiCard
        label="Promedio"
        value={formatMaybeMixedPrice(insights.avg, insights.unit, insights.currency, homogeneous)}
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
        label="Magnitud"
        // 037 — una sola tarjeta con la magnitud completa: «€/100 kg», «%»,
        // «Unidades». La anterior decía «Unidad · Moneda» y con un índice
        // habría escrito «Unidades · Varias», que es falso: no hay ninguna.
        value={
          insights.mixedUnit || insights.mixedCurrency
            ? 'Varias'
            : magnitudeLabel(insights.currency, insights.unit) || '—'
        }
        icon={Package}
        tint="blue"
      />
    </div>
  )
}

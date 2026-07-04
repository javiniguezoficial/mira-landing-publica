'use client'

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts'
import { formatPrice, currencySymbol } from '@/lib/utils'
import type { PriceSeriesPoint } from '@/lib/actions/prices'

interface Props {
  series: PriceSeriesPoint[]
  unit: string | null
  currency: string | null
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
}

interface TooltipProps {
  active?: boolean
  payload?: { value: number }[]
  label?: string
  unit: string | null
  currency: string | null
}

function CustomTooltip({ active, payload, label, unit, currency }: TooltipProps) {
  if (!active || !payload?.length || !label) return null
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-bold text-slate-700">{formatDate(label)}</p>
      <p className="font-bold text-mira-magenta">
        {formatPrice(payload[0].value, { unit: unit ?? undefined, currency: currency ?? undefined })}
      </p>
    </div>
  )
}

/** Evolución de precio promedio por día (PR3.2), a partir de los filtros actuales. */
export function PriceEvolutionChart({ series, unit, currency }: Props) {
  // Con varias unidades/monedas en el resultado, promediar por día mezclaría
  // escalas no comparables (p. ej. €/kg con €/MWh) y daría una tendencia sin
  // sentido. Mejor pedir un filtro más específico que dibujar un gráfico engañoso.
  if (unit == null || currency == null) {
    return (
      <div className="flex h-48 items-center justify-center px-6 text-center text-sm text-slate-400">
        Hay varias unidades o monedas en el resultado actual. Aplica un filtro más específico (mercado, lonja, unidad…) para ver la evolución de precios.
      </div>
    )
  }

  if (series.length < 2) {
    return (
      <div className="flex h-48 items-center justify-center px-6 text-center text-sm text-slate-400">
        {series.length === 0
          ? 'Sin datos para mostrar evolución de precios.'
          : 'No hay suficientes datos para mostrar la evolución de precios.'}
      </div>
    )
  }

  const step = Math.max(1, Math.ceil(series.length / 10))

  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={series} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis
          dataKey="date"
          tickFormatter={formatDate}
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          interval={step - 1}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => `${v.toLocaleString('es-ES')}${currency ? ` ${currencySymbol(currency)}` : ''}`}
          width={70}
        />
        <Tooltip content={<CustomTooltip unit={unit} currency={currency} />} />
        <Line
          type="monotone"
          dataKey="avgPrice"
          stroke="#7C3AED"
          strokeWidth={2}
          dot={series.length <= 30}
          activeDot={{ r: 4, fill: '#7C3AED' }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

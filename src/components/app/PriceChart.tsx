'use client'

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts'
import type { PricePoint } from '@/lib/queries/prices'
import {
  formatChartDate,
  formatChartDateLong,
  spansMultipleYears,
} from '@/lib/markets/chart-dates'
import { formatPrice, magnitudeLabel } from '@/lib/utils'

interface Props {
  data: PricePoint[]
  unit: string
  /** 037 — `null` en indicadores no monetarios (`%`, `Unidades`). */
  currency: string | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label, currency, unit }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-xs">
      {/* El tooltip lleva SIEMPRE el año, incluso en periodos cortos: es el
          punto concreto que se está señalando y no cuesta espacio. */}
      <p className="font-bold text-slate-700 mb-1">{formatChartDateLong(label)}</p>
      <p className="text-mira-magenta font-bold">
        {formatPrice(payload[0].value, { unit, currency })}
      </p>
      {payload[1] && (
        <p className="text-slate-400">
          Mín: {formatPrice(payload[1].value, { unit, currency })}
        </p>
      )}
      {payload[2] && (
        <p className="text-slate-400">
          Máx: {formatPrice(payload[2].value, { unit, currency })}
        </p>
      )}
    </div>
  )
}

export function PriceChart({ data, unit, currency }: Props) {
  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-48 text-slate-400 text-sm">
        Sin datos para mostrar
      </div>
    )
  }

  // ── El año en el eje X (037) ──────────────────────────────────────────────
  //
  // El eje escribía `15 may.` siempre. Con `3Y`, `ALL` o un rango a medida
  // multianual eso significa que el 15 de mayo de 2024, el de 2025 y el de 2026
  // se leen igual: la serie parece repetir fechas.
  //
  // La decisión se toma sobre los DATOS, no sobre el periodo pedido: lo que
  // importa es si lo dibujado cruza un año, y un `Y` que va de diciembre a enero
  // también lo cruza. En una serie de un solo año el año se omite para no
  // saturar el eje, y el tooltip lo lleva de todas formas.
  const conAnio = spansMultipleYears(data.map((p) => p.recorded_at))

  // Mostrar ~10 etiquetas de eje X para no saturar. Con el año delante cada
  // etiqueta es más ancha, así que se reservan menos.
  const step = Math.max(1, Math.ceil(data.length / (conAnio ? 7 : 10)))

  const sufijo = magnitudeLabel(currency, unit)

  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
        <defs>
          <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor="#7C3AED" stopOpacity={0.15} />
            <stop offset="95%" stopColor="#7C3AED" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
        <XAxis
          dataKey="recorded_at"
          tickFormatter={(v: string) => formatChartDate(v, conAnio)}
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          interval={step - 1}
          axisLine={false}
          tickLine={false}
          minTickGap={conAnio ? 24 : 8}
        />
        <YAxis
          tick={{ fontSize: 11, fill: '#94a3b8' }}
          axisLine={false}
          tickLine={false}
          tickFormatter={v => v.toLocaleString('es-ES')}
          width={60}
          label={undefined}
          aria-label={sufijo}
        />
        <Tooltip content={<CustomTooltip currency={currency} unit={unit} />} />
        <Area
          type="monotone"
          dataKey="price"
          stroke="#7C3AED"
          strokeWidth={2}
          fill="url(#priceGradient)"
          dot={false}
          activeDot={{ r: 4, fill: '#7C3AED' }}
        />
        <Area
          type="monotone"
          dataKey="min_price"
          stroke="#c4b5fd"
          strokeWidth={1}
          strokeDasharray="3 3"
          fill="none"
          dot={false}
        />
        <Area
          type="monotone"
          dataKey="max_price"
          stroke="#c4b5fd"
          strokeWidth={1}
          strokeDasharray="3 3"
          fill="none"
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}

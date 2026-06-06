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

interface Props {
  data: PricePoint[]
  unit: string
  currency: string
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })
}

function formatPrice(value: number, currency: string) {
  return new Intl.NumberFormat('es-ES', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(value) + ' ' + currency
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label, currency, unit }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-bold text-slate-700 mb-1">{formatDate(label)}</p>
      <p className="text-mira-magenta font-bold">
        {formatPrice(payload[0].value, currency)} / {unit}
      </p>
      {payload[1] && (
        <p className="text-slate-400">Mín: {formatPrice(payload[1].value, currency)}</p>
      )}
      {payload[2] && (
        <p className="text-slate-400">Máx: {formatPrice(payload[2].value, currency)}</p>
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

  // Mostrar solo ~30 etiquetas de eje X para no saturar
  const step = Math.ceil(data.length / 10)

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
          tickFormatter={v => v.toLocaleString('es-ES')}
          width={60}
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

'use client'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { MiraTooltip } from './MiraTooltip'

interface Props {
  data: { label: string; value: number }[]
  unit?: string
  height?: number
  color?: string
}

export function MiraAreaChart({ data, unit = '', height = 280, color = '#D6006E' }: Props) {
  if (!data.length) {
    return (
      <div className="flex items-center justify-center text-sm text-slate-400" style={{ height }}>
        Sin datos
      </div>
    )
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="miraAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="#F1ECF7" />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
        <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} allowDecimals={false} width={40} />
        <Tooltip content={<MiraTooltip unit={unit} />} cursor={{ stroke: color, strokeOpacity: 0.2, strokeWidth: 1 }} />
        <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2.5} fill="url(#miraAreaGrad)" dot={false} activeDot={{ r: 5, fill: color, stroke: '#fff', strokeWidth: 2 }} />
      </AreaChart>
    </ResponsiveContainer>
  )
}

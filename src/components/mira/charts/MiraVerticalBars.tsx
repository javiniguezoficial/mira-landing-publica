'use client'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'
import { MiraTooltip } from './MiraTooltip'

interface Props {
  data: { label: string; value: number; color?: string }[]
  unit?: string
  height?: number
}

export function MiraVerticalBars({ data, unit = '', height = 280 }: Props) {
  if (!data.length) {
    return (
      <div className="flex items-center justify-center text-sm text-slate-400" style={{ height }}>
        Sin datos
      </div>
    )
  }
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} barSize={44} margin={{ top: 12, right: 8, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="miraBarGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#D6006E" />
            <stop offset="100%" stopColor="#9B6DD6" />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} stroke="#F1ECF7" />
        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748B', fontWeight: 600 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: '#94A3B8' }} axisLine={false} tickLine={false} allowDecimals={false} width={36} />
        <Tooltip content={<MiraTooltip unit={unit} />} cursor={{ fill: '#D6006E', opacity: 0.04 }} />
        <Bar dataKey="value" radius={[10, 10, 0, 0]}>
          {data.map((d, i) => <Cell key={i} fill={d.color ?? 'url(#miraBarGrad)'} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}

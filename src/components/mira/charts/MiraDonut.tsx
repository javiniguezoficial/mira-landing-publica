'use client'
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { MiraTooltip } from './MiraTooltip'

export interface DonutDatum { label: string; value: number; color: string; key?: string }

interface Props {
  data: DonutDatum[]
  /** texto bajo el número central (ej: "RFQs", "total") */
  unit?: string
  /** etiqueta destacada en el centro en vez del total numérico */
  centerLabel?: string
  height?: number
}

export function MiraDonut({ data, unit = 'total', centerLabel, height = 200 }: Props) {
  if (!data.length) {
    return (
      <div className="flex items-center justify-center text-sm text-slate-400" style={{ height }}>
        Sin datos
      </div>
    )
  }
  const total = data.reduce((s, d) => s + d.value, 0)

  return (
    <div>
      <div className="relative">
        <ResponsiveContainer width="100%" height={height}>
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={height * 0.32}
              outerRadius={height * 0.46}
              paddingAngle={3}
              dataKey="value"
              nameKey="label"
              strokeWidth={0}
            >
              {data.map((d, i) => <Cell key={i} fill={d.color} />)}
            </Pie>
            <Tooltip content={<MiraTooltip unit={unit} />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          {centerLabel ? (
            <>
              <span className="text-lg font-black leading-none text-mira-ink">{centerLabel}</span>
              <span className="mt-1 text-[11px] font-medium text-slate-400">{unit}</span>
            </>
          ) : (
            <>
              <span className="text-3xl font-black leading-none text-mira-ink">{total}</span>
              <span className="mt-1 text-[11px] font-medium text-slate-400">{unit}</span>
            </>
          )}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1.5">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: d.color }} />
            <span className="text-xs text-slate-500">
              {d.label} <strong className="text-mira-ink">{d.value}</strong>
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

'use client'

import { formatNumber } from '@/lib/utils'

interface Props {
  data: { label: string; value: number; sublabel?: string }[]
  unit?: string
  /** decimales en el valor mostrado */
  decimals?: number
}

/** Barras horizontales tipo "Comparativa de mercados" — gradiente magenta→púrpura. */
export function MiraRankBars({ data, unit = '', decimals = 0 }: Props) {
  if (!data.length) {
    return <p className="py-6 text-center text-sm text-slate-400">Sin datos</p>
  }
  const max = Math.max(...data.map(d => d.value)) || 1

  return (
    <div className="space-y-3.5">
      {data.map((d, i) => {
        const unitDisplay = d.sublabel ?? unit
        return (
          <div key={i} className="flex items-center gap-3">
            <span className="w-24 shrink-0 truncate text-xs font-semibold text-slate-600">{d.label}</span>
            <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-mira-canvas">
              <div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{
                  width: `${Math.max((d.value / max) * 100, 4)}%`,
                  background: 'linear-gradient(90deg, #D6006E 0%, #9B6DD6 100%)',
                }}
              />
            </div>
            <span className="w-20 shrink-0 text-right text-sm font-black text-mira-ink">
              {formatNumber(d.value, decimals)}
              {unitDisplay && <span className="ml-0.5 text-[10px] font-medium text-slate-400">{unitDisplay}</span>}
            </span>
          </div>
        )
      })}
    </div>
  )
}

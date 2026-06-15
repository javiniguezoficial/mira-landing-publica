'use client'

import { formatNumber } from '@/lib/utils'

interface MiraTooltipProps {
  active?: boolean
  payload?: any[]
  label?: string
  unit?: string
  /** muestra el nombre de cada serie (multi-serie) en lugar de una sola fila */
  multi?: boolean
}

/** Tooltip premium compartido por todos los gráficos MIRA */
export function MiraTooltip({ active, payload, label, unit, multi }: MiraTooltipProps) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-mira-line bg-white px-3.5 py-2.5 shadow-xl shadow-mira-ink/10">
      {label && <p className="mb-1.5 text-[11px] font-semibold text-slate-400">{label}</p>}
      <div className="space-y-1">
        {payload.map((p, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: p.color ?? p.payload?.fill ?? '#D6006E' }} />
            {multi && <span className="text-xs text-slate-500">{p.name}</span>}
            <span className="ml-auto text-sm font-bold text-mira-ink">
              {typeof p.value === 'number' ? formatNumber(p.value) : p.value}
              {unit && <span className="ml-1 text-[11px] font-medium text-slate-400">{unit}</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

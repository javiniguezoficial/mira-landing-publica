import { type LucideIcon } from 'lucide-react'
import { cn, formatNumber } from '@/lib/utils'

export type KpiTint = 'magenta' | 'purple' | 'violet' | 'emerald' | 'amber' | 'cyan' | 'blue' | 'pink'

const TINTS: Record<KpiTint, { bg: string; fg: string }> = {
  magenta: { bg: 'bg-mira-magenta-soft', fg: 'text-mira-magenta' },
  purple:  { bg: 'bg-purple-100',        fg: 'text-purple-600' },
  violet:  { bg: 'bg-violet-100',        fg: 'text-violet-600' },
  emerald: { bg: 'bg-emerald-100',       fg: 'text-emerald-600' },
  amber:   { bg: 'bg-amber-100',         fg: 'text-amber-600' },
  cyan:    { bg: 'bg-cyan-100',          fg: 'text-cyan-600' },
  blue:    { bg: 'bg-blue-100',          fg: 'text-blue-600' },
  pink:    { bg: 'bg-pink-100',          fg: 'text-pink-600' },
}

interface Props {
  label: string
  value: string | number
  sublabel?: string
  icon: LucideIcon
  tint?: KpiTint
  delta?: { value: string; up: boolean }
  href?: string
}

export function MiraKpiCard({ label, value, sublabel, icon: Icon, tint = 'magenta', delta, href }: Props) {
  const t = TINTS[tint]
  const inner = (
    <div className={cn(
      'mira-card group relative flex items-start gap-3.5 rounded-2xl p-4 transition-all duration-200',
      href && 'cursor-pointer hover:-translate-y-0.5 hover:shadow-lg hover:shadow-mira-ink/10'
    )}>
      <div className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', t.bg)}>
        <Icon size={20} className={t.fg} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-slate-500">{label}</p>
        <div className="mt-0.5 flex items-baseline gap-2">
          <span className="text-2xl font-black leading-none tracking-tight text-mira-ink">
            {typeof value === 'number' ? formatNumber(value) : value}
          </span>
          {delta && (
            <span className={cn('text-[11px] font-bold', delta.up ? 'text-emerald-600' : 'text-red-500')}>
              {delta.up ? '↑' : '↓'} {delta.value}
            </span>
          )}
        </div>
        {sublabel && <p className="mt-1 truncate text-[11px] text-slate-400">{sublabel}</p>}
      </div>
    </div>
  )
  if (href) return <a href={href} className="block">{inner}</a>
  return inner
}

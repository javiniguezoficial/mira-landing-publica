import { type LucideIcon, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  title: string
  subtitle?: string
  icon?: LucideIcon
  iconTint?: string
  action?: { label: string; href: string }
  className?: string
  children: React.ReactNode
}

/** Contenedor de gráfico premium: header consistente + cuerpo. */
export function MiraChartCard({ title, subtitle, icon: Icon, iconTint = 'bg-mira-magenta-soft text-mira-magenta', action, className, children }: Props) {
  return (
    <div className={cn('mira-card rounded-2xl p-5', className)}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          {Icon && (
            <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl', iconTint)}>
              <Icon size={16} />
            </div>
          )}
          <div>
            <h2 className="text-[15px] font-black text-mira-ink">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-slate-400">{subtitle}</p>}
          </div>
        </div>
        {action && (
          <a href={action.href} className="flex shrink-0 items-center gap-1 text-xs font-bold text-mira-magenta hover:underline">
            {action.label} <ArrowRight size={12} />
          </a>
        )}
      </div>
      {children}
    </div>
  )
}

import { type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  icon: LucideIcon
  title: string
  subtitle?: string
  actions?: React.ReactNode
  className?: string
}

/** Header de sección: icono magenta + título grande + subtítulo + acciones. */
export function MiraPageHeader({ icon: Icon, title, subtitle, actions, className }: Props) {
  return (
    <div className={cn('flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between', className)}>
      <div className="flex items-center gap-3.5">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-mira-magenta to-mira-magenta-deep shadow-lg shadow-mira-magenta/30">
          <Icon size={22} className="text-white" />
        </div>
        <div>
          <h1 className="text-xl font-black tracking-tight text-mira-ink md:text-2xl">{title}</h1>
          {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}

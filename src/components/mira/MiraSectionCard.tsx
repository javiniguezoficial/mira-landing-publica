import { type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  title: string
  icon?: LucideIcon
  iconTint?: string
  action?: { label: string; href: string }
  className?: string
  bodyClassName?: string
  children: React.ReactNode
}

/** Card de sección (listas, actividad reciente) con header y cuerpo. */
export function MiraSectionCard({ title, icon: Icon, iconTint = 'bg-mira-magenta-soft text-mira-magenta', action, className, bodyClassName, children }: Props) {
  return (
    <div className={cn('mira-card overflow-hidden rounded-2xl', className)}>
      <div className="flex items-center justify-between border-b border-mira-line px-5 py-3.5">
        <div className="flex items-center gap-2">
          {Icon && (
            <div className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', iconTint)}>
              <Icon size={14} />
            </div>
          )}
          <h2 className="text-sm font-black text-mira-ink">{title}</h2>
        </div>
        {action && (
          <a href={action.href} className="text-xs font-bold text-mira-magenta hover:underline">{action.label}</a>
        )}
      </div>
      <div className={bodyClassName}>{children}</div>
    </div>
  )
}

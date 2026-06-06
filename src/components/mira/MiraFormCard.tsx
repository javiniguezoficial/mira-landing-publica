import { type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface FormCardProps {
  title?: string
  subtitle?: string
  icon?: LucideIcon
  className?: string
  children: React.ReactNode
  /** acciones del pie (botones) */
  footer?: React.ReactNode
}

/** Contenedor de formulario premium con header opcional y footer de acciones. */
export function MiraFormCard({ title, subtitle, icon: Icon, className, children, footer }: FormCardProps) {
  return (
    <div className={cn('mira-card rounded-2xl', className)}>
      {(title || Icon) && (
        <div className="flex items-center gap-2.5 border-b border-mira-line px-5 py-4 sm:px-6">
          {Icon && (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-mira-magenta-soft">
              <Icon size={16} className="text-mira-magenta" />
            </div>
          )}
          <div>
            {title && <h2 className="text-sm font-black text-mira-ink">{title}</h2>}
            {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
          </div>
        </div>
      )}
      <div className="p-5 sm:p-6">{children}</div>
      {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-t border-mira-line px-5 py-4 sm:px-6">{footer}</div>}
    </div>
  )
}

/** Sección dentro de un formulario para agrupar campos. */
export function MiraFormSection({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      {title && <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">{title}</h3>}
      {children}
    </div>
  )
}

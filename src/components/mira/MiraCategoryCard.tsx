import { cn } from '@/lib/utils'

interface Props {
  /** emoji o icono de la categoría */
  emoji?: string
  name: string
  description?: string | null
  /** texto a la derecha del header (ej: "3 mercados") */
  meta?: string
  /** acciones a la derecha (toggle, editar) */
  actions?: React.ReactNode
  className?: string
  children?: React.ReactNode
}

/** Card visual de categoría con icono grande — base de market-intelligent y admin/mercados. */
export function MiraCategoryCard({ emoji = '📦', name, description, meta, actions, className, children }: Props) {
  return (
    <div className={cn('mira-card overflow-hidden rounded-2xl', className)}>
      <div className="flex items-center gap-3.5 border-b border-mira-line bg-gradient-to-r from-mira-magenta-soft/50 to-transparent px-5 py-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white text-2xl shadow-sm">
          {emoji}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-black text-mira-ink">{name}</h2>
          {description && <p className="truncate text-xs text-slate-500">{description}</p>}
        </div>
        {meta && <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-slate-500 shadow-sm">{meta}</span>}
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
      {children}
    </div>
  )
}

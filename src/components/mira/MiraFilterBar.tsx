import { cn } from '@/lib/utils'

interface Props {
  className?: string
  children: React.ReactNode
}

/** Contenedor premium para barras de filtros/búsqueda. */
export function MiraFilterBar({ className, children }: Props) {
  return (
    <div className={cn('mira-card rounded-2xl p-4', className)}>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">{children}</div>
    </div>
  )
}

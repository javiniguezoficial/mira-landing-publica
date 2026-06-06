import { cn } from '@/lib/utils'

interface MiraTableProps {
  headers: (string | { label: string; align?: 'left' | 'right' | 'center' })[]
  className?: string
  children: React.ReactNode
}

/** Tabla premium MIRA: header limpio, scroll horizontal en móvil. Usa <MiraTr>/<MiraTd> para las filas. */
export function MiraTable({ headers, className, children }: MiraTableProps) {
  return (
    <div className={cn('mira-card overflow-hidden rounded-2xl', className)}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-mira-line bg-mira-canvas/60">
              {headers.map((h, i) => {
                const label = typeof h === 'string' ? h : h.label
                const align = typeof h === 'string' ? 'left' : h.align ?? 'left'
                return (
                  <th
                    key={i}
                    className={cn(
                      'whitespace-nowrap px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500',
                      align === 'right' && 'text-right',
                      align === 'center' && 'text-center',
                      align === 'left' && 'text-left',
                    )}
                  >
                    {label}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-mira-line">{children}</tbody>
        </table>
      </div>
    </div>
  )
}

export function MiraTr({ children, className }: { children: React.ReactNode; className?: string }) {
  return <tr className={cn('transition-colors hover:bg-mira-canvas/70', className)}>{children}</tr>
}

export function MiraTd({
  children,
  align = 'left',
  className,
}: {
  children: React.ReactNode
  align?: 'left' | 'right' | 'center'
  className?: string
}) {
  return (
    <td
      className={cn(
        'whitespace-nowrap px-4 py-3 text-slate-700',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className,
      )}
    >
      {children}
    </td>
  )
}

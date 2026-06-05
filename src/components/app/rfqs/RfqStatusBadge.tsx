import { cn } from '@/lib/utils'
import type { RfqStatus } from '@/lib/actions/rfqs'

const CONFIG: Record<RfqStatus, { label: string; className: string }> = {
  draft:     { label: 'Borrador',  className: 'bg-slate-100 text-slate-600 border-slate-200' },
  open:      { label: 'Abierta',   className: 'bg-blue-50 text-blue-700 border-blue-200' },
  closed:    { label: 'Cerrada',   className: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  awarded:   { label: 'Adjudicada',className: 'bg-green-50 text-green-700 border-green-200' },
  cancelled: { label: 'Cancelada', className: 'bg-red-50 text-red-500 border-red-200' },
}

export function RfqStatusBadge({ status }: { status: RfqStatus }) {
  const { label, className } = CONFIG[status] ?? CONFIG.draft
  return (
    <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border', className)}>
      {label}
    </span>
  )
}

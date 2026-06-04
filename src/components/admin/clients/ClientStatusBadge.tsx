import { cn } from '@/lib/utils'
import type { SubscriptionStatus } from '@/lib/actions/organizations'

const config: Record<SubscriptionStatus, { label: string; classes: string }> = {
  trial:     { label: 'Trial',     classes: 'bg-blue-50 text-blue-700 border-blue-200' },
  active:    { label: 'Activo',    classes: 'bg-green-50 text-green-700 border-green-200' },
  past_due:  { label: 'Vencido',   classes: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  cancelled: { label: 'Cancelado', classes: 'bg-slate-100 text-slate-500 border-slate-200' },
  expired:   { label: 'Expirado',  classes: 'bg-red-50 text-red-600 border-red-200' },
}

export function ClientStatusBadge({ status }: { status: SubscriptionStatus }) {
  const { label, classes } = config[status] ?? config.trial
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border', classes)}>
      {label}
    </span>
  )
}

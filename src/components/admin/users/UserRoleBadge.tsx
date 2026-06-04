import { cn } from '@/lib/utils'
import type { GlobalRole } from '@/lib/actions/users'

const config: Record<GlobalRole, { label: string; classes: string }> = {
  platform_admin: { label: 'Admin',         classes: 'bg-violet-50 text-violet-700 border-violet-200' },
  client_owner:   { label: 'Client Owner',  classes: 'bg-blue-50 text-blue-700 border-blue-200' },
  client_member:  { label: 'Client Member', classes: 'bg-slate-100 text-slate-600 border-slate-200' },
}

export function UserRoleBadge({ role }: { role: GlobalRole }) {
  const { label, classes } = config[role] ?? config.client_member
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border', classes)}>
      {label}
    </span>
  )
}

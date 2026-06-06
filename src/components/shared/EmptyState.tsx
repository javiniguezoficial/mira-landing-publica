import { type LucideIcon } from 'lucide-react'

interface EmptyStateProps {
  icon?: LucideIcon
  title: string
  description?: string
  action?: { label: string; href: string }
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {Icon && (
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-mira-magenta-soft">
          <Icon size={24} className="text-mira-magenta" />
        </div>
      )}
      <p className="mb-1 text-sm font-bold text-mira-ink">{title}</p>
      {description && <p className="max-w-xs text-xs text-slate-400">{description}</p>}
      {action && (
        <a
          href={action.href}
          className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-mira-magenta px-4 py-2 text-xs font-bold text-white shadow-lg shadow-mira-magenta/25 transition-colors hover:bg-mira-magenta-deep"
        >
          {action.label}
        </a>
      )}
    </div>
  )
}

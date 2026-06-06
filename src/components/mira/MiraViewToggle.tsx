'use client'
import { type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Option<T extends string> {
  value: T
  label: string
  icon?: LucideIcon
}

interface Props<T extends string> {
  value: T
  onChange: (v: T) => void
  options: Option<T>[]
  className?: string
}

/** Toggle segmentado premium (ej: Lista / Mapa). */
export function MiraViewToggle<T extends string>({ value, onChange, options, className }: Props<T>) {
  return (
    <div className={cn('inline-flex items-center gap-1 rounded-xl border border-mira-line bg-white p-1', className)}>
      {options.map(opt => {
        const Icon = opt.icon
        const active = value === opt.value
        return (
          <button
            key={opt.value}
            onClick={() => onChange(opt.value)}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
              active ? 'bg-mira-magenta text-white shadow-sm' : 'text-slate-500 hover:bg-mira-canvas',
            )}
          >
            {Icon && <Icon size={13} />}
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

'use client'
import { Search } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  className?: string
}

export function MiraSearchInput({ value, onChange, placeholder = 'Buscar…', className }: Props) {
  return (
    <div className={cn('relative', className)}>
      <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border border-mira-line bg-white py-2.5 pl-10 pr-4 text-sm text-mira-ink transition-colors placeholder:text-slate-400 focus:border-mira-magenta focus:outline-none focus:ring-2 focus:ring-mira-magenta/20"
      />
    </div>
  )
}

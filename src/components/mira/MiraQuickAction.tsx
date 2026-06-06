import { type LucideIcon } from 'lucide-react'

interface Props {
  href: string
  label: string
  desc?: string
  icon: LucideIcon
  /** clases de gradiente tailwind, ej "from-violet-500 to-purple-600" */
  gradient: string
}

export function MiraQuickAction({ href, label, desc, icon: Icon, gradient }: Props) {
  return (
    <a
      href={href}
      className="group flex flex-col items-start gap-3 rounded-2xl border border-mira-line bg-white p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-mira-magenta/20 hover:shadow-lg hover:shadow-mira-magenta/10"
    >
      <div className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${gradient} shadow-md transition-transform duration-200 group-hover:scale-110`}>
        <Icon size={20} className="text-white" />
      </div>
      <div>
        <p className="text-sm font-bold text-mira-ink transition-colors group-hover:text-mira-magenta">{label}</p>
        {desc && <p className="mt-0.5 text-[11px] text-slate-400">{desc}</p>}
      </div>
    </a>
  )
}

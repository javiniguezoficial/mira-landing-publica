'use client'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { type LucideIcon, ChevronDown, LogOut, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { MiraBrand } from './MiraBrand'

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  /** prefijo numérico opcional (ej: "1") al estilo de las referencias */
  number?: string
  /** sub-items reales que se despliegan cuando el item está activo */
  children?: { href: string; label: string }[]
}

export interface MiraUser {
  name: string
  meta: string
  initial: string
}

interface Props {
  nav: NavItem[]
  user: MiraUser
  badge?: string
  onClose?: () => void
}

export function MiraSidebar({ nav, user, badge, onClose }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const [expanded, setExpanded] = useState(false)

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <aside className="mira-sidebar-bg flex h-full w-full flex-col text-white">
      {/* Logo */}
      <div className="relative flex items-center justify-center px-5 pb-5 pt-6">
        <MiraBrand />
        {badge && (
          <span className="absolute right-12 top-6 rounded-full bg-white/10 px-2 py-0.5 text-[8px] font-bold uppercase tracking-widest text-white/60">
            {badge}
          </span>
        )}
        {onClose && (
          <button onClick={onClose} className="absolute right-4 top-5 rounded-lg p-1.5 text-white/50 transition-colors hover:bg-white/10 hover:text-white md:hidden">
            <X size={16} />
          </button>
        )}
      </div>

      {/* Navegación */}
      <nav className="mira-scroll flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {nav.map(item => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
          const Icon = item.icon
          const hasChildren = !!item.children?.length
          const showChildren = hasChildren && (isActive || expanded)
          return (
            <div key={item.href}>
              <a
                href={item.href}
                onClick={(e) => {
                  if (hasChildren && !isActive) { e.preventDefault(); setExpanded(v => !v); return }
                  onClose?.()
                }}
                className={cn(
                  'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold transition-all duration-150',
                  isActive
                    ? 'bg-gradient-to-r from-mira-magenta to-mira-magenta-deep text-white shadow-lg shadow-mira-magenta/30'
                    : 'text-white/55 hover:bg-white/8 hover:text-white'
                )}
              >
                <Icon size={17} className="shrink-0" />
                <span className="flex-1 truncate">
                  {item.number && <span className="mr-1 opacity-80">{item.number}.</span>}
                  {item.label}
                </span>
                {hasChildren && (
                  <ChevronDown size={13} className={cn('shrink-0 opacity-60 transition-transform', showChildren && 'rotate-180')} />
                )}
              </a>
              {showChildren && (
                <div className="mt-0.5 space-y-0.5 pb-1 pl-11">
                  {item.children!.map(child => {
                    const childActive = pathname === child.href
                    return (
                      <a
                        key={child.href}
                        href={child.href}
                        onClick={onClose}
                        className={cn(
                          'flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors',
                          childActive ? 'text-white' : 'text-white/45 hover:text-white/80'
                        )}
                      >
                        <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', childActive ? 'bg-mira-magenta' : 'bg-white/30')} />
                        {child.label}
                      </a>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      {/* Usuario */}
      <div className="border-t border-white/8 px-3 py-3">
        <div className="mb-1 flex items-center gap-3 rounded-xl bg-white/5 px-3 py-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-mira-magenta via-purple-500 to-violet-600 text-sm font-black text-white shadow-md shadow-purple-900/40">
            {user.initial}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-bold leading-tight text-white">{user.name}</p>
            <p className="truncate text-[10px] text-white/45">{user.meta}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-white/45 transition-colors hover:bg-red-500/10 hover:text-red-300"
        >
          <LogOut size={13} />
          Cerrar sesión
        </button>
      </div>
    </aside>
  )
}

'use client'
import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { Menu } from 'lucide-react'
import { MiraSidebar, type NavItem, type MiraUser } from './MiraSidebar'

interface Props {
  nav: NavItem[]
  user: MiraUser
  badge?: string
  children: React.ReactNode
}

function getLabel(nav: NavItem[], pathname: string) {
  for (const item of nav) {
    if (pathname === item.href || pathname.startsWith(item.href + '/')) return item.label
  }
  return 'mira'
}

/** Layout unificado del panel: sidebar fijo (desktop) + header y drawer (móvil). */
export function MiraPageShell({ nav, user, badge, children }: Props) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const label = getLabel(nav, pathname)

  return (
    <div className="mira-content-bg flex min-h-screen">
      {/* Sidebar desktop */}
      <div className="hidden md:sticky md:top-0 md:flex md:h-screen md:w-[264px] md:shrink-0 md:flex-col">
        <MiraSidebar nav={nav} user={user} badge={badge} />
      </div>

      {/* Overlay móvil */}
      {open && (
        <div className="fixed inset-0 z-40 bg-mira-plum-deep/70 backdrop-blur-sm md:hidden" onClick={() => setOpen(false)} />
      )}

      {/* Drawer móvil */}
      <div className={`fixed inset-y-0 left-0 z-50 h-screen w-[264px] transform transition-transform duration-300 ease-out md:hidden ${open ? 'translate-x-0' : '-translate-x-full'}`}>
        <MiraSidebar nav={nav} user={user} badge={badge} onClose={() => setOpen(false)} />
      </div>

      {/* Contenido */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Header móvil */}
        <header className="mira-sidebar-bg sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-white/8 px-4 md:hidden">
          <button onClick={() => setOpen(true)} className="rounded-lg p-2 text-white/60 transition-colors hover:bg-white/10 hover:text-white">
            <Menu size={20} />
          </button>
          <span className="text-sm font-bold text-white">{label}</span>
        </header>

        <main className="flex-1 overflow-x-hidden">{children}</main>
      </div>
    </div>
  )
}

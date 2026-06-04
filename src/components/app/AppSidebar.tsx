'use client'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  TrendingUp,
  FileText,
  MapPin,
  Newspaper,
  Package,
  Users,
  Settings,
  HelpCircle,
} from 'lucide-react'

const nav = [
  { href: '/app/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/app/markets', label: 'Market Intelligence', icon: TrendingUp },
  { href: '/app/rfq', label: 'Cotizaciones', icon: FileText },
  { href: '/app/suppliers', label: 'Proveedores', icon: MapPin },
  { href: '/app/news', label: 'Noticias', icon: Newspaper },
  { href: '/app/organization', label: 'Mi organización', icon: Users },
  { href: '/app/settings', label: 'Configuración', icon: Settings },
  { href: '#', label: 'Ayuda', icon: HelpCircle },
]

export const AppSidebar = () => {
  const pathname = usePathname()

  return (
    <aside className="w-64 bg-white border-r border-slate-200 flex flex-col h-screen sticky top-0">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-slate-100">
        <a href="/" className="flex items-center gap-2">
          <span className="text-xl font-display font-bold text-mira-primary">mira</span>
          <span className="text-xs bg-mira-primary/10 text-mira-primary px-2 py-0.5 rounded font-bold">
            beta
          </span>
        </a>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {nav.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(href + '/')
          return (
            <a
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-body font-semibold transition-all',
                isActive
                  ? 'bg-mira-primary/10 text-mira-primary'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              )}
            >
              <Icon size={18} />
              {label}
            </a>
          )
        })}
      </nav>

      {/* User area */}
      <div className="px-4 py-4 border-t border-slate-100">
        <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50">
          <div className="w-8 h-8 rounded-full bg-mira-primary/20 flex items-center justify-center text-mira-primary font-bold text-sm">
            U
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-slate-900 truncate">Usuario</p>
            <p className="text-[10px] text-slate-500 truncate">cliente</p>
          </div>
        </div>
      </div>
    </aside>
  )
}

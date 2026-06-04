'use client'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Users,
  Building2,
  TrendingUp,
  Package,
  DollarSign,
  Database,
  Truck,
  FileText,
  Newspaper,
  CreditCard,
  Activity,
  Settings,
} from 'lucide-react'

const nav = [
  { href: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/clients', label: 'Clientes', icon: Building2 },
  { href: '/admin/users', label: 'Usuarios', icon: Users },
  { href: '/admin/markets', label: 'Mercados', icon: TrendingUp },
  { href: '/admin/products', label: 'Productos', icon: Package },
  { href: '/admin/prices', label: 'Precios', icon: DollarSign },
  { href: '/admin/sources', label: 'Fuentes', icon: Database },
  { href: '/admin/suppliers', label: 'Proveedores', icon: Truck },
  { href: '/admin/rfq', label: 'RFQs', icon: FileText },
  { href: '/admin/news', label: 'Noticias', icon: Newspaper },
  { href: '/admin/subscriptions', label: 'Suscripciones', icon: CreditCard },
  { href: '/admin/audit', label: 'Auditoría', icon: Activity },
  { href: '/admin/settings', label: 'Configuración', icon: Settings },
]

export const AdminSidebar = () => {
  const pathname = usePathname()

  return (
    <aside className="w-64 bg-slate-900 text-white flex flex-col h-screen sticky top-0">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-slate-700">
        <a href="/" className="flex items-center gap-2">
          <span className="text-xl font-display font-bold text-mira-primary">mira</span>
          <span className="text-xs bg-white/10 text-slate-300 px-2 py-0.5 rounded font-bold">
            admin
          </span>
        </a>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {nav.map(({ href, label, icon: Icon }) => {
          const isActive = pathname === href || pathname.startsWith(href + '/')
          return (
            <a
              key={href}
              href={href}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-body font-semibold transition-all',
                isActive
                  ? 'bg-mira-primary text-white'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              )}
            >
              <Icon size={18} />
              {label}
            </a>
          )
        })}
      </nav>

      {/* Admin badge */}
      <div className="px-4 py-4 border-t border-slate-700">
        <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-800">
          <div className="w-8 h-8 rounded-full bg-mira-primary flex items-center justify-center font-bold text-sm">
            A
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-white truncate">Administrador</p>
            <p className="text-[10px] text-slate-400 truncate">platform_admin</p>
          </div>
        </div>
      </div>
    </aside>
  )
}

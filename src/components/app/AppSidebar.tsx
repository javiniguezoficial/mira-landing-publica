'use client'
import { useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  TrendingUp,
  FileText,
  MapPin,
  Newspaper,
  Users,
  Settings,
  HelpCircle,
  LogOut,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

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
  const router = useRouter()
  const [userName, setUserName] = useState('Usuario')
  const [userEmail, setUserEmail] = useState('')

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      setUserEmail(user.email ?? '')
      supabase.from('profiles').select('first_name, last_name').eq('id', user.id).single()
        .then(({ data }) => {
          if (data?.first_name) setUserName([data.first_name, data.last_name].filter(Boolean).join(' '))
        })
    })
  }, [])

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <aside className="w-64 bg-slate-900 text-white flex flex-col h-screen sticky top-0">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-slate-700">
        <a href="/" className="flex items-center gap-2">
          <span className="text-xl font-display font-bold text-mira-primary">mira</span>
          <span className="text-xs bg-white/10 text-slate-300 px-2 py-0.5 rounded font-bold">
            beta
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

      {/* User area */}
      <div className="px-4 py-4 border-t border-slate-700 space-y-2">
        <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-800">
          <div className="w-8 h-8 rounded-full bg-mira-primary flex items-center justify-center font-bold text-sm shrink-0">
            {userName.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-white truncate">{userName}</p>
            <p className="text-[10px] text-slate-400 truncate">{userEmail}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold text-slate-400 hover:bg-slate-800 hover:text-red-400 transition-colors"
        >
          <LogOut size={14} />
          Cerrar sesión
        </button>
      </div>
    </aside>
  )
}

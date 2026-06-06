'use client'
import { useEffect, useState } from 'react'
import {
  LayoutDashboard, TrendingUp, FileText, MapPin,
  Newspaper, Users, Settings, HelpCircle,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { MiraPageShell } from '@/components/mira/MiraPageShell'
import type { NavItem, MiraUser } from '@/components/mira/MiraSidebar'

const nav: NavItem[] = [
  { href: '/app/dashboard',          label: 'Dashboard',           icon: LayoutDashboard },
  { href: '/app/market-intelligent', label: 'Market Intelligence', icon: TrendingUp, number: '1' },
  {
    href: '/app/rfqs', label: 'Cotizaciones', icon: FileText, number: '2',
    children: [
      { href: '/app/rfqs',       label: 'Mis RFQs' },
      { href: '/app/rfqs/nueva', label: 'Nueva RFQ' },
    ],
  },
  { href: '/app/proveedores',     label: 'Proveedores',     icon: MapPin, number: '3' },
  { href: '/app/noticias',        label: 'Noticias',        icon: Newspaper },
  { href: '/app/mi-organizacion', label: 'Mi organización', icon: Users },
  { href: '/app/configuracion',   label: 'Configuración',   icon: Settings },
  { href: '/app/ayuda',           label: 'Ayuda',           icon: HelpCircle },
]

const ROLE_LABELS: Record<string, string> = { client_owner: 'Propietario', client_member: 'Miembro' }

export function AppShell({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<MiraUser>({ name: 'Usuario', meta: '', initial: 'U' })

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      const email = user.email ?? ''
      supabase.from('profiles').select('first_name, last_name, role').eq('id', user.id).single()
        .then(({ data }) => {
          const name = data?.first_name ? [data.first_name, data.last_name].filter(Boolean).join(' ') : 'Usuario'
          const meta = data?.role ? (ROLE_LABELS[data.role] ?? data.role) : email
          setUser({ name, meta, initial: name.charAt(0).toUpperCase() })
        })
    })
  }, [])

  return <MiraPageShell nav={nav} user={user}>{children}</MiraPageShell>
}

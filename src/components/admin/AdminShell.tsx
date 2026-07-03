'use client'
import { useEffect, useState } from 'react'
import {
  LayoutDashboard, Users, Building2, TrendingUp, Globe2,
  DollarSign, Truck, FileText, Newspaper, LifeBuoy, Settings,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { MiraPageShell } from '@/components/mira/MiraPageShell'
import type { NavItem, MiraUser } from '@/components/mira/MiraSidebar'

const nav: NavItem[] = [
  { href: '/admin/dashboard',        label: 'Dashboard',        icon: LayoutDashboard },
  { href: '/admin/clientes',         label: 'Clientes',         icon: Building2 },
  { href: '/admin/usuarios',         label: 'Usuarios',         icon: Users },
  { href: '/admin/mercados-estrategicos', label: 'M. estratégicos', icon: Globe2 },
  { href: '/admin/mercados',         label: 'Mercados',         icon: TrendingUp },
  { href: '/admin/precios/importar', label: 'Importar precios', icon: DollarSign },
  {
    href: '/admin/proveedores', label: 'Proveedores', icon: Truck,
    children: [
      { href: '/admin/proveedores',            label: 'Listado' },
      { href: '/admin/proveedores/taxonomia',  label: 'Taxonomía' },
    ],
  },
  { href: '/admin/rfqs',             label: 'RFQs',             icon: FileText },
  { href: '/admin/noticias',         label: 'Noticias',         icon: Newspaper },
  { href: '/admin/soporte',          label: 'Soporte',          icon: LifeBuoy },
  { href: '/admin/configuracion',    label: 'Configuración',    icon: Settings },
]

export function AdminShell({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<MiraUser>({ name: 'Administrador', meta: '', initial: 'A' })

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return
      const email = user.email ?? ''
      supabase.from('profiles').select('first_name, last_name').eq('id', user.id).single()
        .then(({ data }) => {
          const name = data?.first_name ? [data.first_name, data.last_name].filter(Boolean).join(' ') : 'Administrador'
          setUser({ name, meta: email, initial: name.charAt(0).toUpperCase() })
        })
    })
  }, [])

  return <MiraPageShell nav={nav} user={user} badge="admin">{children}</MiraPageShell>
}

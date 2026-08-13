'use client'
import { useEffect, useState } from 'react'
import {
  LayoutDashboard, TrendingUp, FileText, MapPin,
  Newspaper, Users, Settings, HelpCircle,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { MiraPageShell } from '@/components/mira/MiraPageShell'
import type { NavItem, MiraUser } from '@/components/mira/MiraSidebar'
import {
  DEFAULT_ORGANIZATION_MODULES,
  type OrganizationModules,
} from '@/lib/auth/modules'

const nav: NavItem[] = [
  { href: '/app/dashboard',          label: 'Dashboard',           icon: LayoutDashboard },
  { href: '/app/market-intelligent', label: 'Market Intelligence', icon: TrendingUp },
  {
    href: '/app/rfqs', label: 'Cotizaciones', icon: FileText,
    children: [
      // El histórico NO se oculta por falta de capacidad de compra: quien puede
      // leerlo debe seguir llegando a él desde el menú.
      { href: '/app/rfqs',       label: 'Mis RFQs' },
      // «Nueva RFQ» sí es una acción. El enlace se mantiene visible para todo el
      // equipo y la protección vive en servidor: la página evalúa la capacidad
      // completa y redirige a /app/rfqs, o a /app/dashboard si tampoco hay
      // lectura. Condicionarlo aquí exigiría cargar el contexto de autorización
      // en el layout de /app, es decir en CADA página privada —incluidas Market
      // Intelligence y Proveedores—, y ese coste no compensa hoy.
      { href: '/app/rfqs/nueva', label: 'Nueva RFQ' },
    ],
  },
  { href: '/app/proveedores',     label: 'Proveedores',     icon: MapPin },
  { href: '/app/noticias',        label: 'Noticias',        icon: Newspaper },
  { href: '/app/mi-organizacion', label: 'Mi organización', icon: Users },
  { href: '/app/configuracion',   label: 'Configuración',   icon: Settings },
  { href: '/app/ayuda',           label: 'Ayuda',           icon: HelpCircle },
]

const ROLE_LABELS: Record<string, string> = { user: 'Usuario', client_owner: 'Propietario', client_member: 'Miembro' }

/**
 * Marca en la navegación los módulos apagados (1.4).
 *
 * Los enlaces NO se eliminan ni se reordenan: el menú es el mismo para todo el
 * mundo, y quien tiene un módulo apagado ve el candado y, al pulsar, la
 * explicación. Ocultarlo en silencio dejaría a la persona sin saber que el
 * módulo existe ni a quién pedirlo.
 *
 * Los hijos de Cotizaciones se conservan por la misma razón: cada uno lleva a
 * una pantalla que sabe explicarse.
 */
function navConModulos(modules: OrganizationModules): NavItem[] {
  const apagado: Record<string, boolean> = {
    '/app/market-intelligent': !modules.markets,
    '/app/rfqs': !modules.quotes,
  }

  return nav.map((item) =>
    apagado[item.href] ? { ...item, moduleDisabled: true } : item,
  )
}

/**
 * Marca «Ayuda» con el número de solicitudes que tienen respuesta de MIRA.
 *
 * Mismo mecanismo que el badge de Soporte en /admin: `badgeCount` lo pinta
 * `MiraSidebar`, y con `0` o `null` no pinta nada. No hace falta condicionar
 * aquí: `formatBadgeCount` ya trata el cero como «sin aviso».
 *
 * ── Qué NO significa este número ──────────────────────────────────────────
 *
 * No es «respuestas nuevas». Es «solicitudes con respuesta». La diferencia
 * importa porque el número no baja al leer: con el esquema actual no hay forma
 * de saber que alguien ha visto una respuesta (ver `lib/queries/support.ts`).
 */
function navConAvisos(items: NavItem[], answeredTickets: number): NavItem[] {
  return items.map((item) =>
    item.href === '/app/ayuda' ? { ...item, badgeCount: answeredTickets } : item,
  )
}

interface AppShellProps {
  children: React.ReactNode
  /**
   * Módulos de la organización, resueltos en el layout (servidor) y pasados
   * como prop. Así la barra lateral no abre su propia consulta y el estado es
   * el mismo que aplican los guards de cada página.
   */
  modules?: OrganizationModules
  /**
   * Solicitudes propias con respuesta de MIRA. Lo calcula el layout en
   * servidor; este componente no consulta nada.
   */
  answeredTickets?: number
}

export function AppShell({
  children,
  modules = DEFAULT_ORGANIZATION_MODULES,
  answeredTickets = 0,
}: AppShellProps) {
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

  return (
    // 037 — el logo lleva al Dashboard del cliente, no a la landing pública.
    // Este shell solo lo monta el layout de `/app/*`, así que el destino está
    // decidido en servidor: no se consulta el rol en el navegador.
    <MiraPageShell
      nav={navConAvisos(navConModulos(modules), answeredTickets)}
      user={user}
      homeHref="/app/dashboard"
      homeLabel="MIRA — ir al Dashboard"
    >
      {children}
    </MiraPageShell>
  )
}

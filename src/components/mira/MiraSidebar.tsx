'use client'
import Link from 'next/link'
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

/** id estable y válido en HTML para enlazar el botón con su submenú (aria-controls). */
function submenuId(href: string) {
  return `mira-submenu-${href.replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '')}`
}

export function MiraSidebar({ nav, user, badge, onClose }: Props) {
  const pathname = usePathname()
  const router = useRouter()

  // Estado por grupo, no global. Guarda ÚNICAMENTE los grupos que el usuario ha
  // abierto o cerrado a mano; el resto se deriva de `pathname` (ver `isOpen`),
  // así que no hace falta ningún efecto para el estado inicial.
  const [overrides, setOverrides] = useState<Record<string, boolean>>({})

  const toggleGroup = (href: string, fallback: boolean) => {
    setOverrides(prev => ({ ...prev, [href]: !(prev[href] ?? fallback) }))
  }

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
          // Por defecto el grupo que contiene la ruta actual aparece desplegado.
          // Si el usuario lo ha tocado, manda su decisión.
          const isOpen = hasChildren && (overrides[item.href] ?? isActive)
          const panelId = submenuId(item.href)

          return (
            <div key={item.href}>
              {/* Fila del elemento padre: el enlace y el control de despliegue son
                  hermanos, nunca elementos interactivos anidados. */}
              <div
                className={cn(
                  'group relative flex items-center rounded-xl text-[13px] font-semibold transition-all duration-150',
                  isActive
                    ? 'bg-gradient-to-r from-mira-magenta to-mira-magenta-deep text-white shadow-lg shadow-mira-magenta/30'
                    : 'text-white/55 hover:bg-white/8 hover:text-white'
                )}
              >
                <Link
                  href={item.href}
                  // Solo navegar cierra el menú móvil. Desplegar, no.
                  onClick={() => onClose?.()}
                  aria-current={isActive ? 'page' : undefined}
                  className="flex min-w-0 flex-1 items-center gap-3 rounded-xl px-3 py-2.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                >
                  <Icon size={17} className="shrink-0" />
                  <span className="min-w-0 flex-1 truncate">
                    {item.number && <span className="mr-1 opacity-80">{item.number}.</span>}
                    {item.label}
                  </span>
                </Link>

                {hasChildren && (
                  <button
                    type="button"
                    onClick={() => toggleGroup(item.href, isActive)}
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    aria-label={`${isOpen ? 'Contraer' : 'Desplegar'} submenú de ${item.label}`}
                    className="shrink-0 rounded-xl px-2.5 py-2.5 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
                  >
                    <ChevronDown
                      size={13}
                      aria-hidden="true"
                      className={cn('opacity-60 transition-transform', isOpen && 'rotate-180')}
                    />
                  </button>
                )}
              </div>

              {hasChildren && (
                // Siempre en el DOM para que `aria-controls` apunte a un elemento
                // real; `hidden` lo saca del árbol de accesibilidad y del tabulador.
                <div
                  id={panelId}
                  className={cn('mt-0.5 space-y-0.5 pb-1 pl-11', !isOpen && 'hidden')}
                >
                  {item.children!.map(child => {
                    const childActive = pathname === child.href
                    return (
                      <Link
                        key={child.href}
                        href={child.href}
                        onClick={() => onClose?.()}
                        aria-current={childActive ? 'page' : undefined}
                        className={cn(
                          'flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50',
                          childActive ? 'text-white' : 'text-white/45 hover:text-white/80'
                        )}
                      >
                        <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', childActive ? 'bg-mira-magenta' : 'bg-white/30')} />
                        {child.label}
                      </Link>
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

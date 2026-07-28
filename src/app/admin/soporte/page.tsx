import Link from 'next/link'
import { requirePlatformAdmin } from '@/lib/auth/guards'
import { getTickets } from '@/lib/queries/support'
import { LifeBuoy, ChevronRight } from 'lucide-react'
import { MiraPageHeader } from '@/components/mira/MiraPageHeader'
import { MiraStatusBadge } from '@/components/mira/MiraStatusBadge'
import { MiraFilterBar } from '@/components/mira/MiraFilterBar'
import { EmptyState } from '@/components/shared/EmptyState'
import { miraBtn, miraField } from '@/lib/miraButtons'

export const dynamic = 'force-dynamic'

const CATEGORY_LABELS: Record<string, string> = {
  account: 'Cuenta', data: 'Datos', prices: 'Precios',
  rfq: 'Cotizaciones', suppliers: 'Proveedores', billing: 'Facturación', other: 'Otro',
}

const FILTER_STATUSES   = [{ value: '', label: 'Todos los estados' }, { value: 'open', label: 'Abierto' }, { value: 'in_progress', label: 'En proceso' }, { value: 'resolved', label: 'Resuelto' }, { value: 'closed', label: 'Cerrado' }]
const FILTER_PRIORITIES = [{ value: '', label: 'Todas las prioridades' }, { value: 'low', label: 'Baja' }, { value: 'normal', label: 'Normal' }, { value: 'high', label: 'Alta' }]
const FILTER_CATEGORIES = [
  { value: '', label: 'Todas las categorías' },
  { value: 'account', label: 'Cuenta' }, { value: 'data', label: 'Datos' },
  { value: 'prices', label: 'Precios' }, { value: 'rfq', label: 'Cotizaciones' },
  { value: 'suppliers', label: 'Proveedores' }, { value: 'billing', label: 'Facturación' },
  { value: 'other', label: 'Otro' },
]

interface PageProps {
  searchParams: Promise<{ status?: string; priority?: string; category?: string }>
}

export default async function AdminSoportePage({ searchParams }: PageProps) {
  // Página de administración: el guard redirige, nunca responde JSON.
  await requirePlatformAdmin('redirect-login')

  const sp = await searchParams
  const filters = {
    status:   sp.status   || undefined,
    priority: sp.priority || undefined,
    category: sp.category || undefined,
  }
  const tickets = await getTickets(filters)

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-6 xl:p-8">
      {/* Cabecera */}
      <MiraPageHeader
        icon={LifeBuoy}
        title="Soporte"
        subtitle={`${tickets.length} solicitud${tickets.length !== 1 ? 'es' : ''}`}
      />

      {/* Filtros */}
      <MiraFilterBar>
        <form method="GET" className="flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <select name="status" defaultValue={sp.status ?? ''} className={`${miraField} sm:w-48`}>
            {FILTER_STATUSES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select name="priority" defaultValue={sp.priority ?? ''} className={`${miraField} sm:w-48`}>
            {FILTER_PRIORITIES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select name="category" defaultValue={sp.category ?? ''} className={`${miraField} sm:w-48`}>
            {FILTER_CATEGORIES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <button type="submit" className={miraBtn.primary}>
            Filtrar
          </button>
          {(filters.status || filters.priority || filters.category) && (
            <Link href="/admin/soporte" className={miraBtn.ghost}>
              Limpiar
            </Link>
          )}
        </form>
      </MiraFilterBar>

      {/* Listado */}
      {tickets.length === 0 ? (
        <div className="mira-card rounded-2xl">
          <EmptyState
            icon={LifeBuoy}
            title="No hay solicitudes"
            description="No hay tickets de soporte con estos filtros."
          />
        </div>
      ) : (
        <div className="mira-card overflow-hidden rounded-2xl">
          <div className="divide-y divide-mira-line">
            {tickets.map(ticket => (
              <Link
                key={ticket.id}
                href={`/admin/soporte/${ticket.id}`}
                className="group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-mira-canvas/70 sm:px-6"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-mira-ink transition-colors group-hover:text-mira-magenta">
                    {ticket.subject}
                  </p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <MiraStatusBadge status={ticket.status} kind="ticket" />
                    <MiraStatusBadge status={ticket.priority} kind="priority" />
                    <span className="text-xs text-slate-400">{CATEGORY_LABELS[ticket.category] ?? ticket.category}</span>
                    {ticket.organization_name && (
                      <span className="text-xs text-slate-400">· {ticket.organization_name}</span>
                    )}
                    {ticket.user_name && (
                      <span className="text-xs text-slate-400">· {ticket.user_name}</span>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <p className="text-xs text-slate-400">
                    {new Date(ticket.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </p>
                  <ChevronRight size={16} className="text-slate-300 transition-colors group-hover:text-mira-magenta" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

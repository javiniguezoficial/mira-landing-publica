import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getTickets } from '@/lib/queries/support'
import { LifeBuoy, Tag, ChevronRight, AlertCircle } from 'lucide-react'

export const dynamic = 'force-dynamic'

const STATUS_STYLES: Record<string, string> = {
  open:        'bg-blue-50 text-blue-700 border-blue-200',
  in_progress: 'bg-amber-50 text-amber-700 border-amber-200',
  resolved:    'bg-emerald-50 text-emerald-700 border-emerald-200',
  closed:      'bg-slate-100 text-slate-500 border-slate-200',
}
const STATUS_LABELS: Record<string, string> = {
  open: 'Abierto', in_progress: 'En proceso', resolved: 'Resuelto', closed: 'Cerrado',
}
const PRIORITY_STYLES: Record<string, string> = {
  low: 'bg-slate-100 text-slate-500', normal: 'bg-blue-50 text-blue-600', high: 'bg-red-50 text-red-600',
}
const PRIORITY_LABELS: Record<string, string> = { low: 'Baja', normal: 'Normal', high: 'Alta' }
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
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'platform_admin') redirect('/login')

  const sp = await searchParams
  const filters = {
    status:   sp.status   || undefined,
    priority: sp.priority || undefined,
    category: sp.category || undefined,
  }
  const tickets = await getTickets(filters)

  return (
    <div className="p-8 max-w-6xl mx-auto">
      {/* Cabecera */}
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-lg bg-mira-primary/10 flex items-center justify-center">
          <LifeBuoy size={20} className="text-mira-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-heading font-bold text-slate-900">Soporte</h1>
          <p className="text-sm text-slate-500">{tickets.length} solicitud{tickets.length !== 1 ? 'es' : ''}</p>
        </div>
      </div>

      {/* Filtros */}
      <form method="GET" className="flex flex-wrap gap-3 mb-6">
        <select name="status" defaultValue={sp.status ?? ''} className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-mira-primary/30">
          {FILTER_STATUSES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select name="priority" defaultValue={sp.priority ?? ''} className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-mira-primary/30">
          {FILTER_PRIORITIES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select name="category" defaultValue={sp.category ?? ''} className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-mira-primary/30">
          {FILTER_CATEGORIES.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <button type="submit" className="px-4 py-2 rounded-lg bg-mira-primary text-white text-sm font-semibold hover:bg-mira-primary/90 transition-colors">
          Filtrar
        </button>
        {(filters.status || filters.priority || filters.category) && (
          <Link href="/admin/soporte" className="px-4 py-2 rounded-lg border border-slate-200 text-sm text-slate-500 hover:bg-slate-50 transition-colors">
            Limpiar
          </Link>
        )}
      </form>

      {/* Listado */}
      {tickets.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 flex flex-col items-center justify-center py-16 text-center">
          <AlertCircle size={36} className="text-slate-300 mb-3" />
          <p className="text-sm font-semibold text-slate-500">No hay solicitudes con estos filtros</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="divide-y divide-slate-100">
            {tickets.map(ticket => (
              <Link
                key={ticket.id}
                href={`/admin/soporte/${ticket.id}`}
                className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50 transition-colors group"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate group-hover:text-mira-primary transition-colors">
                    {ticket.subject}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded border ${STATUS_STYLES[ticket.status] ?? ''}`}>
                      {STATUS_LABELS[ticket.status] ?? ticket.status}
                    </span>
                    <span className={`text-xs font-medium px-2 py-0.5 rounded inline-flex items-center gap-1 ${PRIORITY_STYLES[ticket.priority] ?? ''}`}>
                      <Tag size={10} />{PRIORITY_LABELS[ticket.priority] ?? ticket.priority}
                    </span>
                    <span className="text-xs text-slate-400">{CATEGORY_LABELS[ticket.category] ?? ticket.category}</span>
                    {ticket.organization_name && (
                      <span className="text-xs text-slate-400">· {ticket.organization_name}</span>
                    )}
                    {ticket.user_name && (
                      <span className="text-xs text-slate-400">· {ticket.user_name}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <p className="text-xs text-slate-400">
                    {new Date(ticket.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </p>
                  <ChevronRight size={16} className="text-slate-300 group-hover:text-mira-primary transition-colors" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

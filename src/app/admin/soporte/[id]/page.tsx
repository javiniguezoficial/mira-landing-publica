import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getTicket } from '@/lib/queries/support'
import { TicketDetail } from './TicketDetail'
import { ArrowLeft, User, Building2, Calendar, Tag, MessageSquare } from 'lucide-react'

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
const PRIORITY_LABELS: Record<string, string> = { low: 'Baja', normal: 'Normal', high: 'Alta' }
const CATEGORY_LABELS: Record<string, string> = {
  account: 'Cuenta', data: 'Datos', prices: 'Precios',
  rfq: 'Cotizaciones', suppliers: 'Proveedores', billing: 'Facturación', other: 'Otro',
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function AdminSoporteDetailPage({ params }: PageProps) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (profile?.role !== 'platform_admin') redirect('/login')

  const { id } = await params
  const ticket = await getTicket(id)
  if (!ticket) notFound()

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <Link href="/admin/soporte" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-6">
        <ArrowLeft size={14} /> Volver a soporte
      </Link>

      {/* Cabecera */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-heading font-bold text-slate-900 mb-2">{ticket.subject}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`text-xs font-semibold px-2.5 py-1 rounded-lg border ${STATUS_STYLES[ticket.status] ?? ''}`}>
              {STATUS_LABELS[ticket.status] ?? ticket.status}
            </span>
            <span className="text-xs text-slate-500 inline-flex items-center gap-1">
              <Tag size={11} /> {PRIORITY_LABELS[ticket.priority] ?? ticket.priority}
            </span>
            <span className="text-xs text-slate-500">
              {CATEGORY_LABELS[ticket.category] ?? ticket.category}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Columna izquierda: metadata + mensaje */}
        <div className="lg:col-span-1 space-y-4">
          {/* Metadata */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
            {ticket.user_name && (
              <div className="flex items-center gap-2.5 text-sm text-slate-600">
                <User size={14} className="text-slate-400 shrink-0" />
                <span>{ticket.user_name}</span>
              </div>
            )}
            {ticket.organization_name && (
              <div className="flex items-center gap-2.5 text-sm text-slate-600">
                <Building2 size={14} className="text-slate-400 shrink-0" />
                <span>{ticket.organization_name}</span>
              </div>
            )}
            <div className="flex items-center gap-2.5 text-sm text-slate-600">
              <Calendar size={14} className="text-slate-400 shrink-0" />
              <span>{new Date(ticket.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
            </div>
            {ticket.resolved_at && (
              <div className="flex items-center gap-2.5 text-sm text-slate-600">
                <Calendar size={14} className="text-emerald-500 shrink-0" />
                <span>Resuelto: {new Date(ticket.resolved_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
              </div>
            )}
          </div>

          {/* Mensaje original */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-100">
              <MessageSquare size={14} className="text-slate-400" />
              <p className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Mensaje</p>
            </div>
            <div className="px-5 py-4">
              <p className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed">{ticket.message}</p>
            </div>
          </div>
        </div>

        {/* Columna derecha: acciones admin */}
        <div className="lg:col-span-2">
          <TicketDetail
            ticketId={ticket.id}
            currentStatus={ticket.status}
            currentResponse={ticket.admin_response}
          />
        </div>
      </div>
    </div>
  )
}

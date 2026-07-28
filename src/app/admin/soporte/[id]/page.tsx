import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requirePlatformAdmin } from '@/lib/auth/guards'
import { getTicket } from '@/lib/queries/support'
import { TicketDetail } from './TicketDetail'
import { ArrowLeft, User, Building2, Calendar, Tag, MessageSquare, Info } from 'lucide-react'
import { MiraStatusBadge } from '@/components/mira/MiraStatusBadge'
import { MiraSectionCard } from '@/components/mira/MiraSectionCard'

export const dynamic = 'force-dynamic'

const PRIORITY_LABELS: Record<string, string> = { low: 'Baja', normal: 'Normal', high: 'Alta' }
const CATEGORY_LABELS: Record<string, string> = {
  account: 'Cuenta', data: 'Datos', prices: 'Precios',
  rfq: 'Cotizaciones', suppliers: 'Proveedores', billing: 'Facturación', other: 'Otro',
}

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function AdminSoporteDetailPage({ params }: PageProps) {
  // Página de administración: el guard redirige, nunca responde JSON.
  await requirePlatformAdmin('redirect-login')

  const { id } = await params
  const ticket = await getTicket(id)
  if (!ticket) notFound()

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-4 md:p-6 xl:p-8">
      <Link href="/admin/soporte" className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-mira-magenta">
        <ArrowLeft size={14} /> Volver a soporte
      </Link>

      {/* Cabecera */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="mb-2 text-xl font-black tracking-tight text-mira-ink">{ticket.subject}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <MiraStatusBadge status={ticket.status} kind="ticket" />
            <span className="inline-flex items-center gap-1 text-xs text-slate-500">
              <Tag size={11} /> {PRIORITY_LABELS[ticket.priority] ?? ticket.priority}
            </span>
            <span className="text-xs text-slate-500">
              {CATEGORY_LABELS[ticket.category] ?? ticket.category}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Columna izquierda: metadata + mensaje */}
        <div className="space-y-4 lg:col-span-1">
          {/* Metadata */}
          <MiraSectionCard title="Información" icon={Info} bodyClassName="space-y-3 p-5">
            {ticket.user_name && (
              <div className="flex items-center gap-2.5 text-sm text-slate-600">
                <User size={14} className="shrink-0 text-slate-400" />
                <span>{ticket.user_name}</span>
              </div>
            )}
            {ticket.organization_name && (
              <div className="flex items-center gap-2.5 text-sm text-slate-600">
                <Building2 size={14} className="shrink-0 text-slate-400" />
                <span>{ticket.organization_name}</span>
              </div>
            )}
            <div className="flex items-center gap-2.5 text-sm text-slate-600">
              <Calendar size={14} className="shrink-0 text-slate-400" />
              <span>{new Date(ticket.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })}</span>
            </div>
            {ticket.resolved_at && (
              <div className="flex items-center gap-2.5 text-sm text-slate-600">
                <Calendar size={14} className="shrink-0 text-emerald-500" />
                <span>Resuelto: {new Date(ticket.resolved_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
              </div>
            )}
          </MiraSectionCard>

          {/* Mensaje original */}
          <MiraSectionCard title="Mensaje" icon={MessageSquare} bodyClassName="px-5 py-4">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{ticket.message}</p>
          </MiraSectionCard>
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

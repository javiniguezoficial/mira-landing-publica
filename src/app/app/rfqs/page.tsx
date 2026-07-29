import Link from 'next/link'
import { listMyRfqs } from '@/lib/actions/rfqs'
import { getRfqAccess } from '@/lib/queries/rfq-capability'
import { RFQ_MESSAGES } from '@/lib/auth/rfq'
import { MiraPageHeader } from '@/components/mira/MiraPageHeader'
import { MiraTable, MiraTr, MiraTd } from '@/components/mira/MiraTable'
import { MiraStatusBadge } from '@/components/mira/MiraStatusBadge'
import { EmptyState } from '@/components/shared/EmptyState'
import { miraBtn } from '@/lib/miraButtons'
import { Plus, FileText, ArrowRight } from 'lucide-react'

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default async function ClientRfqsPage() {
  const [rfqs, { canRead, canCreate }] = await Promise.all([listMyRfqs(), getRfqAccess()])

  // Sin lectura no hay histórico que enseñar, y decir «aún no tienes
  // cotizaciones» sería falso: las hay, pero esta persona no puede verlas.
  if (!canRead) {
    return (
      <div className="w-full space-y-6 p-4 md:p-6 xl:p-8">
        <MiraPageHeader
          icon={FileText}
          title="Mis cotizaciones"
          subtitle="Solicitudes de cotización enviadas por tu organización"
        />
        <div className="mira-card rounded-2xl">
          <EmptyState
            icon={FileText}
            title="No tienes acceso a estas cotizaciones"
            description={RFQ_MESSAGES.sinAccesoOrganizacion}
          />
        </div>
      </div>
    )
  }

  return (
    <div className="w-full space-y-6 p-4 md:p-6 xl:p-8">
      <MiraPageHeader
        icon={FileText}
        title="Mis cotizaciones"
        subtitle="Solicitudes de cotización enviadas por tu organización"
        actions={
          canCreate
            ? <Link href="/app/rfqs/nueva" className={miraBtn.primary}><Plus size={16} /> Nueva RFQ</Link>
            : null
        }
      />

      {/* El histórico sigue visible aunque no se puedan crear cotizaciones. */}
      {!canCreate && (
        <p className="rounded-xl border border-mira-line bg-mira-canvas px-4 py-3 text-sm text-slate-500">
          {RFQ_MESSAGES.sinCapacidadEnOrganizacion}
        </p>
      )}

      {rfqs.length === 0 ? (
        <div className="mira-card rounded-2xl">
          <EmptyState
            icon={FileText}
            title="Aún no tienes cotizaciones"
            description="Crea tu primera solicitud de cotización para empezar."
            action={canCreate ? { label: 'Crear RFQ', href: '/app/rfqs/nueva' } : undefined}
          />
        </div>
      ) : (
        <MiraTable
          headers={[
            'Producto / Servicio',
            { label: 'Volumen', align: 'right' },
            'País',
            'Límite ofertas',
            'Estado',
            'Creada',
            { label: '', align: 'right' },
          ]}
        >
          {rfqs.map((rfq) => {
            const product = Array.isArray(rfq.product) ? rfq.product[0] : rfq.product
            const isService = rfq.rfq_kind === 'service'
            const name = rfq.request_name || rfq.service_name || product?.name || '—'
            return (
              <MiraTr key={rfq.id}>
                <MiraTd className="font-bold text-mira-ink">
                  <div className="flex items-center gap-2">
                    <span>{name}</span>
                    <span className="rounded bg-mira-canvas px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                      {isService ? 'Servicio' : 'Producto'}
                    </span>
                    {rfq.criticality === 'alto' && (
                      <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-600">Crítico</span>
                    )}
                  </div>
                </MiraTd>
                <MiraTd align="right">
                  <span className="tabular-nums text-slate-700">
                    {rfq.estimated_volume != null
                      ? rfq.estimated_volume.toLocaleString('es-ES')
                      : rfq.quantity != null
                        ? `${rfq.quantity.toLocaleString('es-ES')}${rfq.unit ? ` ${rfq.unit}` : ''}`
                        : '—'}
                  </span>
                </MiraTd>
                <MiraTd className="text-slate-600">{rfq.country}</MiraTd>
                <MiraTd className="text-slate-600">{formatDate(rfq.deadline)}</MiraTd>
                <MiraTd><MiraStatusBadge status={rfq.status} kind="rfq" /></MiraTd>
                <MiraTd className="text-slate-500">{formatDate(rfq.created_at)}</MiraTd>
                <MiraTd align="right">
                  <Link href={`/app/rfqs/${rfq.id}`} className="inline-flex items-center gap-1 text-xs font-bold text-mira-magenta hover:underline">
                    Ver <ArrowRight size={12} />
                  </Link>
                </MiraTd>
              </MiraTr>
            )
          })}
        </MiraTable>
      )}
    </div>
  )
}

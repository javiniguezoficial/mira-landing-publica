import Link from 'next/link'
import { ArrowRight, FileText } from 'lucide-react'
import type { Rfq } from '@/lib/actions/rfqs'
import { MiraTable, MiraTr, MiraTd } from '@/components/mira/MiraTable'
import { MiraStatusBadge } from '@/components/mira/MiraStatusBadge'
import { EmptyState } from '@/components/shared/EmptyState'

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function AdminRfqsTable({ rfqs }: { rfqs: Rfq[] }) {
  if (rfqs.length === 0) {
    return (
      <div className="mira-card rounded-2xl">
        <EmptyState
          icon={FileText}
          title="Sin cotizaciones"
          description="No hay RFQs con los filtros aplicados."
        />
      </div>
    )
  }

  return (
    <MiraTable
      headers={[
        'Organización',
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
        const org = Array.isArray(rfq.organization) ? rfq.organization[0] : rfq.organization
        const product = Array.isArray(rfq.product) ? rfq.product[0] : rfq.product
        const isService = rfq.rfq_kind === 'service'
        const name = isService ? (rfq.service_name ?? '—') : (product?.name ?? '—')
        return (
          <MiraTr key={rfq.id}>
            <MiraTd className="font-bold text-mira-ink">{org?.name ?? '—'}</MiraTd>
            <MiraTd className="text-slate-700">
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
              <Link
                href={`/admin/rfqs/${rfq.id}`}
                className="inline-flex items-center gap-1 text-xs font-bold text-mira-magenta hover:underline"
              >
                Ver <ArrowRight size={12} />
              </Link>
            </MiraTd>
          </MiraTr>
        )
      })}
    </MiraTable>
  )
}

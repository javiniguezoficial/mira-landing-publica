import Link from 'next/link'
import { listMyRfqs } from '@/lib/actions/rfqs'
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
  const rfqs = await listMyRfqs()

  return (
    <div className="w-full space-y-6 p-4 md:p-6 xl:p-8">
      <MiraPageHeader
        icon={FileText}
        title="Mis cotizaciones"
        subtitle="Solicitudes de cotización enviadas por tu organización"
        actions={<Link href="/app/rfqs/nueva" className={miraBtn.primary}><Plus size={16} /> Nueva RFQ</Link>}
      />

      {rfqs.length === 0 ? (
        <div className="mira-card rounded-2xl">
          <EmptyState
            icon={FileText}
            title="Aún no tienes cotizaciones"
            description="Crea tu primera solicitud de cotización para empezar."
            action={{ label: 'Crear RFQ', href: '/app/rfqs/nueva' }}
          />
        </div>
      ) : (
        <MiraTable
          headers={[
            'Producto',
            { label: 'Cantidad', align: 'right' },
            'País',
            'Fecha límite',
            'Estado',
            'Creada',
            { label: '', align: 'right' },
          ]}
        >
          {rfqs.map((rfq) => {
            const product = Array.isArray(rfq.product) ? rfq.product[0] : rfq.product
            return (
              <MiraTr key={rfq.id}>
                <MiraTd className="font-bold text-mira-ink">{product?.name ?? '—'}</MiraTd>
                <MiraTd align="right">
                  <span className="tabular-nums text-slate-700">{rfq.quantity.toLocaleString('es-ES')} {rfq.unit}</span>
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

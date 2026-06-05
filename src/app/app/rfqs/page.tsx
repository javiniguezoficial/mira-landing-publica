import Link from 'next/link'
import { listMyRfqs } from '@/lib/actions/rfqs'
import { RfqStatusBadge } from '@/components/app/rfqs/RfqStatusBadge'
import { Plus, FileText } from 'lucide-react'

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default async function ClientRfqsPage() {
  const rfqs = await listMyRfqs()

  return (
    <div className="p-8 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-heading font-bold text-slate-900">Mis cotizaciones</h1>
          <p className="text-sm text-slate-500 mt-1">
            Solicitudes de cotización enviadas por tu organización
          </p>
        </div>
        <Link
          href="/app/rfqs/nueva"
          className="flex items-center gap-2 px-4 py-2.5 bg-mira-primary text-white rounded-lg text-sm font-semibold hover:bg-mira-primary/90 transition-colors"
        >
          <Plus size={16} />
          Nueva RFQ
        </Link>
      </div>

      {rfqs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mb-4">
            <FileText size={28} className="text-slate-400" />
          </div>
          <h2 className="text-lg font-semibold text-slate-700 mb-2">Aún no tienes cotizaciones</h2>
          <p className="text-sm text-slate-500 mb-6">
            Crea tu primera solicitud de cotización para empezar.
          </p>
          <Link
            href="/app/rfqs/nueva"
            className="px-5 py-2.5 bg-mira-primary text-white rounded-lg text-sm font-semibold hover:bg-mira-primary/90 transition-colors"
          >
            Crear RFQ
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Producto</th>
                <th className="px-4 py-3 text-right font-semibold text-slate-600">Cantidad</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">País</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Fecha límite</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Estado</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-600">Creada</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rfqs.map((rfq) => {
                const product = Array.isArray(rfq.product) ? rfq.product[0] : rfq.product
                return (
                  <tr key={rfq.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {product?.name ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-700 tabular-nums">
                      {rfq.quantity.toLocaleString('es-ES')} {rfq.unit}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{rfq.country}</td>
                    <td className="px-4 py-3 text-slate-600">{formatDate(rfq.deadline)}</td>
                    <td className="px-4 py-3">
                      <RfqStatusBadge status={rfq.status} />
                    </td>
                    <td className="px-4 py-3 text-slate-500">{formatDate(rfq.created_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/app/rfqs/${rfq.id}`}
                        className="text-xs font-semibold text-mira-primary hover:underline"
                      >
                        Ver →
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

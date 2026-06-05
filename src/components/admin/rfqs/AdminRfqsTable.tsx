import Link from 'next/link'
import type { Rfq, RfqStatus } from '@/lib/actions/rfqs'
import { RfqStatusBadge } from '@/components/app/rfqs/RfqStatusBadge'

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
}

export function AdminRfqsTable({ rfqs }: { rfqs: Rfq[] }) {
  if (rfqs.length === 0) {
    return (
      <div className="text-center py-16 text-slate-400 text-sm">
        No hay RFQs con los filtros aplicados.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="px-4 py-3 text-left font-semibold text-slate-600">Organización</th>
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
            const org = Array.isArray(rfq.organization) ? rfq.organization[0] : rfq.organization
            const product = Array.isArray(rfq.product) ? rfq.product[0] : rfq.product
            return (
              <tr key={rfq.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3 font-medium text-slate-800">
                  {org?.name ?? '—'}
                </td>
                <td className="px-4 py-3 text-slate-700">
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
                    href={`/admin/rfqs/${rfq.id}`}
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
  )
}

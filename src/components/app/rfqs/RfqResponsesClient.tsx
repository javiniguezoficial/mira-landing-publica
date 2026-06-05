import { listRfqResponses, type RfqResponse, type RfqResponseStatus } from '@/lib/actions/rfq-responses'

const STATUS_LABEL: Record<RfqResponseStatus, string> = {
  received:    'Recibida',
  shortlisted: 'Preseleccionada',
  rejected:    'Rechazada',
  accepted:    'Aceptada',
}

const STATUS_COLOR: Record<RfqResponseStatus, string> = {
  received:    'bg-slate-100 text-slate-700',
  shortlisted: 'bg-blue-100 text-blue-700',
  rejected:    'bg-red-100 text-red-700',
  accepted:    'bg-green-100 text-green-700',
}

function formatDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
}

// Determina si hay comparativa homogénea (misma currency y unit en todas las respuestas)
function bestPriceId(responses: RfqResponse[]): string | null {
  const visible = responses.filter((r) => r.status !== 'rejected')
  if (visible.length < 2) return null

  const currencies = new Set(visible.map((r) => r.currency))
  const units = new Set(visible.map((r) => r.unit))

  if (currencies.size > 1 || units.size > 1) return null // heterogéneas — no comparar

  return visible.reduce((best, r) => (r.price < best.price ? r : best)).id
}

function heterogeneousWarning(responses: RfqResponse[]): boolean {
  const visible = responses.filter((r) => r.status !== 'rejected')
  if (visible.length < 2) return false
  const currencies = new Set(visible.map((r) => r.currency))
  const units = new Set(visible.map((r) => r.unit))
  return currencies.size > 1 || units.size > 1
}

export async function RfqResponsesClient({ rfqId }: { rfqId: string }) {
  const responses = await listRfqResponses(rfqId)

  if (responses.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h2 className="text-base font-semibold text-slate-800 mb-2">Respuestas recibidas</h2>
        <p className="text-sm text-slate-400">Aún no hay respuestas para esta cotización.</p>
      </div>
    )
  }

  const bestId = bestPriceId(responses)
  const showWarning = heterogeneousWarning(responses)

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-semibold text-slate-800">
          Respuestas recibidas
          <span className="ml-2 text-xs font-normal text-slate-400">({responses.length})</span>
        </h2>
      </div>

      {showWarning && (
        <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-800">
          Las respuestas tienen distintas monedas o unidades. La comparación automática de precios no está disponible.
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide pb-3 pr-4">Proveedor</th>
              <th className="text-right text-xs font-semibold text-slate-500 uppercase tracking-wide pb-3 px-4">Precio</th>
              <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide pb-3 px-4">Entrega</th>
              <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide pb-3 px-4">Condiciones pago</th>
              <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide pb-3 pl-4">Estado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {responses.map((r) => {
              const isBest = bestId === r.id
              return (
                <tr
                  key={r.id}
                  className={`${isBest ? 'bg-green-50' : 'hover:bg-slate-50'} transition-colors`}
                >
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-800">{r.supplier_name}</span>
                      {isBest && (
                        <span className="px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 text-xs font-semibold">
                          Mejor precio
                        </span>
                      )}
                    </div>
                    {r.notes && (
                      <p className="text-xs text-slate-400 mt-0.5 italic">{r.notes}</p>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right font-semibold text-slate-800 whitespace-nowrap">
                    {r.price.toLocaleString('es-ES', { minimumFractionDigits: 2 })} {r.currency}/{r.unit}
                  </td>
                  <td className="py-3 px-4 text-slate-600 whitespace-nowrap">{formatDate(r.delivery_date)}</td>
                  <td className="py-3 px-4 text-slate-600">{r.payment_terms || '—'}</td>
                  <td className="py-3 pl-4">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLOR[r.status]}`}>
                      {STATUS_LABEL[r.status]}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

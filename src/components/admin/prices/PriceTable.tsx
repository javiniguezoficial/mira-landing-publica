'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Pencil, Trash2, LineChart } from 'lucide-react'
import type { PriceRecord } from '@/lib/actions/prices'
import { deletePriceRecord } from '@/lib/actions/prices'
import { EmptyState } from '@/components/shared/EmptyState'
import { miraBtn } from '@/lib/miraButtons'

interface Props {
  records: PriceRecord[]
  marketId: string
  productId: string
  total: number
}

function formatPrice(n: number) {
  return new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(n)
}

export function PriceTable({ records: initial, marketId, productId, total }: Props) {
  const [records, setRecords] = useState(initial)
  const [, startTransition] = useTransition()
  const [deleting, setDeleting] = useState<string | null>(null)

  const handleDelete = (id: string) => {
    if (!confirm('¿Eliminar este registro de precio?')) return
    setDeleting(id)
    startTransition(async () => {
      try {
        await deletePriceRecord(id)
        setRecords(r => r.filter(x => x.id !== id))
      } catch (e) {
        alert(e instanceof Error ? e.message : 'Error al eliminar')
      } finally {
        setDeleting(null)
      }
    })
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500">
        Mostrando {records.length} de {total} registros
      </p>

      {records.length === 0 ? (
        <div className="mira-card rounded-2xl">
          <EmptyState
            icon={LineChart}
            title="Aún no hay precios"
            description="Registra el primer precio histórico de este producto."
            action={{ label: 'Añadir precio', href: `/admin/mercados/${marketId}/productos/${productId}/precios/nuevo` }}
          />
        </div>
      ) : (
        <div className="mira-card overflow-hidden rounded-2xl">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-mira-line bg-mira-canvas/60">
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">Fecha</th>
                  <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wider text-slate-500">Precio</th>
                  <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wider text-slate-500">Mín</th>
                  <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wider text-slate-500">Máx</th>
                  <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wider text-slate-500">Medio</th>
                  <th className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">País</th>
                  <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wider text-slate-500">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-mira-line">
                {records.map(r => (
                  <tr key={r.id} className="transition-colors hover:bg-mira-canvas/70">
                    <td className="px-4 py-2.5 font-mono text-xs text-slate-700">{r.recorded_at}</td>
                    <td className="px-4 py-2.5 text-right font-bold text-mira-ink">
                      {formatPrice(r.price)} <span className="text-xs font-normal text-slate-400">{r.currency}/{r.unit}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs text-slate-500">
                      {r.min_price != null ? formatPrice(r.min_price) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs text-slate-500">
                      {r.max_price != null ? formatPrice(r.max_price) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right text-xs text-slate-500">
                      {r.avg_price != null ? formatPrice(r.avg_price) : '—'}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="rounded-lg bg-slate-100 px-2 py-0.5 font-mono text-xs font-bold text-slate-600">{r.country}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/admin/mercados/${marketId}/productos/${productId}/precios/${r.id}/editar`}
                          className={miraBtn.icon}
                        >
                          <Pencil size={13} />
                        </Link>
                        <button
                          onClick={() => handleDelete(r.id)}
                          disabled={deleting === r.id}
                          className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

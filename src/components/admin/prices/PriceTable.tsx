'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Pencil, Trash2 } from 'lucide-react'
import type { PriceRecord } from '@/lib/actions/prices'
import { deletePriceRecord } from '@/lib/actions/prices'

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
    <div>
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-slate-500">
          Mostrando {records.length} de {total} registros
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {records.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">
            No hay registros de precio.{' '}
            <Link
              href={`/admin/mercados/${marketId}/productos/${productId}/precios/nuevo`}
              className="text-mira-primary font-bold hover:underline"
            >
              Añade el primero.
            </Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Fecha</th>
                <th className="text-right px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Precio</th>
                <th className="text-right px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Mín</th>
                <th className="text-right px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Máx</th>
                <th className="text-right px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Medio</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">País</th>
                <th className="px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {records.map(r => (
                <tr key={r.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                  <td className="px-4 py-2.5 font-mono text-xs text-slate-700">{r.recorded_at}</td>
                  <td className="px-4 py-2.5 text-right font-bold text-slate-900">
                    {formatPrice(r.price)} <span className="text-slate-400 font-normal text-xs">{r.currency}/{r.unit}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-500 text-xs">
                    {r.min_price != null ? formatPrice(r.min_price) : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-500 text-xs">
                    {r.max_price != null ? formatPrice(r.max_price) : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right text-slate-500 text-xs">
                    {r.avg_price != null ? formatPrice(r.avg_price) : '—'}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-xs font-bold px-2 py-0.5 bg-slate-100 text-slate-600 rounded font-mono">{r.country}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href={`/admin/mercados/${marketId}/productos/${productId}/precios/${r.id}/editar`}
                        className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                      >
                        <Pencil size={13} />
                      </Link>
                      <button
                        onClick={() => handleDelete(r.id)}
                        disabled={deleting === r.id}
                        className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors disabled:opacity-40"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Plus, ArrowLeft } from 'lucide-react'
import { getMarketById, getProductById } from '@/lib/actions/markets'
import { getPricesByProduct } from '@/lib/actions/prices'
import { PriceTable } from '@/components/admin/prices/PriceTable'

export const dynamic = 'force-dynamic'

export default async function PreciosProductoPage({
  params,
}: {
  params: Promise<{ id: string; pid: string }>
}) {
  const { id, pid } = await params
  const [market, product, { records, total }] = await Promise.all([
    getMarketById(id),
    getProductById(pid),
    getPricesByProduct(pid, 100),
  ])

  if (!market || !product) notFound()

  return (
    <div className="p-8">
      <div className="mb-6">
        <Link
          href={`/admin/mercados/${id}`}
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4"
        >
          <ArrowLeft size={14} /> {market.name}
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-heading font-bold text-slate-900">{product.name}</h1>
            <p className="text-slate-500 font-body text-sm mt-1">
              Histórico de precios · {total} registros
            </p>
          </div>
          <Link
            href={`/admin/mercados/${id}/productos/${pid}/precios/nuevo`}
            className="inline-flex items-center gap-2 px-4 py-2 bg-mira-primary text-white text-sm font-bold rounded-lg hover:bg-mira-primary/90 transition-colors"
          >
            <Plus size={15} /> Añadir precio
          </Link>
        </div>
      </div>

      <PriceTable
        records={records}
        marketId={id}
        productId={pid}
        total={total}
      />
    </div>
  )
}

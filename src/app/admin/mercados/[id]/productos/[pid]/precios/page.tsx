import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Plus, ArrowLeft, LineChart } from 'lucide-react'
import { getMarketById, getProductById } from '@/lib/actions/markets'
import { getPricesByProduct } from '@/lib/actions/prices'
import { PriceTable } from '@/components/admin/prices/PriceTable'
import { MiraPageHeader } from '@/components/mira/MiraPageHeader'
import { miraBtn } from '@/lib/miraButtons'

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
    <div className="w-full space-y-6 p-4 md:p-6 xl:p-8">
      <div>
        <Link
          href={`/admin/mercados/${id}`}
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-mira-magenta"
        >
          <ArrowLeft size={14} /> {market.name}
        </Link>
        <MiraPageHeader
          icon={LineChart}
          title={product.name}
          subtitle={`Histórico de precios · ${total} registros`}
          actions={
            <Link href={`/admin/mercados/${id}/productos/${pid}/precios/nuevo`} className={miraBtn.primary}>
              <Plus size={15} /> Añadir precio
            </Link>
          }
        />
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

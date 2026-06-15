import { notFound } from 'next/navigation'
import { Package } from 'lucide-react'
import { getMarketById, createProduct } from '@/lib/actions/markets'
import { ProductForm } from '@/components/admin/markets/ProductForm'
import { MiraPageHeader } from '@/components/mira/MiraPageHeader'

export default async function NuevoProductoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const market = await getMarketById(id)
  if (!market) notFound()

  return (
    <div className="w-full space-y-6 p-4 md:p-6 xl:p-8">
      <MiraPageHeader icon={Package} title="Nueva referencia" subtitle={`Añade una referencia al mercado ${market.name}`} />
      <ProductForm
        marketId={id}
        marketName={market.name}
        onSave={async (form) => {
          'use server'
          await createProduct({ market_id: id, ...form })
        }}
      />
    </div>
  )
}

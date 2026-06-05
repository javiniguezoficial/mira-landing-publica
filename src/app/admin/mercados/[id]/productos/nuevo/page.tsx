import { notFound } from 'next/navigation'
import { getMarketById, createProduct } from '@/lib/actions/markets'
import { ProductForm } from '@/components/admin/markets/ProductForm'

export default async function NuevoProductoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const market = await getMarketById(id)
  if (!market) notFound()

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-heading font-bold text-slate-900">Nuevo producto</h1>
        <p className="text-slate-500 font-body text-sm mt-1">Añade un producto al mercado {market.name}</p>
      </div>
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

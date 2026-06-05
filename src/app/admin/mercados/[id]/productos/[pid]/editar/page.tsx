import { notFound } from 'next/navigation'
import { getMarketById, getProductById, updateProduct } from '@/lib/actions/markets'
import { ProductForm } from '@/components/admin/markets/ProductForm'

export default async function EditarProductoPage({
  params,
}: {
  params: Promise<{ id: string; pid: string }>
}) {
  const { id, pid } = await params
  const [market, product] = await Promise.all([getMarketById(id), getProductById(pid)])
  if (!market || !product) notFound()

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-heading font-bold text-slate-900">Editar producto</h1>
        <p className="text-slate-500 font-body text-sm mt-1">{product.name}</p>
      </div>
      <ProductForm
        initial={product}
        marketId={id}
        marketName={market.name}
        onSave={async (form) => {
          'use server'
          await updateProduct(pid, form)
        }}
      />
    </div>
  )
}

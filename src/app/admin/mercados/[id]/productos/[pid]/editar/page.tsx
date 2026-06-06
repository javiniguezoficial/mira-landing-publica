import { notFound } from 'next/navigation'
import { Package } from 'lucide-react'
import { getMarketById, getProductById, updateProduct } from '@/lib/actions/markets'
import { ProductForm } from '@/components/admin/markets/ProductForm'
import { MiraPageHeader } from '@/components/mira/MiraPageHeader'

export default async function EditarProductoPage({
  params,
}: {
  params: Promise<{ id: string; pid: string }>
}) {
  const { id, pid } = await params
  const [market, product] = await Promise.all([getMarketById(id), getProductById(pid)])
  if (!market || !product) notFound()

  return (
    <div className="w-full space-y-6 p-4 md:p-6 xl:p-8">
      <MiraPageHeader icon={Package} title="Editar producto" subtitle={product.name} />
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

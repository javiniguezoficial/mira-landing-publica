import { notFound } from 'next/navigation'
import { getProductById } from '@/lib/actions/markets'
import { createPriceRecord } from '@/lib/actions/prices'
import { PriceRecordForm } from '@/components/admin/prices/PriceRecordForm'

export default async function NuevoPrecioPage({
  params,
}: {
  params: Promise<{ id: string; pid: string }>
}) {
  const { id, pid } = await params
  const product = await getProductById(pid)
  if (!product) notFound()

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-heading font-bold text-slate-900">Nuevo registro de precio</h1>
        <p className="text-slate-500 font-body text-sm mt-1">{product.name}</p>
      </div>
      <PriceRecordForm
        defaultUnit={product.unit}
        onSave={async (form) => {
          'use server'
          await createPriceRecord(pid, form)
        }}
      />
    </div>
  )
}

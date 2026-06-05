import { notFound } from 'next/navigation'
import { getProductById } from '@/lib/actions/markets'
import { getPriceRecordById, updatePriceRecord } from '@/lib/actions/prices'
import { PriceRecordForm } from '@/components/admin/prices/PriceRecordForm'

export default async function EditarPrecioPage({
  params,
}: {
  params: Promise<{ id: string; pid: string; rid: string }>
}) {
  const { id, pid, rid } = await params
  const [product, record] = await Promise.all([
    getProductById(pid),
    getPriceRecordById(rid),
  ])
  if (!product || !record) notFound()

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-heading font-bold text-slate-900">Editar registro de precio</h1>
        <p className="text-slate-500 font-body text-sm mt-1">
          {product.name} · {record.recorded_at}
        </p>
      </div>
      <PriceRecordForm
        initial={{ ...record, region: record.region ?? undefined }}
        defaultUnit={product.unit}
        onSave={async (form) => {
          'use server'
          await updatePriceRecord(rid, form)
        }}
      />
    </div>
  )
}

import { notFound } from 'next/navigation'
import { LineChart } from 'lucide-react'
import { getProductById } from '@/lib/actions/markets'
import { getPriceRecordById, updatePriceRecord } from '@/lib/actions/prices'
import { PriceRecordForm } from '@/components/admin/prices/PriceRecordForm'
import { MiraPageHeader } from '@/components/mira/MiraPageHeader'

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
    <div className="w-full space-y-6 p-4 md:p-6 xl:p-8">
      <MiraPageHeader icon={LineChart} title="Editar registro de precio" subtitle={`${product.name} · ${record.recorded_at}`} />
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

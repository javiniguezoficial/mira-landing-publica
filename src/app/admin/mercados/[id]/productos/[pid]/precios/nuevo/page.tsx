import { notFound } from 'next/navigation'
import { LineChart } from 'lucide-react'
import { getProductById } from '@/lib/actions/markets'
import { createPriceRecord } from '@/lib/actions/prices'
import { PriceRecordForm } from '@/components/admin/prices/PriceRecordForm'
import { MiraPageHeader } from '@/components/mira/MiraPageHeader'

export default async function NuevoPrecioPage({
  params,
}: {
  params: Promise<{ id: string; pid: string }>
}) {
  const { id, pid } = await params
  const product = await getProductById(pid)
  if (!product) notFound()

  return (
    <div className="w-full space-y-6 p-4 md:p-6 xl:p-8">
      <MiraPageHeader icon={LineChart} title="Nuevo registro de precio" subtitle={product.name} />
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

import { notFound } from 'next/navigation'
import { LineChart } from 'lucide-react'
import { getMarketById, getCategories, updateMarket } from '@/lib/actions/markets'
import { MarketForm } from '@/components/admin/markets/MarketForm'
import { MiraPageHeader } from '@/components/mira/MiraPageHeader'

export default async function EditarMercadoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [market, categories] = await Promise.all([getMarketById(id), getCategories()])
  if (!market) notFound()

  return (
    <div className="w-full space-y-6 p-4 md:p-6 xl:p-8">
      <MiraPageHeader icon={LineChart} title="Editar mercado" subtitle={market.name} />
      <MarketForm
        initial={market}
        categories={categories}
        onSave={async (form) => {
          'use server'
          await updateMarket(id, form)
        }}
      />
    </div>
  )
}

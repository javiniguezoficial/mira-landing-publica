import { LineChart } from 'lucide-react'
import { getCategories, createMarket } from '@/lib/actions/markets'
import { MarketForm } from '@/components/admin/markets/MarketForm'
import { MiraPageHeader } from '@/components/mira/MiraPageHeader'

export default async function NuevoMercadoPage() {
  const categories = await getCategories()

  return (
    <div className="w-full space-y-6 p-4 md:p-6 xl:p-8">
      <MiraPageHeader icon={LineChart} title="Nuevo mercado" subtitle="Añade un mercado a una categoría" />
      <MarketForm
        categories={categories}
        onSave={async (form) => {
          'use server'
          await createMarket(form)
        }}
      />
    </div>
  )
}

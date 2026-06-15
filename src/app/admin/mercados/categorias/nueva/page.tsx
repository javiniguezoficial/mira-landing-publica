import { Layers } from 'lucide-react'
import { CategoryForm } from '@/components/admin/markets/CategoryForm'
import { createCategory, getStrategicMarkets } from '@/lib/actions/markets'
import { MiraPageHeader } from '@/components/mira/MiraPageHeader'

export default async function NuevaCategoriaPage() {
  const strategicMarkets = await getStrategicMarkets()
  return (
    <div className="w-full space-y-6 p-4 md:p-6 xl:p-8">
      <MiraPageHeader icon={Layers} title="Nueva categoría" subtitle="Añade una categoría de mercado" />
      <CategoryForm
        strategicMarkets={strategicMarkets}
        onSave={async (form) => {
          'use server'
          await createCategory(form)
        }}
      />
    </div>
  )
}

import { getCategories, createMarket } from '@/lib/actions/markets'
import { MarketForm } from '@/components/admin/markets/MarketForm'

export default async function NuevoMercadoPage() {
  const categories = await getCategories()

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-heading font-bold text-slate-900">Nuevo mercado</h1>
        <p className="text-slate-500 font-body text-sm mt-1">Añade un mercado a una categoría</p>
      </div>
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

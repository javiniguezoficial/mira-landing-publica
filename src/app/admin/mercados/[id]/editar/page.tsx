import { notFound } from 'next/navigation'
import { getMarketById, getCategories, updateMarket } from '@/lib/actions/markets'
import { MarketForm } from '@/components/admin/markets/MarketForm'

export default async function EditarMercadoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [market, categories] = await Promise.all([getMarketById(id), getCategories()])
  if (!market) notFound()

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-heading font-bold text-slate-900">Editar mercado</h1>
        <p className="text-slate-500 font-body text-sm mt-1">{market.name}</p>
      </div>
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

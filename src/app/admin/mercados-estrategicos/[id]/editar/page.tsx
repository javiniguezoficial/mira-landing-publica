import { notFound } from 'next/navigation'
import { Globe2 } from 'lucide-react'
import { StrategicMarketForm } from '@/components/admin/markets/StrategicMarketForm'
import { getStrategicMarketById, updateStrategicMarket } from '@/lib/actions/markets'
import { MiraPageHeader } from '@/components/mira/MiraPageHeader'

export default async function EditarMercadoEstrategicoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const strategicMarket = await getStrategicMarketById(id)
  if (!strategicMarket) notFound()

  return (
    <div className="w-full space-y-6 p-4 md:p-6 xl:p-8">
      <MiraPageHeader icon={Globe2} title="Editar mercado estratégico" subtitle={strategicMarket.name} />
      <StrategicMarketForm
        initial={strategicMarket}
        onSave={async (form) => {
          'use server'
          await updateStrategicMarket(id, form)
        }}
      />
    </div>
  )
}

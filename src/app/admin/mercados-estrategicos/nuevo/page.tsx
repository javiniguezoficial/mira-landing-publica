import { Globe2 } from 'lucide-react'
import { StrategicMarketForm } from '@/components/admin/markets/StrategicMarketForm'
import { createStrategicMarket } from '@/lib/actions/markets'
import { MiraPageHeader } from '@/components/mira/MiraPageHeader'

export default function NuevoMercadoEstrategicoPage() {
  return (
    <div className="w-full space-y-6 p-4 md:p-6 xl:p-8">
      <MiraPageHeader icon={Globe2} title="Nuevo mercado estratégico" subtitle="Añade un mercado estratégico" />
      <StrategicMarketForm
        onSave={async (form) => {
          'use server'
          await createStrategicMarket(form)
        }}
      />
    </div>
  )
}

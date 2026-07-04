import Link from 'next/link'
import { ArrowLeft, LineChart } from 'lucide-react'
import { getPricingTree } from '@/lib/actions/prices'
import { ManualPriceForm } from '@/components/admin/prices/ManualPriceForm'
import { MiraPageHeader } from '@/components/mira/MiraPageHeader'

export const dynamic = 'force-dynamic'

export default async function NuevoPrecioGlobalPage() {
  const hierarchy = await getPricingTree()

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-4 md:p-6 xl:p-8">
      <div>
        <Link href="/admin/precios" className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-mira-magenta">
          <ArrowLeft size={14} />
          Volver a precios
        </Link>
        <MiraPageHeader
          icon={LineChart}
          title="Añadir precio"
          subtitle="Alta manual de un registro de precio para una referencia de Pricing"
        />
      </div>

      <ManualPriceForm hierarchy={hierarchy} />
    </div>
  )
}

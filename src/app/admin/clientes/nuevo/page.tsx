import Link from 'next/link'
import { ChevronLeft, Building2 } from 'lucide-react'
import { getPlans } from '@/lib/actions/organizations'
import { ClientForm } from '@/components/admin/clients/ClientForm'
import { MiraPageHeader } from '@/components/mira/MiraPageHeader'

export const dynamic = 'force-dynamic'

export default async function NuevoClientePage() {
  const plans = await getPlans()

  return (
    <div className="w-full max-w-4xl space-y-6 p-4 md:p-6 xl:p-8">
      <div>
        <Link
          href="/admin/clientes"
          className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 transition-colors hover:text-mira-magenta"
        >
          <ChevronLeft size={14} />
          Volver a clientes
        </Link>
        <MiraPageHeader
          icon={Building2}
          title="Nueva organización"
          subtitle="Registra una nueva empresa u organización en la plataforma"
        />
      </div>

      <ClientForm plans={plans} mode="create" />
    </div>
  )
}

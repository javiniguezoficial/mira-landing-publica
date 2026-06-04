import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { getPlans } from '@/lib/actions/organizations'
import { ClientForm } from '@/components/admin/clients/ClientForm'

export const dynamic = 'force-dynamic'

export default async function NuevoClientePage() {
  const plans = await getPlans()

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-8">
        <Link
          href="/admin/clientes"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 mb-4 transition-colors"
        >
          <ChevronLeft size={14} />
          Volver a clientes
        </Link>
        <h1 className="text-2xl font-heading font-bold text-slate-900">Nueva organización</h1>
        <p className="text-slate-500 font-body text-sm mt-1">
          Registra una nueva empresa u organización en la plataforma
        </p>
      </div>

      <ClientForm plans={plans} mode="create" />
    </div>
  )
}

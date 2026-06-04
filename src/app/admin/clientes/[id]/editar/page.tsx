import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft } from 'lucide-react'
import { getOrganizationById, getPlans } from '@/lib/actions/organizations'
import { ClientForm } from '@/components/admin/clients/ClientForm'

export const dynamic = 'force-dynamic'

export default async function EditarClientePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [org, plans] = await Promise.all([getOrganizationById(id), getPlans()])
  if (!org) notFound()

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-8">
        <Link
          href={`/admin/clientes/${id}`}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-800 mb-4 transition-colors"
        >
          <ChevronLeft size={14} />
          Volver al detalle
        </Link>
        <h1 className="text-2xl font-heading font-bold text-slate-900">Editar organización</h1>
        <p className="text-slate-500 font-body text-sm mt-1">{org.name}</p>
      </div>

      <ClientForm org={org} plans={plans} mode="edit" />
    </div>
  )
}

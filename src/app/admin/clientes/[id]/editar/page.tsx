import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ChevronLeft, Building2 } from 'lucide-react'
import { getOrganizationById, getPlans } from '@/lib/actions/organizations'
import { ClientForm } from '@/components/admin/clients/ClientForm'
import { MiraPageHeader } from '@/components/mira/MiraPageHeader'

export const dynamic = 'force-dynamic'

export default async function EditarClientePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [org, plans] = await Promise.all([getOrganizationById(id), getPlans()])
  if (!org) notFound()

  return (
    <div className="w-full max-w-4xl space-y-6 p-4 md:p-6 xl:p-8">
      <div>
        <Link
          href={`/admin/clientes/${id}`}
          className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 transition-colors hover:text-mira-magenta"
        >
          <ChevronLeft size={14} />
          Volver al detalle
        </Link>
        <MiraPageHeader icon={Building2} title="Editar organización" subtitle={org.name} />
      </div>

      <ClientForm org={org} plans={plans} mode="edit" />
    </div>
  )
}

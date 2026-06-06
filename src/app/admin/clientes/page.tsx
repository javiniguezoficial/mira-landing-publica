import Link from 'next/link'
import { Plus, Building2 } from 'lucide-react'
import { getOrganizations } from '@/lib/actions/organizations'
import { ClientsTable } from '@/components/admin/clients/ClientsTable'
import { MiraPageHeader } from '@/components/mira/MiraPageHeader'
import { miraBtn } from '@/lib/miraButtons'

export const dynamic = 'force-dynamic'

export default async function ClientesPage() {
  const orgs = await getOrganizations()

  return (
    <div className="w-full space-y-6 p-4 md:p-6 xl:p-8">
      <MiraPageHeader
        icon={Building2}
        title="Clientes"
        subtitle="Gestión de organizaciones registradas en la plataforma"
        actions={
          <Link href="/admin/clientes/nuevo" className={miraBtn.primary}>
            <Plus size={16} /> Nueva organización
          </Link>
        }
      />

      <ClientsTable orgs={orgs} />
    </div>
  )
}

import Link from 'next/link'
import { Plus } from 'lucide-react'
import { getOrganizations } from '@/lib/actions/organizations'
import { ClientsTable } from '@/components/admin/clients/ClientsTable'

export const dynamic = 'force-dynamic'

export default async function ClientesPage() {
  const orgs = await getOrganizations()

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-heading font-bold text-slate-900">Clientes</h1>
          <p className="text-slate-500 font-body text-sm mt-1">
            Gestión de organizaciones registradas en la plataforma
          </p>
        </div>
        <Link
          href="/admin/clientes/nuevo"
          className="inline-flex items-center gap-2 px-4 py-2 bg-mira-primary text-white text-sm font-bold rounded-lg hover:bg-mira-primary/90 transition-colors"
        >
          <Plus size={16} />
          Nueva organización
        </Link>
      </div>

      <ClientsTable orgs={orgs} />
    </div>
  )
}

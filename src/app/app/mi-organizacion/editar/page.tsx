import { getMyOrganization } from '@/lib/queries/my-organization'
import { updateOrgBasic } from '@/lib/actions/my-organization'
import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { ArrowLeft, Building2, Loader2 } from 'lucide-react'
import { OrgEditForm } from './OrgEditForm'
import { isOwner } from '@/lib/identity'

export default async function EditarMiOrganizacionPage() {
  const result = await getMyOrganization()

  if (result.status === 'no_org') notFound()

  // Solo el propietario puede acceder. isOwner() acepta el rol canónico
  // ('owner') y el legacy ('client_owner') durante la transición.
  if (!isOwner(result.userRole)) redirect('/app/mi-organizacion')

  const { org } = result

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="mb-6">
        <Link href="/app/mi-organizacion" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4">
          <ArrowLeft size={15} /> Volver a mi organización
        </Link>
        <div className="flex items-center gap-3">
          <Building2 className="text-mira-magenta" size={22} />
          <div>
            <h1 className="text-2xl font-display font-bold text-slate-900">Editar datos de contacto</h1>
            <p className="text-sm text-slate-500">{org.name}</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <p className="text-xs text-slate-400 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 mb-6">
          Solo puedes editar los datos de contacto y ubicación. Para cambios en el plan, nombre o datos fiscales, contacta con soporte.
        </p>
        <OrgEditForm action={updateOrgBasic} defaultValues={org} />
      </div>
    </div>
  )
}

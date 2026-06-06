import { MapPin } from 'lucide-react'
import { listSuppliers } from '@/lib/actions/suppliers'
import { SupplierListClient } from '@/components/app/suppliers/SupplierListClient'
import { MiraPageHeader } from '@/components/mira/MiraPageHeader'

export default async function ClientSuppliersPage() {
  // RLS garantiza que solo se devuelven proveedores activos para usuarios autenticados
  const suppliers = await listSuppliers(true)

  return (
    <div className="w-full space-y-6 p-4 md:p-6 xl:p-8">
      <MiraPageHeader
        icon={MapPin}
        title="Proveedores"
        subtitle="Encuentra y compara proveedores activos en la plataforma"
      />
      <SupplierListClient suppliers={suppliers} />
    </div>
  )
}

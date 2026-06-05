import { listSuppliers } from '@/lib/actions/suppliers'
import { SupplierListClient } from '@/components/app/suppliers/SupplierListClient'

export default async function ClientSuppliersPage() {
  // RLS garantiza que solo se devuelven proveedores activos para usuarios autenticados
  const suppliers = await listSuppliers(true)

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-heading font-bold text-slate-900">Proveedores</h1>
        <p className="text-sm text-slate-500 mt-1">
          Directorio de proveedores activos en la plataforma
        </p>
      </div>

      <SupplierListClient suppliers={suppliers} />
    </div>
  )
}

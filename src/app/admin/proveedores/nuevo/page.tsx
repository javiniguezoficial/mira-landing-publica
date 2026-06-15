import Link from 'next/link'
import { ArrowLeft, Truck } from 'lucide-react'
import { redirect } from 'next/navigation'
import { createSupplier } from '@/lib/actions/suppliers'
import { getMarkets } from '@/lib/actions/markets'
import { SupplierForm } from '@/components/admin/suppliers/SupplierForm'
import { MiraPageHeader } from '@/components/mira/MiraPageHeader'

export default async function NewSupplierPage() {
  const markets = await getMarkets()
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-4 md:p-6 xl:p-8">
      <div>
        <Link href="/admin/proveedores" className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-mira-magenta">
          <ArrowLeft size={14} />
          Volver a proveedores
        </Link>
        <MiraPageHeader icon={Truck} title="Nuevo proveedor" subtitle="Añade un proveedor al catálogo" />
      </div>

      <SupplierForm
        markets={markets.map((m) => ({ id: m.id, name: m.name }))}
        submitLabel="Crear proveedor"
        cancelHref="/admin/proveedores"
        onSubmit={async (data) => {
          'use server'
          const { id } = await createSupplier(data)
          redirect(`/admin/proveedores/${id}`)
        }}
      />
    </div>
  )
}

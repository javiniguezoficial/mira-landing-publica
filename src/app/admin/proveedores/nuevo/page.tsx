import Link from 'next/link'
import { ArrowLeft, Truck } from 'lucide-react'
import { redirect } from 'next/navigation'
import { createSupplier } from '@/lib/actions/suppliers'
import { getMarkets } from '@/lib/actions/markets'
import { getActiveSupplierTaxonomyTree } from '@/lib/actions/supplier-taxonomy'
import { SupplierForm } from '@/components/admin/suppliers/SupplierForm'
import { MiraPageHeader } from '@/components/mira/MiraPageHeader'

export default async function NewSupplierPage() {
  const [markets, taxonomyTree] = await Promise.all([getMarkets(), getActiveSupplierTaxonomyTree()])
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
        taxonomyTree={taxonomyTree}
        submitLabel="Crear proveedor"
        cancelHref="/admin/proveedores"
        onSubmit={async (data) => {
          'use server'
          const result = await createSupplier(data)
          if ('error' in result) return result
          redirect(`/admin/proveedores/${result.id}`)
        }}
      />
    </div>
  )
}

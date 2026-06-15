import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Truck } from 'lucide-react'
import { getSupplier, updateSupplier } from '@/lib/actions/suppliers'
import { getMarkets } from '@/lib/actions/markets'
import { SupplierForm } from '@/components/admin/suppliers/SupplierForm'
import { MiraPageHeader } from '@/components/mira/MiraPageHeader'

export default async function EditSupplierPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [supplier, markets] = await Promise.all([getSupplier(id), getMarkets()])
  if (!supplier) notFound()

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-4 md:p-6 xl:p-8">
      <div>
        <Link href={`/admin/proveedores/${id}`} className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-mira-magenta">
          <ArrowLeft size={14} />
          Volver al detalle
        </Link>
        <MiraPageHeader icon={Truck} title="Editar proveedor" subtitle={supplier.name} />
      </div>

      <SupplierForm
          markets={markets.map((m) => ({ id: m.id, name: m.name }))}
          defaultValues={{
            name:        supplier.name,
            email:       supplier.email ?? '',
            phone:       supplier.phone ?? '',
            website:     supplier.website ?? '',
            tax_id:      supplier.tax_id ?? '',
            country:     supplier.country,
            region:      supplier.region ?? '',
            city:        supplier.city ?? '',
            postal_code: supplier.postal_code ?? '',
            address:     supplier.address ?? '',
            latitude:    supplier.latitude,
            longitude:   supplier.longitude,
            category:    supplier.category ?? '',
            market_id:   supplier.market_id ?? '',
            family:      supplier.family ?? '',
            subfamily:   supplier.subfamily ?? '',
            produccion:  supplier.produccion ?? '',
            medida:      supplier.medida ?? '',
            notes:       supplier.notes ?? '',
            is_active:   supplier.is_active,
          }}
          submitLabel="Guardar cambios"
          cancelHref={`/admin/proveedores/${id}`}
          onSubmit={async (data) => {
            'use server'
            await updateSupplier(id, data)
            redirect(`/admin/proveedores/${id}`)
          }}
        />
    </div>
  )
}

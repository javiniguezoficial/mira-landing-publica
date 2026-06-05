import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getSupplier, updateSupplier } from '@/lib/actions/suppliers'
import { SupplierForm } from '@/components/admin/suppliers/SupplierForm'

export default async function EditSupplierPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supplier = await getSupplier(id)
  if (!supplier) notFound()

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <Link href={`/admin/proveedores/${id}`} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-6">
        <ArrowLeft size={14} />
        Volver al detalle
      </Link>
      <h1 className="text-2xl font-heading font-bold text-slate-900 mb-6">Editar proveedor</h1>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <SupplierForm
          defaultValues={{
            name:      supplier.name,
            email:     supplier.email ?? '',
            phone:     supplier.phone ?? '',
            website:   supplier.website ?? '',
            tax_id:    supplier.tax_id ?? '',
            country:   supplier.country,
            region:    supplier.region ?? '',
            city:      supplier.city ?? '',
            address:   supplier.address ?? '',
            latitude:  supplier.latitude,
            longitude: supplier.longitude,
            category:  supplier.category ?? '',
            notes:     supplier.notes ?? '',
            is_active: supplier.is_active,
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
    </div>
  )
}

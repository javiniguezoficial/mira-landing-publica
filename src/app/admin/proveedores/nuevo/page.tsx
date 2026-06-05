import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { redirect } from 'next/navigation'
import { createSupplier } from '@/lib/actions/suppliers'
import { SupplierForm } from '@/components/admin/suppliers/SupplierForm'

export default function NewSupplierPage() {
  return (
    <div className="p-8 max-w-3xl mx-auto">
      <Link href="/admin/proveedores" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-6">
        <ArrowLeft size={14} />
        Volver a proveedores
      </Link>
      <h1 className="text-2xl font-heading font-bold text-slate-900 mb-6">Nuevo proveedor</h1>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <SupplierForm
          submitLabel="Crear proveedor"
          cancelHref="/admin/proveedores"
          onSubmit={async (data) => {
            'use server'
            const { id } = await createSupplier(data)
            redirect(`/admin/proveedores/${id}`)
          }}
        />
      </div>
    </div>
  )
}

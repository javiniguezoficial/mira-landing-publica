import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Pencil } from 'lucide-react'
import { getSupplier } from '@/lib/actions/suppliers'

function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div>
      <dt className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-0.5">{label}</dt>
      <dd className="text-sm text-slate-800">{value}</dd>
    </div>
  )
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })
}

export default async function AdminSupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supplier = await getSupplier(id)
  if (!supplier) notFound()

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <Link href="/admin/proveedores" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4">
        <ArrowLeft size={14} />
        Volver a proveedores
      </Link>

      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-heading font-bold text-slate-900">{supplier.name}</h1>
          <p className="text-sm text-slate-500 mt-1">Creado el {formatDate(supplier.created_at)}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${supplier.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
            {supplier.is_active ? 'Activo' : 'Inactivo'}
          </span>
          <Link
            href={`/admin/proveedores/${id}/editar`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-slate-300 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-50 transition-colors"
          >
            <Pencil size={12} />
            Editar
          </Link>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <dl className="grid grid-cols-2 gap-5">
          <Field label="Email" value={supplier.email} />
          <Field label="Teléfono" value={supplier.phone} />
          <Field label="Web" value={supplier.website} />
          <Field label="NIF / CIF" value={supplier.tax_id} />
          <Field label="País" value={supplier.country} />
          <Field label="Región" value={supplier.region} />
          <Field label="Ciudad" value={supplier.city} />
          <Field label="Categoría" value={supplier.category} />
          <div className="col-span-2">
            <Field label="Dirección" value={supplier.address} />
          </div>
          {(supplier.latitude != null || supplier.longitude != null) && (
            <div className="col-span-2">
              <dt className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-0.5">Coordenadas</dt>
              <dd className="text-sm text-slate-800">
                {supplier.latitude}, {supplier.longitude}
              </dd>
            </div>
          )}
          {supplier.notes && (
            <div className="col-span-2">
              <Field label="Notas" value={supplier.notes} />
            </div>
          )}
        </dl>
      </div>
    </div>
  )
}

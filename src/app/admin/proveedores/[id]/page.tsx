import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Pencil, Truck } from 'lucide-react'
import { getSupplier } from '@/lib/actions/suppliers'
import { MiraPageHeader } from '@/components/mira/MiraPageHeader'
import { miraBtn } from '@/lib/miraButtons'

function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null
  return (
    <div>
      <dt className="mb-0.5 text-xs font-bold uppercase tracking-wider text-slate-400">{label}</dt>
      <dd className="text-sm text-mira-ink">{value}</dd>
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
    <div className="mx-auto w-full max-w-3xl space-y-6 p-4 md:p-6 xl:p-8">
      <div>
        <Link href="/admin/proveedores" className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-mira-magenta">
          <ArrowLeft size={14} />
          Volver a proveedores
        </Link>
        <MiraPageHeader
          icon={Truck}
          title={supplier.name}
          subtitle={`Creado el ${formatDate(supplier.created_at)}`}
          actions={
            <>
              <span className={`rounded-lg px-2 py-0.5 text-xs font-bold ${supplier.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                {supplier.is_active ? 'Activo' : 'Inactivo'}
              </span>
              <Link href={`/admin/proveedores/${id}/editar`} className={miraBtn.ghost}>
                <Pencil size={12} />
                Editar
              </Link>
            </>
          }
        />
      </div>

      <div className="mira-card rounded-2xl p-5 sm:p-6">
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
              <dt className="mb-0.5 text-xs font-bold uppercase tracking-wider text-slate-400">Coordenadas</dt>
              <dd className="text-sm text-mira-ink">
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

import { notFound, redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getRfq, publishRfq, cancelRfq, listActiveProducts, updateDraftRfq } from '@/lib/actions/rfqs'
import { RfqStatusBadge } from '@/components/app/rfqs/RfqStatusBadge'
import { RfqForm } from '@/components/app/rfqs/RfqForm'

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null
  return (
    <div>
      <dt className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-0.5">{label}</dt>
      <dd className="text-sm text-slate-800">{value}</dd>
    </div>
  )
}

export default async function ClientRfqDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const rfq = await getRfq(id)
  if (!rfq) notFound()

  const product = Array.isArray(rfq.product) ? rfq.product[0] : rfq.product
  const market = product && (Array.isArray((product as any).market) ? (product as any).market[0] : (product as any).market)
  const isDraft = rfq.status === 'draft'

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <div className="mb-6">
        <Link
          href="/app/rfqs"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4"
        >
          <ArrowLeft size={14} />
          Volver a cotizaciones
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-heading font-bold text-slate-900">
              {product?.name ?? 'Cotización'}
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              {market?.name ?? ''} · {formatDate(rfq.created_at)}
            </p>
          </div>
          <RfqStatusBadge status={rfq.status} />
        </div>
      </div>

      {/* Detalle */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 mb-6">
        <dl className="grid grid-cols-2 gap-5">
          <Field label="Producto" value={product?.name} />
          <Field label="Cantidad" value={`${rfq.quantity.toLocaleString('es-ES')} ${rfq.unit}`} />
          <Field label="Fecha límite" value={formatDate(rfq.deadline)} />
          <Field label="País" value={rfq.country} />
          {rfq.region && <Field label="Región" value={rfq.region} />}
          {rfq.notes && <Field label="Notas" value={rfq.notes} />}
          {rfq.conditions && <Field label="Condiciones" value={rfq.conditions} />}
        </dl>
      </div>

      {/* Acciones de borrador */}
      {isDraft && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 mb-6">
          <h2 className="text-sm font-semibold text-blue-800 mb-1">Esta RFQ está en borrador</h2>
          <p className="text-xs text-blue-700 mb-4">
            Publícala para que quede registrada como solicitud abierta.
          </p>
          <div className="flex items-center gap-3">
            <form
              action={async () => {
                'use server'
                await publishRfq(id)
                revalidatePath(`/app/rfqs/${id}`)
                revalidatePath('/app/rfqs')
                redirect(`/app/rfqs/${id}`)
              }}
            >
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 transition-colors"
              >
                Publicar RFQ
              </button>
            </form>
            <form
              action={async () => {
                'use server'
                await cancelRfq(id)
                revalidatePath(`/app/rfqs/${id}`)
                revalidatePath('/app/rfqs')
                redirect(`/app/rfqs/${id}`)
              }}
            >
              <button
                type="submit"
                className="px-4 py-2 border border-slate-300 text-slate-600 rounded-lg text-sm font-semibold hover:bg-slate-100 transition-colors"
              >
                Cancelar borrador
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Edición en draft */}
      {isDraft && (
        <div className="bg-white rounded-xl border border-slate-200 p-6">
          <h2 className="text-base font-semibold text-slate-800 mb-5">Editar borrador</h2>
          <RfqFormWrapper rfqId={id} rfq={rfq} />
        </div>
      )}
    </div>
  )
}

// Wrapper server component para pasar productos al formulario de edición
async function RfqFormWrapper({ rfqId, rfq }: { rfqId: string; rfq: any }) {
  const products = await listActiveProducts()
  const product = Array.isArray(rfq.product) ? rfq.product[0] : rfq.product

  return (
    <RfqForm
      products={products}
      defaultValues={{
        product_id: rfq.product_id,
        quantity: rfq.quantity,
        unit: rfq.unit,
        deadline: rfq.deadline,
        country: rfq.country,
        region: rfq.region ?? '',
        notes: rfq.notes ?? '',
        conditions: rfq.conditions ?? '',
      }}
      onSubmit={async (data) => {
        'use server'
        await updateDraftRfq(rfqId, data)
      }}
      submitLabel="Guardar cambios"
      cancelHref="/app/rfqs"
    />
  )
}

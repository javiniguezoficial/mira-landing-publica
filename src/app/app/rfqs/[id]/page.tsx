import { notFound, redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getRfq, publishRfq, cancelRfq, listActiveProducts, updateDraftRfq } from '@/lib/actions/rfqs'
import { MiraStatusBadge } from '@/components/mira/MiraStatusBadge'
import { MiraFormCard } from '@/components/mira/MiraFormCard'
import { RfqForm } from '@/components/app/rfqs/RfqForm'
import { RfqResponsesClient } from '@/components/app/rfqs/RfqResponsesClient'
import { miraBtn } from '@/lib/miraButtons'

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null
  return (
    <div>
      <dt className="mb-0.5 text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
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
    <div className="mx-auto w-full max-w-3xl space-y-6 p-4 md:p-6 xl:p-8">
      <div>
        <Link href="/app/rfqs" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition-colors hover:text-mira-magenta">
          <ArrowLeft size={14} /> Volver a cotizaciones
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-mira-ink">{product?.name ?? 'Cotización'}</h1>
            <p className="mt-1 text-sm text-slate-500">{market?.name ?? ''} · {formatDate(rfq.created_at)}</p>
          </div>
          <MiraStatusBadge status={rfq.status} kind="rfq" className="px-2.5 py-1 text-xs" />
        </div>
      </div>

      {/* Detalle */}
      <div className="mira-card rounded-2xl p-6">
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

      {/* Respuestas recibidas — solo si no es borrador */}
      {!isDraft && <RfqResponsesClient rfqId={id} />}

      {/* Acciones de borrador */}
      {isDraft && (
        <div className="rounded-2xl border border-mira-magenta/20 bg-mira-magenta-soft/50 p-5">
          <h2 className="mb-1 text-sm font-black text-mira-ink">Esta RFQ está en borrador</h2>
          <p className="mb-4 text-xs text-slate-600">Publícala para que quede registrada como solicitud abierta.</p>
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
              <button type="submit" className={miraBtn.primary}>Publicar RFQ</button>
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
              <button type="submit" className={miraBtn.ghost}>Cancelar borrador</button>
            </form>
          </div>
        </div>
      )}

      {/* Edición en draft */}
      {isDraft && (
        <MiraFormCard title="Editar borrador">
          <RfqFormWrapper rfqId={id} rfq={rfq} />
        </MiraFormCard>
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

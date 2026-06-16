import { notFound, redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import Link from 'next/link'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { getRfq, publishRfq, cancelRfq, listActiveProducts, updateDraftRfq, type Rfq } from '@/lib/actions/rfqs'
import { MiraStatusBadge } from '@/components/mira/MiraStatusBadge'
import { MiraFormCard } from '@/components/mira/MiraFormCard'
import { RfqForm } from '@/components/app/rfqs/RfqForm'
import { RfqResponsesClient } from '@/components/app/rfqs/RfqResponsesClient'
import { miraBtn } from '@/lib/miraButtons'

function formatDate(d: string | null | undefined) {
  if (!d) return null
  return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })
}

const CRITICALITY_LABELS: Record<string, string> = { alto: 'Alto', medio: 'Medio', bajo: 'Bajo' }

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === '') return null
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
  const isService = rfq.rfq_kind === 'service'
  const title = isService ? (rfq.service_name ?? 'Servicio') : (product?.name ?? 'Cotización')

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-4 md:p-6 xl:p-8">
      <div>
        <Link href="/app/rfqs" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition-colors hover:text-mira-magenta">
          <ArrowLeft size={14} /> Volver a cotizaciones
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="mb-1 flex items-center gap-2">
              <span className="rounded-md bg-mira-canvas px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                {isService ? 'Servicio' : 'Producto'}
              </span>
              {rfq.criticality && (
                <span className="rounded-md bg-mira-magenta-soft px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-mira-magenta">
                  Criticidad {CRITICALITY_LABELS[rfq.criticality]}
                </span>
              )}
            </div>
            <h1 className="text-2xl font-black tracking-tight text-mira-ink">{title}</h1>
            <p className="mt-1 text-sm text-slate-500">
              {(isService ? '' : `${market?.name ?? ''} · `)}{formatDate(rfq.created_at)}
            </p>
          </div>
          <MiraStatusBadge status={rfq.status} kind="rfq" className="px-2.5 py-1 text-xs" />
        </div>
      </div>

      {/* Detalle */}
      <div className="mira-card rounded-2xl p-6">
        <dl className="grid grid-cols-2 gap-5">
          {isService
            ? <Field label="Servicio" value={rfq.service_name} />
            : <Field label="Producto" value={product?.name} />}
          {isService && <Field label="Descripción" value={rfq.service_description} />}
          <Field label="Formato unitario" value={rfq.unit_format} />
          <Field label="Volumen estimado" value={rfq.estimated_volume?.toLocaleString('es-ES')} />
          {rfq.estimated_volume == null && rfq.quantity != null && (
            <Field label="Cantidad (heredada)" value={`${rfq.quantity.toLocaleString('es-ES')}${rfq.unit ? ` ${rfq.unit}` : ''}`} />
          )}
          <Field label="Pedido mínimo" value={rfq.min_order?.toLocaleString('es-ES')} />
          <Field label="Frecuencia de compra" value={rfq.purchase_frequency} />

          <Field label="Fecha de apertura" value={formatDate(rfq.opening_date)} />
          <Field label="Límite recepción ofertas" value={formatDate(rfq.deadline)} />
          <Field label="Fecha de adjudicación" value={formatDate(rfq.award_date)} />
          <Field label="Inicio de suministro" value={formatDate(rfq.supply_start_date)} />

          <Field label="País" value={rfq.country} />
          <Field label="Región" value={rfq.region} />
          <Field label="Ubicación de entrega" value={rfq.delivery_location} />
          <Field label="Incoterm" value={rfq.incoterm} />

          <Field label="Precio objetivo" value={rfq.target_price != null ? `${rfq.target_price.toLocaleString('es-ES')} ${rfq.sale_currency}` : null} />
          <Field label="Moneda de venta" value={rfq.sale_currency} />
          <Field label="Forma de pago" value={rfq.payment_method} />
          <Field label="Lead time" value={rfq.lead_time} />
          <Field label="Codificación interna" value={rfq.internal_code} />

          <Field
            label="Certificaciones"
            value={rfq.certifications && rfq.certifications.length > 0
              ? (
                <div className="flex flex-wrap gap-1.5">
                  {rfq.certifications.map((c) => (
                    <span key={c} className="rounded-md bg-mira-canvas px-2 py-0.5 text-xs font-semibold text-slate-600">{c}</span>
                  ))}
                </div>
              )
              : null}
          />
          <Field label="Política de sostenibilidad" value={rfq.sustainability_policy} />

          <Field
            label="Ficha técnica"
            value={rfq.technical_sheet_url
              ? (
                <a href={rfq.technical_sheet_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-mira-magenta hover:underline">
                  Ver ficha técnica <ExternalLink size={12} />
                </a>
              )
              : null}
          />
          <Field label="Notas de ficha técnica" value={rfq.technical_sheet_notes} />

          {rfq.notes && <Field label="Notas" value={rfq.notes} />}
          {rfq.conditions && <Field label="Condiciones generales" value={rfq.conditions} />}
        </dl>

        {/* Condiciones personalizadas (datos JSONB — solo render) */}
        {rfq.custom_conditions && rfq.custom_conditions.length > 0 && (
          <div className="mt-6 border-t border-mira-line pt-5">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">Condiciones personalizadas</p>
            <ul className="space-y-2">
              {rfq.custom_conditions.map((c, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="font-semibold text-slate-700">{c.label || '—'}:</span>
                  <span className="text-slate-600">{c.value || '—'}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
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
async function RfqFormWrapper({ rfqId, rfq }: { rfqId: string; rfq: Rfq }) {
  const products = await listActiveProducts()

  return (
    <RfqForm
      products={products}
      defaultValues={{
        rfq_kind: rfq.rfq_kind,
        product_id: rfq.product_id ?? '',
        service_name: rfq.service_name ?? '',
        service_description: rfq.service_description ?? '',
        unit_format: rfq.unit_format ?? '',
        opening_date: rfq.opening_date ?? '',
        deadline: rfq.deadline,
        award_date: rfq.award_date ?? '',
        supply_start_date: rfq.supply_start_date ?? '',
        country: rfq.country,
        region: rfq.region ?? '',
        delivery_location: rfq.delivery_location ?? '',
        incoterm: rfq.incoterm ?? '',
        estimated_volume: rfq.estimated_volume,
        purchase_frequency: rfq.purchase_frequency ?? '',
        target_price: rfq.target_price,
        min_order: rfq.min_order,
        sale_currency: rfq.sale_currency,
        payment_method: rfq.payment_method ?? '',
        lead_time: rfq.lead_time ?? '',
        criticality: rfq.criticality ?? '',
        internal_code: rfq.internal_code ?? '',
        certifications: rfq.certifications ?? [],
        sustainability_policy: rfq.sustainability_policy ?? '',
        technical_sheet_url: rfq.technical_sheet_url ?? '',
        technical_sheet_notes: rfq.technical_sheet_notes ?? '',
        custom_conditions: rfq.custom_conditions ?? [],
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

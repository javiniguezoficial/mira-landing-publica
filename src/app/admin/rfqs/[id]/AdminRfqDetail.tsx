'use client'

import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { ArrowLeft, FileText } from 'lucide-react'
import { getRfq, adminUpdateRfqStatus, type Rfq, type RfqStatus } from '@/lib/actions/rfqs'
import { MiraStatusBadge } from '@/components/mira/MiraStatusBadge'
import { MiraPageHeader } from '@/components/mira/MiraPageHeader'
import { miraBtn, miraField } from '@/lib/miraButtons'
import { RfqResponsesAdmin } from './RfqResponsesAdmin'

const ALL_STATUSES: { value: RfqStatus; label: string }[] = [
  { value: 'draft',     label: 'Borrador' },
  { value: 'open',      label: 'Abierta' },
  { value: 'closed',    label: 'Cerrada' },
  { value: 'awarded',   label: 'Adjudicada' },
  { value: 'cancelled', label: 'Cancelada' },
]

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })
}

function Field({ label, value }: { label: string; value?: React.ReactNode }) {
  if (!value) return null
  return (
    <div>
      <dt className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-0.5">{label}</dt>
      <dd className="text-sm text-slate-800">{value}</dd>
    </div>
  )
}

export function AdminRfqDetail({ id }: { id: string }) {
  const [rfq, setRfq] = useState<Rfq | null>(null)
  const [loading, setLoading] = useState(true)
  const [selectedStatus, setSelectedStatus] = useState<RfqStatus>('draft')
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    getRfq(id).then((data) => {
      setRfq(data)
      if (data) setSelectedStatus(data.status)
      setLoading(false)
    })
  }, [id])

  function handleStatusChange() {
    if (!rfq) return
    setError(null)
    setSuccess(false)
    startTransition(async () => {
      try {
        await adminUpdateRfqStatus(id, selectedStatus)
        setRfq((prev) => prev ? { ...prev, status: selectedStatus } : prev)
        setSuccess(true)
      } catch (err: any) {
        setError(err?.message ?? 'Error al actualizar estado')
      }
    })
  }

  if (loading) {
    return <div className="p-8 text-sm text-slate-400">Cargando…</div>
  }

  if (!rfq) {
    return (
      <div className="p-8">
        <p className="text-sm text-slate-500">RFQ no encontrada.</p>
        <Link href="/admin/rfqs" className="mt-2 inline-block text-sm text-mira-magenta hover:underline">
          ← Volver
        </Link>
      </div>
    )
  }

  const product = Array.isArray(rfq.product) ? rfq.product[0] : rfq.product
  const market = product && (Array.isArray((product as any).market) ? (product as any).market[0] : (product as any).market)
  const org = Array.isArray(rfq.organization) ? rfq.organization[0] : rfq.organization

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-4 md:p-6 xl:p-8">
      <div>
        <Link
          href="/admin/rfqs"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-mira-magenta"
        >
          <ArrowLeft size={14} />
          Volver a RFQs
        </Link>
        <MiraPageHeader
          icon={FileText}
          title={product?.name ?? 'Cotización'}
          subtitle={`${org?.name ?? '—'} · ${market?.name ?? ''} · ${formatDate(rfq.created_at)}`}
          actions={<MiraStatusBadge status={rfq.status} kind="rfq" />}
        />
      </div>

      {/* Detalle */}
      <div className="mira-card rounded-2xl p-5 sm:p-6">
        <dl className="grid grid-cols-2 gap-5">
          <Field label="Organización" value={org?.name} />
          <Field label="Producto" value={product?.name} />
          <Field label="Cantidad" value={`${rfq.quantity.toLocaleString('es-ES')} ${rfq.unit}`} />
          <Field label="Fecha límite" value={formatDate(rfq.deadline)} />
          <Field label="País" value={rfq.country} />
          {rfq.region && <Field label="Región" value={rfq.region} />}
          {rfq.notes && <Field label="Notas" value={rfq.notes} />}
          {rfq.conditions && <Field label="Condiciones" value={rfq.conditions} />}
        </dl>
      </div>

      {/* Respuestas de proveedores */}
      <RfqResponsesAdmin rfqId={id} />

      {/* Cambio de estado */}
      <div className="mira-card rounded-2xl p-5 sm:p-6">
        <h2 className="mb-4 text-base font-black text-mira-ink">Cambiar estado</h2>

        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            Estado actualizado correctamente.
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value as RfqStatus)}
            className={`${miraField} w-auto`}
          >
            {ALL_STATUSES.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <button
            onClick={handleStatusChange}
            disabled={isPending || selectedStatus === rfq.status}
            className={miraBtn.primary}
          >
            {isPending ? 'Guardando…' : 'Actualizar estado'}
          </button>
        </div>
      </div>
    </div>
  )
}

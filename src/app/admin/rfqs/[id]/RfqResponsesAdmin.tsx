'use client'

import { useEffect, useState, useTransition } from 'react'
import { Plus, Pencil } from 'lucide-react'
import {
  listRfqResponses,
  createRfqResponse,
  updateRfqResponse,
  updateRfqResponseStatus,
  type RfqResponse,
  type RfqResponseFormData,
  type RfqResponseStatus,
} from '@/lib/actions/rfq-responses'
import { listSuppliers, type Supplier } from '@/lib/actions/suppliers'
import { miraBtn, miraField, miraLabel } from '@/lib/miraButtons'

const STATUS_OPTIONS: { value: RfqResponseStatus; label: string; color: string }[] = [
  { value: 'received',    label: 'Recibida',        color: 'bg-slate-100 text-slate-700' },
  { value: 'shortlisted', label: 'Preseleccionada', color: 'bg-blue-100 text-blue-700' },
  { value: 'rejected',    label: 'Rechazada',       color: 'bg-red-100 text-red-700' },
  { value: 'accepted',    label: 'Aceptada',        color: 'bg-green-100 text-green-700' },
]

function statusLabel(s: RfqResponseStatus) {
  return STATUS_OPTIONS.find((o) => o.value === s)?.label ?? s
}
function statusColor(s: RfqResponseStatus) {
  return STATUS_OPTIONS.find((o) => o.value === s)?.color ?? ''
}

function formatDate(d: string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
}

const EMPTY_FORM: RfqResponseFormData & { supplier_id?: string } = {
  supplier_name:  '',
  supplier_email: '',
  supplier_phone: '',
  price:          0,
  unit:           '',
  currency:       'EUR',
  delivery_date:  '',
  payment_terms:  '',
  notes:          '',
  status:         'received',
  supplier_id:    '',
}

const inputCls = miraField

function ResponseForm({
  initial,
  suppliers,
  onSave,
  onCancel,
  saving,
  error,
}: {
  initial: RfqResponseFormData & { supplier_id?: string }
  suppliers: Supplier[]
  onSave: (data: RfqResponseFormData & { supplier_id?: string }) => void
  onCancel: () => void
  saving: boolean
  error: string | null
}) {
  const [form, setForm] = useState({ ...initial })

  function set(field: string, value: string | number) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function handleSupplierSelect(supplierId: string) {
    if (!supplierId) {
      setForm((prev) => ({ ...prev, supplier_id: '' }))
      return
    }
    const s = suppliers.find((s) => s.id === supplierId)
    if (!s) return
    // Autocompleta el snapshot pero deja al usuario editarlo
    setForm((prev) => ({
      ...prev,
      supplier_id:    s.id,
      supplier_name:  s.name,
      supplier_email: s.email ?? '',
      supplier_phone: s.phone ?? '',
    }))
  }

  return (
    <div className="space-y-4 rounded-2xl border border-mira-line bg-mira-canvas/50 p-5">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="grid grid-cols-2 gap-4">
        {/* Selector de proveedor del catálogo */}
        {suppliers.length > 0 && (
          <div className="col-span-2">
            <label className={miraLabel}>
              Seleccionar del catálogo <span className="font-normal normal-case text-slate-400">(opcional — autocompleta los campos)</span>
            </label>
            <select
              value={form.supplier_id ?? ''}
              onChange={(e) => handleSupplierSelect(e.target.value)}
              className={`${inputCls} bg-white`}
            >
              <option value="">— Respuesta manual sin catálogo —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}{s.city ? ` · ${s.city}` : ''}{s.category ? ` (${s.category})` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="col-span-2">
          <label className={miraLabel}>
            Proveedor *
          </label>
          <input
            value={form.supplier_name}
            onChange={(e) => set('supplier_name', e.target.value)}
            className={inputCls}
            placeholder="Nombre del proveedor"
          />
        </div>

        <div>
          <label className={miraLabel}>Email</label>
          <input
            type="email"
            value={form.supplier_email ?? ''}
            onChange={(e) => set('supplier_email', e.target.value)}
            className={inputCls}
            placeholder="correo@proveedor.com"
          />
        </div>

        <div>
          <label className={miraLabel}>Teléfono</label>
          <input
            value={form.supplier_phone ?? ''}
            onChange={(e) => set('supplier_phone', e.target.value)}
            className={inputCls}
            placeholder="+34 600 000 000"
          />
        </div>

        <div>
          <label className={miraLabel}>Precio *</label>
          <input
            type="number" min="0.01" step="0.01"
            value={form.price || ''}
            onChange={(e) => set('price', parseFloat(e.target.value) || 0)}
            className={inputCls}
            placeholder="0.00"
          />
        </div>

        <div>
          <label className={miraLabel}>Unidad *</label>
          <input
            value={form.unit}
            onChange={(e) => set('unit', e.target.value)}
            className={inputCls}
            placeholder="kg, t, ud…"
          />
        </div>

        <div>
          <label className={miraLabel}>Moneda</label>
          <select
            value={form.currency ?? 'EUR'}
            onChange={(e) => set('currency', e.target.value)}
            className={`${inputCls} bg-white`}
          >
            <option value="EUR">EUR</option>
            <option value="USD">USD</option>
            <option value="GBP">GBP</option>
          </select>
        </div>

        <div>
          <label className={miraLabel}>Fecha de entrega</label>
          <input
            type="date"
            value={form.delivery_date ?? ''}
            onChange={(e) => set('delivery_date', e.target.value)}
            className={inputCls}
          />
        </div>

        <div className="col-span-2">
          <label className={miraLabel}>Condiciones de pago</label>
          <input
            value={form.payment_terms ?? ''}
            onChange={(e) => set('payment_terms', e.target.value)}
            className={inputCls}
            placeholder="30 días, contado, etc."
          />
        </div>

        <div className="col-span-2">
          <label className={miraLabel}>Notas</label>
          <textarea
            value={form.notes ?? ''}
            onChange={(e) => set('notes', e.target.value)}
            rows={2}
            className={`${inputCls} resize-none`}
            placeholder="Observaciones adicionales"
          />
        </div>

        <div>
          <label className={miraLabel}>Estado</label>
          <select
            value={form.status ?? 'received'}
            onChange={(e) => set('status', e.target.value as RfqResponseStatus)}
            className={`${inputCls} bg-white`}
          >
            {STATUS_OPTIONS.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center gap-3 pt-1">
        <button onClick={() => onSave(form)} disabled={saving} className={miraBtn.primary}>
          {saving ? 'Guardando…' : 'Guardar respuesta'}
        </button>
        <button onClick={onCancel} disabled={saving} className={miraBtn.ghost}>
          Cancelar
        </button>
      </div>
    </div>
  )
}

export function RfqResponsesAdmin({ rfqId }: { rfqId: string }) {
  const [responses, setResponses]     = useState<RfqResponse[]>([])
  const [suppliers, setSuppliers]     = useState<Supplier[]>([])
  const [loading, setLoading]         = useState(true)
  const [showForm, setShowForm]       = useState(false)
  const [editingId, setEditingId]     = useState<string | null>(null)
  const [isPending, startTransition]  = useTransition()
  const [formError, setFormError]     = useState<string | null>(null)

  function reload() {
    listRfqResponses(rfqId).then((data) => {
      setResponses(data)
      setLoading(false)
    })
  }

  useEffect(() => {
    reload()
    listSuppliers(true).then(setSuppliers)
  }, [rfqId])

  function handleCreate(data: RfqResponseFormData & { supplier_id?: string }) {
    setFormError(null)
    startTransition(async () => {
      try {
        await createRfqResponse(rfqId, data)
        setShowForm(false)
        reload()
      } catch (err: any) {
        setFormError(err?.message ?? 'Error al crear respuesta')
      }
    })
  }

  function handleUpdate(responseId: string, data: RfqResponseFormData & { supplier_id?: string }) {
    setFormError(null)
    startTransition(async () => {
      try {
        await updateRfqResponse(responseId, data)
        setEditingId(null)
        reload()
      } catch (err: any) {
        setFormError(err?.message ?? 'Error al actualizar respuesta')
      }
    })
  }

  function handleStatusChange(responseId: string, status: RfqResponseStatus) {
    startTransition(async () => {
      try {
        await updateRfqResponseStatus(responseId, status)
        reload()
      } catch {
        // silent
      }
    })
  }

  if (loading) {
    return (
      <div className="mira-card rounded-2xl p-6">
        <p className="text-sm text-slate-400">Cargando respuestas…</p>
      </div>
    )
  }

  return (
    <div className="mira-card rounded-2xl p-5 sm:p-6">
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-base font-black text-mira-ink">
          Respuestas de proveedores
          {responses.length > 0 && (
            <span className="ml-2 text-xs font-normal text-slate-400">({responses.length})</span>
          )}
        </h2>
        {!showForm && (
          <button
            onClick={() => { setShowForm(true); setFormError(null) }}
            className={miraBtn.primary}
          >
            <Plus size={13} />
            Nueva respuesta
          </button>
        )}
      </div>

      {showForm && (
        <div className="mb-5">
          <ResponseForm
            initial={EMPTY_FORM}
            suppliers={suppliers}
            onSave={handleCreate}
            onCancel={() => { setShowForm(false); setFormError(null) }}
            saving={isPending}
            error={formError}
          />
        </div>
      )}

      {responses.length === 0 && !showForm && (
        <p className="text-sm text-slate-400 py-2">No hay respuestas aún.</p>
      )}

      <div className="space-y-4">
        {responses.map((r) => {
          const linkedSupplier = (r as any).supplier_id
            ? suppliers.find((s) => s.id === (r as any).supplier_id)
            : null

          return (
            <div key={r.id} className="overflow-hidden rounded-2xl border border-mira-line">
              {editingId === r.id ? (
                <div className="p-4">
                  <ResponseForm
                    initial={{
                      supplier_name:  r.supplier_name,
                      supplier_email: r.supplier_email ?? '',
                      supplier_phone: r.supplier_phone ?? '',
                      price:          r.price,
                      unit:           r.unit,
                      currency:       r.currency,
                      delivery_date:  r.delivery_date ?? '',
                      payment_terms:  r.payment_terms ?? '',
                      notes:          r.notes ?? '',
                      status:         r.status,
                      supplier_id:    (r as any).supplier_id ?? '',
                    }}
                    suppliers={suppliers}
                    onSave={(data) => handleUpdate(r.id, data)}
                    onCancel={() => { setEditingId(null); setFormError(null) }}
                    saving={isPending}
                    error={editingId === r.id ? formError : null}
                  />
                </div>
              ) : (
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{r.supplier_name}</p>
                      {(r.supplier_email || r.supplier_phone) && (
                        <p className="text-xs text-slate-500 mt-0.5">
                          {[r.supplier_email, r.supplier_phone].filter(Boolean).join(' · ')}
                        </p>
                      )}
                      {linkedSupplier && (
                        <p className="mt-0.5 text-xs text-mira-magenta">Del catálogo</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor(r.status)}`}>
                        {statusLabel(r.status)}
                      </span>
                      <button
                        onClick={() => { setEditingId(r.id); setFormError(null) }}
                        className={miraBtn.icon}
                        title="Editar"
                      >
                        <Pencil size={13} />
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3 text-sm mb-3">
                    <div>
                      <span className="text-xs text-slate-500 block">Precio</span>
                      <span className="font-semibold text-slate-800">
                        {r.price.toLocaleString('es-ES', { minimumFractionDigits: 2 })} {r.currency}/{r.unit}
                      </span>
                    </div>
                    <div>
                      <span className="text-xs text-slate-500 block">Entrega</span>
                      <span className="text-slate-700">{formatDate(r.delivery_date)}</span>
                    </div>
                    <div>
                      <span className="text-xs text-slate-500 block">Pago</span>
                      <span className="text-slate-700">{r.payment_terms || '—'}</span>
                    </div>
                  </div>

                  {r.notes && (
                    <p className="text-xs text-slate-500 mb-3 italic">{r.notes}</p>
                  )}

                  <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                    <span className="text-xs text-slate-400">Cambiar estado:</span>
                    {STATUS_OPTIONS.filter((o) => o.value !== r.status).map(({ value, label, color }) => (
                      <button
                        key={value}
                        onClick={() => handleStatusChange(r.id, value)}
                        disabled={isPending}
                        className={`px-2 py-0.5 rounded-full text-xs font-medium border border-transparent hover:border-current transition-colors disabled:opacity-50 ${color}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

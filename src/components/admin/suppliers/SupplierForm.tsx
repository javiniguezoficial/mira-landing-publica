'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Truck } from 'lucide-react'
import { MiraFormCard } from '@/components/mira/MiraFormCard'
import { miraBtn, miraField, miraLabel } from '@/lib/miraButtons'
import type { SupplierFormData } from '@/lib/actions/suppliers'

interface Props {
  defaultValues?: Partial<SupplierFormData>
  onSubmit: (data: SupplierFormData) => Promise<void>
  submitLabel?: string
  cancelHref: string
}

const EMPTY: SupplierFormData = {
  name: '',
  email: '',
  phone: '',
  website: '',
  tax_id: '',
  country: 'ES',
  region: '',
  city: '',
  address: '',
  latitude: null,
  longitude: null,
  category: '',
  notes: '',
  is_active: true,
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className={miraLabel}>
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}

const inputCls = miraField

export function SupplierForm({ defaultValues, onSubmit, submitLabel = 'Guardar', cancelHref }: Props) {
  const [form, setForm] = useState<SupplierFormData>({ ...EMPTY, ...defaultValues })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function set(field: keyof SupplierFormData, value: string | number | boolean | null) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    try {
      await onSubmit(form)
    } catch (err: any) {
      setError(err?.message ?? 'Error al guardar')
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <MiraFormCard
        title="Datos del proveedor"
        icon={Truck}
        footer={
          <>
            <Link href={cancelHref} className={miraBtn.ghost}>Cancelar</Link>
            <button type="submit" disabled={saving} className={miraBtn.primary}>
              {saving ? 'Guardando…' : submitLabel}
            </button>
          </>
        }
      >
        {error && (
          <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        <div className="grid grid-cols-2 gap-5">
        <div className="col-span-2">
          <Field label="Nombre" required>
            <input value={form.name} onChange={(e) => set('name', e.target.value)} className={inputCls} placeholder="Nombre del proveedor" />
          </Field>
        </div>

        <Field label="Email">
          <input type="email" value={form.email ?? ''} onChange={(e) => set('email', e.target.value)} className={inputCls} placeholder="correo@proveedor.com" />
        </Field>

        <Field label="Teléfono">
          <input value={form.phone ?? ''} onChange={(e) => set('phone', e.target.value)} className={inputCls} placeholder="+34 600 000 000" />
        </Field>

        <Field label="Web">
          <input value={form.website ?? ''} onChange={(e) => set('website', e.target.value)} className={inputCls} placeholder="https://proveedor.com" />
        </Field>

        <Field label="NIF / CIF">
          <input value={form.tax_id ?? ''} onChange={(e) => set('tax_id', e.target.value)} className={inputCls} placeholder="B12345678" />
        </Field>

        <Field label="País">
          <input value={form.country} onChange={(e) => set('country', e.target.value)} className={inputCls} placeholder="ES" />
        </Field>

        <Field label="Región / Provincia">
          <input value={form.region ?? ''} onChange={(e) => set('region', e.target.value)} className={inputCls} placeholder="Castilla y León" />
        </Field>

        <Field label="Ciudad">
          <input value={form.city ?? ''} onChange={(e) => set('city', e.target.value)} className={inputCls} placeholder="Valladolid" />
        </Field>

        <Field label="Categoría">
          <input value={form.category ?? ''} onChange={(e) => set('category', e.target.value)} className={inputCls} placeholder="Lácteos, Cereales…" />
        </Field>

        <div className="col-span-2">
          <Field label="Dirección">
            <input value={form.address ?? ''} onChange={(e) => set('address', e.target.value)} className={inputCls} placeholder="Calle, número, CP" />
          </Field>
        </div>

        <Field label="Latitud">
          <input
            type="number" step="any"
            value={form.latitude ?? ''}
            onChange={(e) => set('latitude', e.target.value === '' ? null : parseFloat(e.target.value))}
            className={inputCls} placeholder="41.6523"
          />
        </Field>

        <Field label="Longitud">
          <input
            type="number" step="any"
            value={form.longitude ?? ''}
            onChange={(e) => set('longitude', e.target.value === '' ? null : parseFloat(e.target.value))}
            className={inputCls} placeholder="-4.7245"
          />
        </Field>

        <div className="col-span-2">
          <Field label="Notas">
            <textarea value={form.notes ?? ''} onChange={(e) => set('notes', e.target.value)} rows={3} className={`${inputCls} resize-none`} placeholder="Observaciones internas" />
          </Field>
        </div>

        <div className="col-span-2">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={form.is_active ?? true}
              onChange={(e) => set('is_active', e.target.checked)}
              className="h-4 w-4 accent-mira-magenta"
            />
            <span className="text-sm text-slate-700">Proveedor activo</span>
          </label>
        </div>
        </div>
      </MiraFormCard>
    </form>
  )
}

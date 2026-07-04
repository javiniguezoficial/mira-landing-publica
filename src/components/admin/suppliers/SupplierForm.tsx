'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Truck, ListTree, ExternalLink, AlertTriangle } from 'lucide-react'
import { MiraFormCard } from '@/components/mira/MiraFormCard'
import { miraBtn, miraField, miraLabel } from '@/lib/miraButtons'
import type { SupplierFormData, SupplierActionResult, SupplierVoidResult } from '@/lib/actions/suppliers'
import type { SupplierMarketNode } from '@/lib/actions/supplier-taxonomy'

interface Props {
  defaultValues?: Partial<SupplierFormData>
  markets?: { id: string; name: string }[]
  taxonomyTree: SupplierMarketNode[]
  onSubmit: (data: SupplierFormData) => Promise<SupplierActionResult | SupplierVoidResult>
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
  postal_code: '',
  address: '',
  latitude: null,
  longitude: null,
  category: '',
  market_id: '',
  family: '',
  subfamily: '',
  produccion: '',
  produccion_value: null,
  produccion_unit: '',
  medida: '',
  notes: '',
  is_active: true,
  supplier_market_id: '',
  supplier_category_id: '',
  supplier_family_id: '',
  supplier_subfamily_id: '',
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

export function SupplierForm({ defaultValues, markets = [], taxonomyTree, onSubmit, submitLabel = 'Guardar', cancelHref }: Props) {
  const [form, setForm] = useState<SupplierFormData>({ ...EMPTY, ...defaultValues })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Calculado una sola vez a partir de los valores iniciales (no del estado
  // en vivo) — evita que el aviso aparezca/desaparezca mientras se edita.
  const [showLegacyNotice] = useState(() =>
    !!(defaultValues?.category || defaultValues?.family || defaultValues?.subfamily || defaultValues?.market_id)
    && !defaultValues?.supplier_market_id
  )

  function set(field: keyof SupplierFormData, value: string | number | boolean | null) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  function setSupplierMarket(id: string) {
    setForm((prev) => ({ ...prev, supplier_market_id: id, supplier_category_id: '', supplier_family_id: '', supplier_subfamily_id: '' }))
  }
  function setSupplierCategory(id: string) {
    setForm((prev) => ({ ...prev, supplier_category_id: id, supplier_family_id: '', supplier_subfamily_id: '' }))
  }
  function setSupplierFamily(id: string) {
    setForm((prev) => ({ ...prev, supplier_family_id: id, supplier_subfamily_id: '' }))
  }

  const selectedMarket = useMemo(
    () => taxonomyTree.find((m) => m.id === form.supplier_market_id),
    [taxonomyTree, form.supplier_market_id]
  )
  const categories = selectedMarket?.categories ?? []
  const selectedCategory = useMemo(
    () => categories.find((c) => c.id === form.supplier_category_id),
    [categories, form.supplier_category_id]
  )
  const families = selectedCategory?.families ?? []
  const selectedFamily = useMemo(
    () => families.find((f) => f.id === form.supplier_family_id),
    [families, form.supplier_family_id]
  )
  const subfamilies = selectedFamily?.subfamilies ?? []

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    const result = await onSubmit(form)
    if (result && 'error' in result) {
      setError(result.error)
      setSaving(false)
      return
    }
    // Sin error → el server action redirige (redirect() no vuelve al cliente).
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

        <Field label="Provincia">
          <input value={form.region ?? ''} onChange={(e) => set('region', e.target.value)} className={inputCls} placeholder="Valladolid" />
        </Field>

        <Field label="Localidad">
          <input value={form.city ?? ''} onChange={(e) => set('city', e.target.value)} className={inputCls} placeholder="Medina del Campo" />
        </Field>

        <Field label="Código postal">
          <input value={form.postal_code ?? ''} onChange={(e) => set('postal_code', e.target.value)} className={inputCls} placeholder="47400" />
        </Field>

        <Field label="Producción (texto)">
          <input value={form.produccion ?? ''} onChange={(e) => set('produccion', e.target.value)} className={inputCls} placeholder="Ej. 5.000 TN (texto libre)" />
        </Field>

        <Field label="Medida">
          <input value={form.medida ?? ''} onChange={(e) => set('medida', e.target.value)} className={inputCls} placeholder="kg, TN, litro…" />
        </Field>

        <Field label="Producción (valor)">
          <input
            type="number" step="any" min="0"
            value={form.produccion_value ?? ''}
            onChange={(e) => set('produccion_value', e.target.value === '' ? null : parseFloat(e.target.value))}
            className={inputCls}
            placeholder="5000"
          />
        </Field>

        <Field label="Unidad de producción">
          <select value={form.produccion_unit ?? ''} onChange={(e) => set('produccion_unit', e.target.value)} className={inputCls}>
            <option value="">—</option>
            <option value="kg">kg</option>
            <option value="TN">TN</option>
          </select>
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

        {/* ── Taxonomía propia de proveedores (P2) ──────────────────────────── */}
        <div className="col-span-2 mt-6 rounded-2xl border border-mira-magenta/20 bg-mira-magenta-soft/30 p-5">
          <div className="mb-1 flex items-center justify-between gap-3">
            <h3 className="flex items-center gap-2 text-sm font-black text-mira-ink">
              <ListTree size={15} className="text-mira-magenta" /> Taxonomía de proveedores
            </h3>
            <Link href="/admin/proveedores/taxonomia" target="_blank" className="inline-flex items-center gap-1 text-xs font-semibold text-mira-magenta hover:underline">
              Gestionar taxonomía de proveedores <ExternalLink size={11} />
            </Link>
          </div>
          <p className="mb-4 text-xs text-slate-500">
            Esta taxonomía es propia de proveedores y no depende de Pricing.
          </p>

          {showLegacyNotice && (
            <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              Este proveedor aún usa clasificación legacy. Puedes reclasificarlo con la nueva taxonomía.
            </div>
          )}

          {taxonomyTree.length === 0 ? (
            <p className="text-sm text-slate-500">
              Todavía no hay taxonomía creada.{' '}
              <Link href="/admin/proveedores/taxonomia" target="_blank" className="font-semibold text-mira-magenta hover:underline">
                Crea el primer mercado de proveedor
              </Link>.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <Field label="Mercado">
                <select value={form.supplier_market_id ?? ''} onChange={(e) => setSupplierMarket(e.target.value)} className={inputCls}>
                  <option value="">Sin clasificar</option>
                  {taxonomyTree.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </Field>

              <Field label="Categoría">
                <select
                  value={form.supplier_category_id ?? ''}
                  onChange={(e) => setSupplierCategory(e.target.value)}
                  disabled={!selectedMarket}
                  className={inputCls}
                >
                  <option value="">{selectedMarket ? 'Sin clasificar' : 'Selecciona un mercado primero'}</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </Field>

              <Field label="Familia">
                <select
                  value={form.supplier_family_id ?? ''}
                  onChange={(e) => setSupplierFamily(e.target.value)}
                  disabled={!selectedCategory}
                  className={inputCls}
                >
                  <option value="">{selectedCategory ? 'Sin clasificar' : 'Selecciona una categoría primero'}</option>
                  {families.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                </select>
              </Field>

              <Field label="Subfamilia">
                <select
                  value={form.supplier_subfamily_id ?? ''}
                  onChange={(e) => set('supplier_subfamily_id', e.target.value)}
                  disabled={!selectedFamily}
                  className={inputCls}
                >
                  <option value="">{selectedFamily ? 'Sin clasificar' : 'Selecciona una familia primero'}</option>
                  {subfamilies.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </Field>
            </div>
          )}
        </div>

        {/* ── Clasificación legacy (Pricing) ─────────────────────────────────── */}
        <details className="col-span-2 mt-4 rounded-2xl border border-mira-line p-5">
          <summary className="cursor-pointer text-sm font-bold text-slate-500">
            Clasificación legacy (Pricing) — no es la clasificación principal
          </summary>
          <div className="mt-4 grid grid-cols-2 gap-4">
            <Field label="Categoría (legacy)">
              <input value={form.category ?? ''} onChange={(e) => set('category', e.target.value)} className={inputCls} placeholder="Lácteos, Cereales…" />
            </Field>

            <Field label="Mercado de Pricing (legacy)">
              <select value={form.market_id ?? ''} onChange={(e) => set('market_id', e.target.value)} className={inputCls}>
                <option value="">Sin mercado asignado</option>
                {markets.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </Field>

            <Field label="Familia (legacy)">
              <input value={form.family ?? ''} onChange={(e) => set('family', e.target.value)} className={inputCls} placeholder="Familia" />
            </Field>

            <Field label="Subfamilia (legacy)">
              <input value={form.subfamily ?? ''} onChange={(e) => set('subfamily', e.target.value)} className={inputCls} placeholder="Subfamilia" />
            </Field>
          </div>
        </details>
      </MiraFormCard>
    </form>
  )
}

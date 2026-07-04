'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { LineChart } from 'lucide-react'
import { MiraFormCard } from '@/components/mira/MiraFormCard'
import { miraBtn, miraField, miraLabel } from '@/lib/miraButtons'
import { createPriceManual, type PricingHierarchy, type ManualPriceFormData } from '@/lib/actions/prices'
import { PricingHierarchySelects } from './PricingHierarchySelects'

const SALE_CURRENCIES = ['EUR', 'USD', 'GBP']

export function ManualPriceForm({ hierarchy }: { hierarchy: PricingHierarchy }) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const today = new Date().toISOString().slice(0, 10)

  const [productId, setProductId] = useState('')
  const [recordedAt, setRecordedAt] = useState(today)
  const [price, setPrice] = useState('')
  const [unit, setUnit] = useState('')
  const [currency, setCurrency] = useState('EUR')
  const [country, setCountry] = useState('ES')
  const [region, setRegion] = useState('')
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [avgPrice, setAvgPrice] = useState('')
  const [sourceName, setSourceName] = useState('')
  const [notes, setNotes] = useState('')

  function handleProductChange(id: string, productUnit: string | null) {
    setProductId(id)
    if (productUnit && !unit) setUnit(productUnit)   // pre-rellena unidad desde la referencia
  }

  function num(s: string): number | null {
    const t = s.trim()
    if (t === '') return null
    const n = parseFloat(t.replace(',', '.'))
    return Number.isNaN(n) ? null : n
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (!productId) { setError('Debes seleccionar una referencia / producto'); return }
    const priceNum = num(price)
    if (priceNum == null) { setError('El precio es obligatorio y debe ser numérico'); return }

    const form: ManualPriceFormData = {
      recorded_at: recordedAt,
      price: priceNum,
      unit: unit.trim(),
      currency: currency || 'EUR',
      country: country.trim() || 'ES',
      region: region.trim() || undefined,
      min_price: num(minPrice),
      max_price: num(maxPrice),
      avg_price: num(avgPrice),
      source_name: sourceName.trim() || undefined,
      notes: notes.trim() || undefined,
    }

    startTransition(async () => {
      const result = await createPriceManual(productId, form)
      if ('error' in result) { setError(result.error); return }
      router.push('/admin/precios')
      router.refresh()
    })
  }

  return (
    <form onSubmit={handleSubmit}>
      <MiraFormCard
        title="Nuevo precio"
        icon={LineChart}
        footer={
          <>
            <a href="/admin/precios" className={miraBtn.ghost}>Cancelar</a>
            <button type="submit" disabled={isPending} className={miraBtn.primary}>
              {isPending ? 'Guardando…' : 'Guardar precio'}
            </button>
          </>
        }
      >
        {error && (
          <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        {/* Jerarquía Pricing (encadenada) */}
        <div className="mb-2 text-xs font-black uppercase tracking-wider text-mira-magenta">Referencia (Pricing)</div>
        <p className="mb-3 text-xs text-slate-500">
          Selecciona la referencia dentro de la jerarquía de Pricing. Es distinta de la taxonomía de proveedores.
        </p>
        {hierarchy.products.length === 0 ? (
          <p className="text-sm text-slate-500">
            No hay referencias activas. Crea mercados y referencias en Mercados antes de añadir precios.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <PricingHierarchySelects hierarchy={hierarchy} onProductChange={handleProductChange} />
          </div>
        )}

        {/* Datos del precio */}
        <div className="mt-6 mb-2 text-xs font-black uppercase tracking-wider text-mira-magenta">Datos del precio</div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={miraLabel}>Fecha <span className="text-red-500">*</span></label>
            <input type="date" required value={recordedAt} onChange={(e) => setRecordedAt(e.target.value)} className={miraField} />
          </div>
          <div>
            <label className={miraLabel}>Precio <span className="text-red-500">*</span></label>
            <input type="number" step="0.0001" min="0" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="1,25" className={miraField} />
          </div>
          <div>
            <label className={miraLabel}>Unidad <span className="text-red-500">*</span></label>
            <input required value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="kg, ton, MWh…" className={`${miraField} font-mono`} />
          </div>
          <div>
            <label className={miraLabel}>Moneda</label>
            <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={miraField}>
              {SALE_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className={miraLabel}>País</label>
            <input value={country} onChange={(e) => setCountry(e.target.value)} className={`${miraField} font-mono`} placeholder="ES" />
          </div>
          <div>
            <label className={miraLabel}>Región / zona <span className="text-slate-400 font-normal">(opcional)</span></label>
            <input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="Cataluña, Norte…" className={miraField} />
          </div>
          <div>
            <label className={miraLabel}>Precio mín. <span className="text-slate-400 font-normal">(opcional)</span></label>
            <input type="number" step="0.0001" min="0" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} className={miraField} />
          </div>
          <div>
            <label className={miraLabel}>Precio máx. <span className="text-slate-400 font-normal">(opcional)</span></label>
            <input type="number" step="0.0001" min="0" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} className={miraField} />
          </div>
          <div>
            <label className={miraLabel}>Precio medio <span className="text-slate-400 font-normal">(opcional)</span></label>
            <input type="number" step="0.0001" min="0" value={avgPrice} onChange={(e) => setAvgPrice(e.target.value)} className={miraField} />
          </div>
          <div>
            <label className={miraLabel}>Fuente / origen <span className="text-slate-400 font-normal">(opcional)</span></label>
            <input value={sourceName} onChange={(e) => setSourceName(e.target.value)} placeholder="Lonja, MFAO, OMIE…" className={miraField} />
          </div>
          <div className="col-span-2">
            <label className={miraLabel}>Notas <span className="text-slate-400 font-normal">(opcional)</span></label>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observaciones del registro" className={miraField} />
          </div>
        </div>
      </MiraFormCard>
    </form>
  )
}

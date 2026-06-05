'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { ProductOption, RfqFormData } from '@/lib/actions/rfqs'

const COUNTRIES = [
  { code: 'ES', name: 'España' },
  { code: 'PT', name: 'Portugal' },
  { code: 'FR', name: 'Francia' },
  { code: 'DE', name: 'Alemania' },
  { code: 'IT', name: 'Italia' },
  { code: 'NL', name: 'Países Bajos' },
]

function todayString() {
  return new Date().toISOString().split('T')[0]
}

interface Props {
  products: ProductOption[]
  defaultValues?: Partial<RfqFormData>
  onSubmit: (data: RfqFormData) => Promise<{ id: string } | void>
  submitLabel: string
  cancelHref: string
}

export function RfqForm({ products, defaultValues, onSubmit, submitLabel, cancelHref }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const [productId, setProductId] = useState(defaultValues?.product_id ?? '')
  const [quantity, setQuantity] = useState(String(defaultValues?.quantity ?? ''))
  const [unit, setUnit] = useState(defaultValues?.unit ?? '')
  const [deadline, setDeadline] = useState(defaultValues?.deadline ?? '')
  const [country, setCountry] = useState(defaultValues?.country ?? 'ES')
  const [region, setRegion] = useState(defaultValues?.region ?? '')
  const [notes, setNotes] = useState(defaultValues?.notes ?? '')
  const [conditions, setConditions] = useState(defaultValues?.conditions ?? '')

  // Auto-fill unit from selected product
  function handleProductChange(id: string) {
    setProductId(id)
    const prod = products.find((p) => p.id === id)
    if (prod && !defaultValues?.unit) setUnit(prod.unit)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const data: RfqFormData = {
      product_id: productId,
      quantity: parseFloat(quantity),
      unit: unit.trim(),
      deadline,
      country,
      region: region.trim() || undefined,
      notes: notes.trim() || undefined,
      conditions: conditions.trim() || undefined,
    }

    startTransition(async () => {
      try {
        const result = await onSubmit(data)
        if (result && 'id' in result) {
          router.push(`/app/rfqs/${result.id}`)
        } else {
          router.push('/app/rfqs')
        }
        router.refresh()
      } catch (err: any) {
        setError(err?.message ?? 'Error inesperado')
      }
    })
  }

  const grouped = products.reduce<Record<string, ProductOption[]>>((acc, p) => {
    if (!acc[p.market_name]) acc[p.market_name] = []
    acc[p.market_name].push(p)
    return acc
  }, {})

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Producto */}
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1">
          Producto <span className="text-red-500">*</span>
        </label>
        <select
          value={productId}
          onChange={(e) => handleProductChange(e.target.value)}
          required
          className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-mira-primary bg-white"
        >
          <option value="">Selecciona un producto…</option>
          {Object.entries(grouped).map(([market, prods]) => (
            <optgroup key={market} label={market}>
              {prods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.unit})
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      {/* Cantidad + Unidad */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">
            Cantidad <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            min="0.001"
            step="any"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            required
            placeholder="1000"
            className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-mira-primary"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">
            Unidad <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            required
            placeholder="kg, t, L…"
            className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-mira-primary"
          />
        </div>
      </div>

      {/* Fecha límite */}
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1">
          Fecha límite <span className="text-red-500">*</span>
        </label>
        <input
          type="date"
          value={deadline}
          min={todayString()}
          onChange={(e) => setDeadline(e.target.value)}
          required
          className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-mira-primary"
        />
      </div>

      {/* País + Región */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">
            País <span className="text-red-500">*</span>
          </label>
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            required
            className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-mira-primary bg-white"
          >
            {COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1">
            Región <span className="text-slate-400 font-normal">(opcional)</span>
          </label>
          <input
            type="text"
            value={region}
            onChange={(e) => setRegion(e.target.value)}
            placeholder="Andalucía, Castilla…"
            className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-mira-primary"
          />
        </div>
      </div>

      {/* Notas */}
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1">
          Notas <span className="text-slate-400 font-normal">(opcional)</span>
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Especificaciones adicionales, calidad requerida…"
          className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-mira-primary resize-none"
        />
      </div>

      {/* Condiciones */}
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1">
          Condiciones <span className="text-slate-400 font-normal">(opcional)</span>
        </label>
        <textarea
          value={conditions}
          onChange={(e) => setConditions(e.target.value)}
          rows={3}
          placeholder="Condiciones de pago, entrega, incoterms…"
          className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-mira-primary resize-none"
        />
      </div>

      {/* Acciones */}
      <div className="flex items-center gap-3 pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="px-5 py-2.5 bg-mira-primary text-white rounded-lg text-sm font-semibold hover:bg-mira-primary/90 disabled:opacity-50 transition-colors"
        >
          {isPending ? 'Guardando…' : submitLabel}
        </button>
        <a
          href={cancelHref}
          className="px-5 py-2.5 border border-slate-300 text-slate-700 rounded-lg text-sm font-semibold hover:bg-slate-50 transition-colors"
        >
          Cancelar
        </a>
      </div>
    </form>
  )
}

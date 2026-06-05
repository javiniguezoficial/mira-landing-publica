'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { PriceFormData } from '@/lib/actions/prices'

interface Props {
  initial?: Partial<PriceFormData> & { id?: string }
  defaultUnit: string
  onSave: (form: PriceFormData) => Promise<void>
}

export function PriceRecordForm({ initial, defaultUnit, onSave }: Props) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  const today = new Date().toISOString().slice(0, 10)

  const [form, setForm] = useState<PriceFormData>({
    price:       initial?.price       ?? 0,
    unit:        initial?.unit        ?? defaultUnit,
    currency:    initial?.currency    ?? 'EUR',
    country:     initial?.country     ?? 'ES',
    region:      initial?.region      ?? '',
    recorded_at: initial?.recorded_at ?? today,
    min_price:   initial?.min_price   ?? null,
    max_price:   initial?.max_price   ?? null,
    avg_price:   initial?.avg_price   ?? null,
    volume:      initial?.volume      ?? null,
  })

  const set = <K extends keyof PriceFormData>(k: K, v: PriceFormData[K]) =>
    setForm(f => ({ ...f, [k]: v }))

  const numOrNull = (s: string) => s.trim() === '' ? null : parseFloat(s)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await onSave(form)
      router.back()
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5 max-w-lg">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Fecha *</label>
          <input
            type="date"
            required
            value={form.recorded_at}
            onChange={e => set('recorded_at', e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-mira-primary/30"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Precio *</label>
          <input
            type="number"
            required
            step="0.0001"
            min="0"
            value={form.price}
            onChange={e => set('price', parseFloat(e.target.value) || 0)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-mira-primary/30"
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Unidad *</label>
          <input
            required
            value={form.unit}
            onChange={e => set('unit', e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-mira-primary/30"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Moneda</label>
          <input
            value={form.currency}
            onChange={e => set('currency', e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-mira-primary/30"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">País</label>
          <input
            value={form.country}
            onChange={e => set('country', e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-mira-primary/30"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-700 mb-1">Región (opcional)</label>
        <input
          value={form.region ?? ''}
          onChange={e => set('region', e.target.value)}
          placeholder="Ej: Cataluña, Norte"
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-mira-primary/30"
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Precio mín.</label>
          <input
            type="number"
            step="0.0001"
            min="0"
            value={form.min_price ?? ''}
            onChange={e => set('min_price', numOrNull(e.target.value))}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-mira-primary/30"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Precio máx.</label>
          <input
            type="number"
            step="0.0001"
            min="0"
            value={form.max_price ?? ''}
            onChange={e => set('max_price', numOrNull(e.target.value))}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-mira-primary/30"
          />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Precio medio</label>
          <input
            type="number"
            step="0.0001"
            min="0"
            value={form.avg_price ?? ''}
            onChange={e => set('avg_price', numOrNull(e.target.value))}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-mira-primary/30"
          />
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="px-5 py-2 bg-mira-primary text-white text-sm font-bold rounded-lg hover:bg-mira-primary/90 disabled:opacity-50 transition-colors"
        >
          {saving ? 'Guardando…' : 'Guardar'}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="px-5 py-2 border border-slate-200 text-slate-600 text-sm font-bold rounded-lg hover:bg-slate-50 transition-colors"
        >
          Cancelar
        </button>
      </div>
    </form>
  )
}

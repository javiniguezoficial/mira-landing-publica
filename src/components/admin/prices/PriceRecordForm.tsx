'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { LineChart } from 'lucide-react'
import { MiraFormCard } from '@/components/mira/MiraFormCard'
import { miraBtn, miraField, miraLabel } from '@/lib/miraButtons'
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
    <form onSubmit={handleSubmit} className="max-w-lg">
      <MiraFormCard
        title="Registro de precio"
        icon={LineChart}
        footer={
          <>
            <button type="button" onClick={() => router.back()} className={miraBtn.ghost}>
              Cancelar
            </button>
            <button type="submit" disabled={saving} className={miraBtn.primary}>
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </>
        }
      >
        <div className="space-y-5">
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={miraLabel}>Fecha *</label>
              <input
                type="date"
                required
                value={form.recorded_at}
                onChange={e => set('recorded_at', e.target.value)}
                className={miraField}
              />
            </div>
            <div>
              <label className={miraLabel}>Precio *</label>
              <input
                type="number"
                required
                step="0.0001"
                min="0"
                value={form.price}
                onChange={e => set('price', parseFloat(e.target.value) || 0)}
                className={miraField}
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={miraLabel}>Unidad *</label>
              <input
                required
                value={form.unit}
                onChange={e => set('unit', e.target.value)}
                className={`${miraField} font-mono`}
              />
            </div>
            <div>
              <label className={miraLabel}>Moneda</label>
              <input
                value={form.currency}
                onChange={e => set('currency', e.target.value)}
                className={`${miraField} font-mono`}
              />
            </div>
            <div>
              <label className={miraLabel}>País</label>
              <input
                value={form.country}
                onChange={e => set('country', e.target.value)}
                className={`${miraField} font-mono`}
              />
            </div>
          </div>

          <div>
            <label className={miraLabel}>Región (opcional)</label>
            <input
              value={form.region ?? ''}
              onChange={e => set('region', e.target.value)}
              placeholder="Ej: Cataluña, Norte"
              className={miraField}
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className={miraLabel}>Precio mín.</label>
              <input
                type="number"
                step="0.0001"
                min="0"
                value={form.min_price ?? ''}
                onChange={e => set('min_price', numOrNull(e.target.value))}
                className={miraField}
              />
            </div>
            <div>
              <label className={miraLabel}>Precio máx.</label>
              <input
                type="number"
                step="0.0001"
                min="0"
                value={form.max_price ?? ''}
                onChange={e => set('max_price', numOrNull(e.target.value))}
                className={miraField}
              />
            </div>
            <div>
              <label className={miraLabel}>Precio medio</label>
              <input
                type="number"
                step="0.0001"
                min="0"
                value={form.avg_price ?? ''}
                onChange={e => set('avg_price', numOrNull(e.target.value))}
                className={miraField}
              />
            </div>
          </div>
        </div>
      </MiraFormCard>
    </form>
  )
}

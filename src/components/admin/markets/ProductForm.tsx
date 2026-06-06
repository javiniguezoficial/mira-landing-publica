'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Package } from 'lucide-react'
import { MiraFormCard } from '@/components/mira/MiraFormCard'
import { miraBtn, miraField, miraLabel } from '@/lib/miraButtons'
import type { Product } from '@/lib/actions/markets'

interface Props {
  initial?: Product
  marketId: string
  marketName: string
  onSave: (form: {
    name: string; slug: string; unit: string; description: string; is_active: boolean
  }) => Promise<void>
}

function toSlug(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

const UNITS = ['kg', 'ton', 'L', 'MWh', 'unidad', 'caja', 'm3', '€/kWh']

export function ProductForm({ initial, marketName, onSave }: Props) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    slug: initial?.slug ?? '',
    unit: initial?.unit ?? 'kg',
    description: initial?.description ?? '',
    is_active: initial?.is_active ?? true,
  })

  const set = (k: keyof typeof form, v: string | boolean) =>
    setForm(f => ({ ...f, [k]: v }))

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
        title="Datos del producto"
        subtitle={`Mercado: ${marketName}`}
        icon={Package}
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

          <div>
            <label className={miraLabel}>Nombre *</label>
            <input
              required
              value={form.name}
              onChange={e => {
                set('name', e.target.value)
                if (!initial) set('slug', toSlug(e.target.value))
              }}
              className={miraField}
            />
          </div>

          <div>
            <label className={miraLabel}>Slug *</label>
            <input
              required
              value={form.slug}
              onChange={e => set('slug', e.target.value)}
              className={`${miraField} font-mono text-slate-500`}
            />
          </div>

          <div>
            <label className={miraLabel}>Unidad *</label>
            <div className="flex flex-wrap gap-2">
              {UNITS.map(u => (
                <button
                  key={u}
                  type="button"
                  onClick={() => set('unit', u)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors ${
                    form.unit === u
                      ? 'border-mira-magenta bg-mira-magenta text-white'
                      : 'border-mira-line text-slate-600 hover:bg-mira-canvas'
                  }`}
                >
                  {u}
                </button>
              ))}
              <input
                value={UNITS.includes(form.unit) ? '' : form.unit}
                onChange={e => set('unit', e.target.value)}
                placeholder="otra…"
                className={`${miraField} w-24 py-1.5 font-mono text-xs`}
              />
            </div>
          </div>

          <div>
            <label className={miraLabel}>Descripción</label>
            <textarea
              rows={3}
              value={form.description}
              onChange={e => set('description', e.target.value)}
              className={`${miraField} resize-none`}
            />
          </div>

          {initial && (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="is_active"
                checked={form.is_active}
                onChange={e => set('is_active', e.target.checked)}
                className="h-4 w-4 accent-mira-magenta"
              />
              <label htmlFor="is_active" className="text-sm font-medium text-slate-700">Activo</label>
            </div>
          )}
        </div>
      </MiraFormCard>
    </form>
  )
}

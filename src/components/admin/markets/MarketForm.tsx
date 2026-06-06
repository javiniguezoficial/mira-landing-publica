'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { LineChart } from 'lucide-react'
import { MiraFormCard } from '@/components/mira/MiraFormCard'
import { miraBtn, miraField, miraLabel } from '@/lib/miraButtons'
import type { Market, MarketCategory } from '@/lib/actions/markets'

interface Props {
  initial?: Market
  categories: Pick<MarketCategory, 'id' | 'name'>[]
  onSave: (form: {
    category_id: string; name: string; slug: string
    description: string; country_scope: string; is_active: boolean
  }) => Promise<void>
}

function toSlug(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export function MarketForm({ initial, categories, onSave }: Props) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    category_id: initial?.category_id ?? categories[0]?.id ?? '',
    name: initial?.name ?? '',
    slug: initial?.slug ?? '',
    description: initial?.description ?? '',
    country_scope: initial?.country_scope ?? 'ES',
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
      router.push('/admin/mercados')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-lg">
      <MiraFormCard
        title="Datos del mercado"
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

          <div>
            <label className={miraLabel}>Categoría *</label>
            <select
              required
              value={form.category_id}
              onChange={e => set('category_id', e.target.value)}
              className={miraField}
            >
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

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
            <label className={miraLabel}>Descripción</label>
            <textarea
              rows={3}
              value={form.description}
              onChange={e => set('description', e.target.value)}
              className={`${miraField} resize-none`}
            />
          </div>

          <div>
            <label className={miraLabel}>País / Ámbito</label>
            <input
              value={form.country_scope}
              onChange={e => set('country_scope', e.target.value)}
              placeholder="ES"
              className={`${miraField} w-32 font-mono`}
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

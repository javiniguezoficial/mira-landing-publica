'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
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
    <form onSubmit={handleSubmit} className="space-y-5 max-w-lg">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      <div>
        <label className="block text-xs font-bold text-slate-700 mb-1">Categoría *</label>
        <select
          required
          value={form.category_id}
          onChange={e => set('category_id', e.target.value)}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-mira-primary/30"
        >
          {categories.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-700 mb-1">Nombre *</label>
        <input
          required
          value={form.name}
          onChange={e => {
            set('name', e.target.value)
            if (!initial) set('slug', toSlug(e.target.value))
          }}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-mira-primary/30"
        />
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-700 mb-1">Slug *</label>
        <input
          required
          value={form.slug}
          onChange={e => set('slug', e.target.value)}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-500 font-mono focus:outline-none focus:ring-2 focus:ring-mira-primary/30"
        />
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-700 mb-1">Descripción</label>
        <textarea
          rows={3}
          value={form.description}
          onChange={e => set('description', e.target.value)}
          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-mira-primary/30 resize-none"
        />
      </div>

      <div>
        <label className="block text-xs font-bold text-slate-700 mb-1">País / Ámbito</label>
        <input
          value={form.country_scope}
          onChange={e => set('country_scope', e.target.value)}
          placeholder="ES"
          className="w-32 border border-slate-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-mira-primary/30"
        />
      </div>

      {initial && (
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="is_active"
            checked={form.is_active}
            onChange={e => set('is_active', e.target.checked)}
            className="w-4 h-4 accent-mira-primary"
          />
          <label htmlFor="is_active" className="text-sm text-slate-700 font-medium">Activo</label>
        </div>
      )}

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

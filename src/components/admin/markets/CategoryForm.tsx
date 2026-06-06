'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Layers } from 'lucide-react'
import { MiraFormCard } from '@/components/mira/MiraFormCard'
import { miraBtn, miraField, miraLabel } from '@/lib/miraButtons'
import type { MarketCategory } from '@/lib/actions/markets'

interface Props {
  initial?: MarketCategory
  onSave: (form: {
    name: string; slug: string; description: string; icon: string; sort_order: number; is_active: boolean
  }) => Promise<void>
}

function toSlug(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export function CategoryForm({ initial, onSave }: Props) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: initial?.name ?? '',
    slug: initial?.slug ?? '',
    description: initial?.description ?? '',
    icon: initial?.icon ?? '',
    sort_order: initial?.sort_order ?? 0,
    is_active: initial?.is_active ?? true,
  })

  const set = (k: keyof typeof form, v: string | number | boolean) =>
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
        title="Datos de la categoría"
        icon={Layers}
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
            <label className={miraLabel}>Icono (emoji)</label>
            <input
              value={form.icon}
              onChange={e => set('icon', e.target.value)}
              placeholder="🐔"
              className={miraField}
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
            <label className={miraLabel}>Orden</label>
            <input
              type="number"
              min={0}
              value={form.sort_order}
              onChange={e => set('sort_order', parseInt(e.target.value) || 0)}
              className={`${miraField} w-32`}
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
              <label htmlFor="is_active" className="text-sm font-medium text-slate-700">Activa</label>
            </div>
          )}
        </div>
      </MiraFormCard>
    </form>
  )
}

'use client'

import { useState } from 'react'
import type { NewsItem, NewsStatus } from '@/lib/actions/news'
import { RichTextEditor } from '@/components/admin/RichTextEditor'
import { ImageUpload } from '@/components/admin/ImageUpload'
import { Loader2 } from 'lucide-react'
import { miraBtn, miraField } from '@/lib/miraButtons'

const newsLabel = 'block text-sm font-bold text-mira-ink mb-1.5'

interface Props {
  action: (formData: FormData) => Promise<{ error?: string } | void>
  defaultValues?: Partial<NewsItem>
  markets: { id: string; name: string }[]
  products: { id: string; name: string }[]
  submitLabel?: string
}

const CATEGORIES = ['Mercados', 'Precios', 'Proveedores', 'Regulación', 'Tendencias', 'General']

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

export function NewsForm({ action, defaultValues, markets, products, submitLabel = 'Guardar' }: Props) {
  const [title, setTitle] = useState(defaultValues?.title ?? '')
  const [slug, setSlug] = useState(defaultValues?.slug ?? '')
  const [slugManual, setSlugManual] = useState(!!defaultValues?.slug)
  const [status, setStatus] = useState<NewsStatus>(defaultValues?.status ?? 'draft')
  const [content, setContent] = useState(defaultValues?.content ?? '')
  const [imageUrl, setImageUrl] = useState<string>(defaultValues?.image_url ?? '')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const handleTitleChange = (v: string) => {
    setTitle(v)
    if (!slugManual) setSlug(generateSlug(v))
  }

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setPending(true)

    const fd = new FormData()
    fd.set('title', title)
    fd.set('slug', slug)
    fd.set('content', content)
    fd.set('status', status)
    fd.set('image_url', imageUrl)

    const form = e.currentTarget
    const category = (form.elements.namedItem('category') as HTMLSelectElement)?.value ?? ''
    const market_id = (form.elements.namedItem('market_id') as HTMLSelectElement)?.value ?? ''
    const product_id = (form.elements.namedItem('product_id') as HTMLSelectElement)?.value ?? ''
    fd.set('category', category)
    fd.set('market_id', market_id)
    fd.set('product_id', product_id)

    const result = await action(fd)
    if (result && 'error' in result && result.error) {
      setError(result.error)
      setPending(false)
    }
    // Si no hay error, el server action hace redirect y el componente se desmonta
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </div>
      )}

      {/* Título */}
      <div>
        <label className={newsLabel}>
          Título <span className="text-red-500">*</span>
        </label>
        <input
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          required
          className={miraField}
          placeholder="Título de la noticia"
        />
      </div>

      {/* Slug */}
      <div>
        <label className={newsLabel}>Slug (URL)</label>
        <div className="flex gap-2">
          <input
            value={slug}
            onChange={(e) => { setSlug(e.target.value); setSlugManual(true) }}
            required
            className={`${miraField} flex-1 font-mono`}
            placeholder="mi-noticia-de-ejemplo"
          />
          {slugManual && (
            <button
              type="button"
              onClick={() => { setSlugManual(false); setSlug(generateSlug(title)) }}
              className="whitespace-nowrap rounded-xl bg-mira-magenta-soft px-3 py-2 text-xs font-bold text-mira-magenta transition-colors hover:bg-mira-magenta/15"
            >
              Auto
            </button>
          )}
        </div>
        <p className="text-xs text-slate-400 mt-1">Se genera automáticamente desde el título</p>
      </div>

      {/* Imagen */}
      <div>
        <label className={newsLabel}>Imagen destacada</label>
        <ImageUpload
          currentUrl={defaultValues?.image_url}
          onUploaded={(url) => setImageUrl(url)}
          onClear={() => setImageUrl('')}
        />
      </div>

      {/* Contenido */}
      <div>
        <label className={newsLabel}>
          Contenido <span className="text-red-500">*</span>
        </label>
        <RichTextEditor
          value={content}
          onChange={setContent}
          placeholder="Escribe el contenido de la noticia…"
        />
        <p className="text-xs text-slate-400 mt-1">El extracto se generará automáticamente.</p>
      </div>

      {/* Estado + Categoría */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={newsLabel}>Estado</label>
          <select
            name="status"
            value={status}
            onChange={(e) => setStatus(e.target.value as NewsStatus)}
            className={miraField}
          >
            <option value="draft">Borrador</option>
            <option value="published">Publicada</option>
            <option value="archived">Archivada</option>
          </select>
        </div>
        <div>
          <label className={newsLabel}>Categoría</label>
          <select
            name="category"
            defaultValue={defaultValues?.category ?? ''}
            className={miraField}
          >
            <option value="">Sin categoría</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      {/* Mercado + Producto */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={newsLabel}>Mercado relacionado</label>
          <select
            name="market_id"
            defaultValue={defaultValues?.market_id ?? ''}
            className={miraField}
          >
            <option value="">Ninguno</option>
            {markets.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        </div>
        <div>
          <label className={newsLabel}>Producto relacionado</label>
          <select
            name="product_id"
            defaultValue={defaultValues?.product_id ?? ''}
            className={miraField}
          >
            <option value="">Ninguno</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
      </div>

      {/* Submit */}
      <div className="flex justify-end pt-2">
        <button type="submit" disabled={pending} className={miraBtn.primary}>
          {pending && <Loader2 size={15} className="animate-spin" />}
          {submitLabel}
        </button>
      </div>
    </form>
  )
}

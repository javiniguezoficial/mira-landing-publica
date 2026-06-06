import { getNewsById, changeNewsStatus } from '@/lib/actions/news'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Pencil, Globe, FileText, Archive, Calendar, Tag, TrendingUp, Package } from 'lucide-react'
import { NewsDeleteButton } from '../NewsDeleteButton'
import { MiraStatusBadge } from '@/components/mira/MiraStatusBadge'
import { miraBtn } from '@/lib/miraButtons'

export default async function AdminNoticiaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const news = await getNewsById(id)
  if (!news) notFound()

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-4 md:p-6 xl:p-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/admin/noticias" className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-mira-magenta">
          <ArrowLeft size={15} /> Volver a noticias
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <Link href={`/admin/noticias/${id}/editar`} className={miraBtn.ghost}>
            <Pencil size={14} /> Editar
          </Link>
          {news.status !== 'published' && (
            <form action={async () => { 'use server'; await changeNewsStatus(id, 'published') }}>
              <button type="submit" className="flex items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-700 transition-colors hover:bg-emerald-100">
                <Globe size={14} /> Publicar
              </button>
            </form>
          )}
          {news.status === 'published' && (
            <form action={async () => { 'use server'; await changeNewsStatus(id, 'draft') }}>
              <button type="submit" className="flex items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-700 transition-colors hover:bg-amber-100">
                <FileText size={14} /> Volver a borrador
              </button>
            </form>
          )}
          {news.status !== 'archived' && (
            <form action={async () => { 'use server'; await changeNewsStatus(id, 'archived') }}>
              <button type="submit" className={miraBtn.ghost}>
                <Archive size={14} /> Archivar
              </button>
            </form>
          )}
          <NewsDeleteButton id={id} title={news.title} />
        </div>
      </div>

      <div className="mira-card overflow-hidden rounded-2xl">
        {/* Imagen destacada */}
        {news.image_url && (
          <div className="h-56 overflow-hidden bg-slate-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={news.image_url} alt={news.title} className="h-full w-full object-cover" />
          </div>
        )}

        {/* Cabecera */}
        <div className="border-b border-mira-line p-6">
          <div className="mb-2 flex flex-wrap items-center gap-3">
            <MiraStatusBadge status={news.status} kind="news" />
            {news.category && (
              <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                <Tag size={10} /> {news.category}
              </span>
            )}
          </div>
          <h1 className="text-2xl font-black leading-tight tracking-tight text-mira-ink">{news.title}</h1>
          {news.excerpt && (
            <p className="mt-2 text-sm leading-relaxed text-slate-500">{news.excerpt}</p>
          )}
          <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-500">
            {news.published_at && (
              <span className="flex items-center gap-1">
                <Calendar size={12} />
                Publicada: {new Date(news.published_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            {news.markets?.name && (
              <span className="flex items-center gap-1 text-mira-magenta"><TrendingUp size={12} /> {news.markets.name}</span>
            )}
            {news.products?.name && (
              <span className="flex items-center gap-1 text-mira-magenta"><Package size={12} /> {news.products.name}</span>
            )}
          </div>
          <div className="mt-2 font-mono text-xs text-slate-400">/{news.slug}</div>
        </div>

        {/* Contenido HTML renderizado */}
        <div className="p-6">
          <h2 className="mb-4 text-xs font-bold uppercase tracking-wide text-slate-400">Contenido</h2>
          <div
            className="rich-content"
            dangerouslySetInnerHTML={{ __html: news.content }}
          />
        </div>

        <div className="flex gap-6 border-t border-mira-line bg-mira-canvas/50 px-6 py-4 text-xs text-slate-400">
          <span>Creada: {new Date(news.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
          <span>Actualizada: {new Date(news.updated_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
        </div>
      </div>
    </div>
  )
}

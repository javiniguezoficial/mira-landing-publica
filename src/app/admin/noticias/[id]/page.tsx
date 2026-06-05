import { getNewsById, changeNewsStatus } from '@/lib/actions/news'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Pencil, Globe, FileText, Archive, Calendar, Tag, TrendingUp, Package } from 'lucide-react'
import { NewsDeleteButton } from '../NewsDeleteButton'

const STATUS_LABELS: Record<string, string> = {
  draft: 'Borrador',
  published: 'Publicada',
  archived: 'Archivada',
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-amber-100 text-amber-800 border-amber-200',
  published: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  archived: 'bg-slate-100 text-slate-600 border-slate-200',
}

export default async function AdminNoticiaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const news = await getNewsById(id)
  if (!news) notFound()

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <Link href="/admin/noticias" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft size={15} /> Volver a noticias
        </Link>
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href={`/admin/noticias/${id}/editar`}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <Pencil size={14} /> Editar
          </Link>
          {news.status !== 'published' && (
            <form action={async () => { 'use server'; await changeNewsStatus(id, 'published') }}>
              <button type="submit" className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 transition-colors">
                <Globe size={14} /> Publicar
              </button>
            </form>
          )}
          {news.status === 'published' && (
            <form action={async () => { 'use server'; await changeNewsStatus(id, 'draft') }}>
              <button type="submit" className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors">
                <FileText size={14} /> Volver a borrador
              </button>
            </form>
          )}
          {news.status !== 'archived' && (
            <form action={async () => { 'use server'; await changeNewsStatus(id, 'archived') }}>
              <button type="submit" className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-slate-600 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors">
                <Archive size={14} /> Archivar
              </button>
            </form>
          )}
          <NewsDeleteButton id={id} title={news.title} />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {/* Imagen destacada */}
        {news.image_url && (
          <div className="h-56 overflow-hidden bg-slate-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={news.image_url} alt={news.title} className="w-full h-full object-cover" />
          </div>
        )}

        {/* Cabecera */}
        <div className="p-6 border-b border-slate-100">
          <div className="flex items-center gap-3 mb-2 flex-wrap">
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${STATUS_COLORS[news.status]}`}>
              {STATUS_LABELS[news.status]}
            </span>
            {news.category && (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                <Tag size={10} /> {news.category}
              </span>
            )}
          </div>
          <h1 className="text-2xl font-display font-bold text-slate-900 leading-tight">{news.title}</h1>
          {news.excerpt && (
            <p className="text-slate-500 mt-2 text-sm leading-relaxed">{news.excerpt}</p>
          )}
          <div className="flex flex-wrap gap-4 mt-4 text-xs text-slate-500">
            {news.published_at && (
              <span className="flex items-center gap-1">
                <Calendar size={12} />
                Publicada: {new Date(news.published_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
            {news.markets?.name && (
              <span className="flex items-center gap-1 text-mira-primary"><TrendingUp size={12} /> {news.markets.name}</span>
            )}
            {news.products?.name && (
              <span className="flex items-center gap-1 text-mira-primary"><Package size={12} /> {news.products.name}</span>
            )}
          </div>
          <div className="mt-2 text-xs text-slate-400 font-mono">/{news.slug}</div>
        </div>

        {/* Contenido HTML renderizado */}
        <div className="p-6">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-4">Contenido</h2>
          <div
            className="rich-content"
            dangerouslySetInnerHTML={{ __html: news.content }}
          />
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 text-xs text-slate-400 flex gap-6">
          <span>Creada: {new Date(news.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
          <span>Actualizada: {new Date(news.updated_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}</span>
        </div>
      </div>
    </div>
  )
}

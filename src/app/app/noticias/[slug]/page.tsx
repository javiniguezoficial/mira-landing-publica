import { getPublishedNewsBySlug } from '@/lib/queries/news'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, Calendar, Tag, TrendingUp, Package } from 'lucide-react'

export default async function ClienteNoticiaDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const news = await getPublishedNewsBySlug(slug)
  if (!news) notFound()

  return (
    <div className="mx-auto w-full max-w-3xl p-4 md:p-6 xl:p-8">
      <Link href="/app/noticias" className="mb-6 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition-colors hover:text-mira-magenta">
        <ArrowLeft size={15} /> Todas las noticias
      </Link>

      <article className="mira-card overflow-hidden rounded-2xl">
        {/* Imagen destacada */}
        {news.image_url && (
          <div className="h-64 overflow-hidden bg-slate-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={news.image_url}
              alt={news.title}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        <div className="p-8">
          {/* Chips */}
          {(news.category || news.markets?.name || news.products?.name) && (
            <div className="flex flex-wrap gap-2 mb-4">
              {news.category && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-mira-magenta-soft text-mira-magenta">
                  <Tag size={10} /> {news.category}
                </span>
              )}
              {news.markets?.name && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">
                  <TrendingUp size={10} /> {news.markets.name}
                </span>
              )}
              {news.products?.name && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">
                  <Package size={10} /> {news.products.name}
                </span>
              )}
            </div>
          )}

          {/* Título */}
          <h1 className="text-3xl font-display font-bold text-slate-900 leading-tight mb-3">
            {news.title}
          </h1>

          {/* Fecha */}
          <div className="flex items-center gap-1.5 text-sm text-slate-400 mb-6">
            <Calendar size={14} />
            {new Date(news.published_at).toLocaleDateString('es-ES', {
              day: '2-digit', month: 'long', year: 'numeric',
              hour: '2-digit', minute: '2-digit',
            })}
          </div>

          {/* Extracto como lead */}
          {news.excerpt && (
            <p className="text-lg text-slate-600 leading-relaxed border-l-4 border-mira-magenta pl-4 mb-8 font-medium">
              {news.excerpt}
            </p>
          )}

          {/* Contenido enriquecido */}
          <div
            className="rich-content"
            dangerouslySetInnerHTML={{ __html: news.content }}
          />
        </div>
      </article>
    </div>
  )
}

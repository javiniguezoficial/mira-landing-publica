import { getPublishedNews } from '@/lib/queries/news'
import Link from 'next/link'
import { Newspaper, Calendar, Tag, TrendingUp, Package } from 'lucide-react'
import { MiraPageHeader } from '@/components/mira/MiraPageHeader'
import { EmptyState } from '@/components/shared/EmptyState'

export default async function ClienteNoticiasPage() {
  const news = await getPublishedNews()

  return (
    <div className="w-full space-y-6 p-4 md:p-6 xl:p-8">
      <MiraPageHeader icon={Newspaper} title="Noticias" subtitle="Últimas novedades del sector" />

      {news.length === 0 ? (
        <div className="mira-card rounded-2xl">
          <EmptyState icon={Newspaper} title="No hay noticias publicadas todavía" description="Vuelve pronto para ver las últimas novedades del sector." />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
          {news.map((item) => (
            <Link
              key={item.id}
              href={`/app/noticias/${item.slug}`}
              className="mira-card group flex flex-col overflow-hidden rounded-2xl transition-all hover:-translate-y-0.5 hover:border-mira-magenta/30 hover:shadow-lg hover:shadow-mira-ink/10"
            >
              {item.image_url && (
                <div className="h-44 shrink-0 overflow-hidden bg-slate-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.image_url} alt={item.title} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105" />
                </div>
              )}

              <div className="flex flex-1 flex-col p-5">
                {(item.category || item.markets?.name || item.products?.name) && (
                  <div className="mb-3 flex flex-wrap gap-1.5">
                    {item.category && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-mira-magenta-soft px-2 py-0.5 text-xs font-semibold text-mira-magenta">
                        <Tag size={9} /> {item.category}
                      </span>
                    )}
                    {item.markets?.name && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-mira-canvas px-2 py-0.5 text-xs font-semibold text-slate-600">
                        <TrendingUp size={9} /> {item.markets.name}
                      </span>
                    )}
                    {item.products?.name && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-mira-canvas px-2 py-0.5 text-xs font-semibold text-slate-600">
                        <Package size={9} /> {item.products.name}
                      </span>
                    )}
                  </div>
                )}

                <h2 className="mb-2 line-clamp-2 font-black leading-snug text-mira-ink transition-colors group-hover:text-mira-magenta">
                  {item.title}
                </h2>

                {item.excerpt && (
                  <p className="mb-3 line-clamp-3 flex-1 text-sm leading-relaxed text-slate-500">{item.excerpt}</p>
                )}

                <div className="mt-auto flex items-center gap-1 text-xs text-slate-400">
                  <Calendar size={11} />
                  {new Date(item.published_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' })}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

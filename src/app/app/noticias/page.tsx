import { getPublishedNews } from '@/lib/queries/news'
import Link from 'next/link'
import { Newspaper, Calendar, Tag, TrendingUp, Package } from 'lucide-react'

export default async function ClienteNoticiasPage() {
  const news = await getPublishedNews()

  return (
    <div className="p-8">
      <div className="flex items-center gap-3 mb-8">
        <Newspaper className="text-mira-primary" size={28} />
        <div>
          <h1 className="text-2xl font-display font-bold text-slate-900">Noticias</h1>
          <p className="text-sm text-slate-500">Últimas novedades del sector</p>
        </div>
      </div>

      {news.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-16 text-center">
          <Newspaper size={36} className="mx-auto text-slate-200 mb-4" />
          <p className="font-semibold text-slate-600 mb-1">No hay noticias publicadas todavía</p>
          <p className="text-sm text-slate-400">Vuelve pronto para ver las últimas novedades del sector.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {news.map((item) => (
            <Link
              key={item.id}
              href={`/app/noticias/${item.slug}`}
              className="group bg-white rounded-xl border border-slate-200 overflow-hidden hover:border-mira-primary/40 hover:shadow-md transition-all flex flex-col"
            >
              {/* Imagen — solo si existe */}
              {item.image_url && (
                <div className="h-44 overflow-hidden bg-slate-100 shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.image_url}
                    alt={item.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                </div>
              )}

              <div className="p-5 flex flex-col flex-1">
                {/* Chips */}
                {(item.category || item.markets?.name || item.products?.name) && (
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {item.category && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-mira-primary/10 text-mira-primary">
                        <Tag size={9} /> {item.category}
                      </span>
                    )}
                    {item.markets?.name && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">
                        <TrendingUp size={9} /> {item.markets.name}
                      </span>
                    )}
                    {item.products?.name && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">
                        <Package size={9} /> {item.products.name}
                      </span>
                    )}
                  </div>
                )}

                {/* Título */}
                <h2 className="font-display font-bold text-slate-900 leading-snug mb-2 group-hover:text-mira-primary transition-colors line-clamp-2">
                  {item.title}
                </h2>

                {/* Extracto */}
                {item.excerpt && (
                  <p className="text-sm text-slate-500 leading-relaxed line-clamp-3 mb-3 flex-1">
                    {item.excerpt}
                  </p>
                )}

                {/* Fecha */}
                <div className="flex items-center gap-1 text-xs text-slate-400 mt-auto">
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

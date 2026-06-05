import { getNewsListAdmin, changeNewsStatus } from '@/lib/actions/news'
import Link from 'next/link'
import { Newspaper, Plus, Eye, Pencil, Globe, Archive, FileText } from 'lucide-react'
import { NewsDeleteButton } from './NewsDeleteButton'

const STATUS_LABELS: Record<string, string> = {
  draft: 'Borrador',
  published: 'Publicada',
  archived: 'Archivada',
}

const STATUS_COLORS: Record<string, string> = {
  draft: 'bg-amber-100 text-amber-800',
  published: 'bg-emerald-100 text-emerald-800',
  archived: 'bg-slate-100 text-slate-600',
}

const CATEGORIES = ['Mercados', 'Precios', 'Proveedores', 'Regulación', 'Tendencias', 'General']

export default async function AdminNoticiasPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; category?: string }>
}) {
  const params = await searchParams
  const news = await getNewsListAdmin({
    status: params.status,
    category: params.category,
  })

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <Newspaper className="text-mira-primary" size={28} />
          <div>
            <h1 className="text-2xl font-display font-bold text-slate-900">Noticias</h1>
            <p className="text-sm text-slate-500">{news.length} noticia{news.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <Link
          href="/admin/noticias/nueva"
          className="flex items-center gap-2 bg-mira-primary text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-mira-primary/90 transition-colors"
        >
          <Plus size={16} />
          Nueva noticia
        </Link>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Estado:</span>
          {['all', 'draft', 'published', 'archived'].map((s) => (
            <Link
              key={s}
              href={`/admin/noticias?status=${s}&category=${params.category ?? 'all'}`}
              className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                (params.status ?? 'all') === s
                  ? 'bg-mira-primary text-white border-mira-primary'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-mira-primary'
              }`}
            >
              {s === 'all' ? 'Todos' : STATUS_LABELS[s]}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Categoría:</span>
          {['all', ...CATEGORIES].map((c) => (
            <Link
              key={c}
              href={`/admin/noticias?status=${params.status ?? 'all'}&category=${c}`}
              className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                (params.category ?? 'all') === c
                  ? 'bg-slate-800 text-white border-slate-800'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-400'
              }`}
            >
              {c === 'all' ? 'Todas' : c}
            </Link>
          ))}
        </div>
      </div>

      {/* Tabla */}
      {news.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-16 text-center">
          <Newspaper size={40} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-500 font-semibold">No hay noticias con estos filtros</p>
          <Link href="/admin/noticias/nueva" className="mt-4 inline-flex items-center gap-2 text-mira-primary text-sm font-semibold hover:underline">
            <Plus size={14} /> Crear primera noticia
          </Link>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-5 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Título</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Estado</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Categoría</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide">Publicada</th>
                <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wide text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {news.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-4">
                    <div className="font-semibold text-slate-900 leading-tight">{item.title}</div>
                    <div className="text-xs text-slate-400 mt-0.5 font-mono">{item.slug}</div>
                    {(item.markets?.name || item.products?.name) && (
                      <div className="text-xs text-mira-primary mt-0.5">
                        {item.markets?.name}{item.products?.name ? ` · ${item.products.name}` : ''}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[item.status]}`}>
                      {STATUS_LABELS[item.status]}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-slate-600">{item.category ?? '—'}</td>
                  <td className="px-4 py-4 text-slate-500">
                    {item.published_at
                      ? new Date(item.published_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
                      : '—'}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href={`/admin/noticias/${item.id}`}
                        className="p-1.5 text-slate-400 hover:text-mira-primary rounded-lg hover:bg-slate-100 transition-colors"
                        title="Ver detalle"
                      >
                        <Eye size={15} />
                      </Link>
                      <Link
                        href={`/admin/noticias/${item.id}/editar`}
                        className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors"
                        title="Editar"
                      >
                        <Pencil size={15} />
                      </Link>
                      {item.status !== 'published' && (
                        <form action={async () => { 'use server'; await changeNewsStatus(item.id, 'published') }}>
                          <button type="submit" className="p-1.5 text-slate-400 hover:text-emerald-600 rounded-lg hover:bg-emerald-50 transition-colors" title="Publicar">
                            <Globe size={15} />
                          </button>
                        </form>
                      )}
                      {item.status === 'published' && (
                        <form action={async () => { 'use server'; await changeNewsStatus(item.id, 'draft') }}>
                          <button type="submit" className="p-1.5 text-slate-400 hover:text-amber-600 rounded-lg hover:bg-amber-50 transition-colors" title="Volver a borrador">
                            <FileText size={15} />
                          </button>
                        </form>
                      )}
                      {item.status !== 'archived' && (
                        <form action={async () => { 'use server'; await changeNewsStatus(item.id, 'archived') }}>
                          <button type="submit" className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors" title="Archivar">
                            <Archive size={15} />
                          </button>
                        </form>
                      )}
                      <NewsDeleteButton id={item.id} title={item.title} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

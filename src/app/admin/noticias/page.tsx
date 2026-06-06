import { getNewsListAdmin, changeNewsStatus } from '@/lib/actions/news'
import Link from 'next/link'
import { Newspaper, Plus, Eye, Pencil, Globe, Archive, FileText } from 'lucide-react'
import { NewsDeleteButton } from './NewsDeleteButton'
import { MiraPageHeader } from '@/components/mira/MiraPageHeader'
import { MiraTable, MiraTr, MiraTd } from '@/components/mira/MiraTable'
import { MiraStatusBadge } from '@/components/mira/MiraStatusBadge'
import { EmptyState } from '@/components/shared/EmptyState'
import { miraBtn } from '@/lib/miraButtons'

const STATUS_LABELS: Record<string, string> = {
  draft: 'Borrador',
  published: 'Publicada',
  archived: 'Archivada',
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
    <div className="w-full space-y-6 p-4 md:p-6 xl:p-8">
      <MiraPageHeader
        icon={Newspaper}
        title="Noticias"
        subtitle={`${news.length} noticia${news.length !== 1 ? 's' : ''}`}
        actions={
          <Link href="/admin/noticias/nueva" className={miraBtn.primary}>
            <Plus size={16} /> Nueva noticia
          </Link>
        }
      />

      {/* Filtros */}
      <div className="flex flex-wrap gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Estado:</span>
          {['all', 'draft', 'published', 'archived'].map((s) => (
            <Link
              key={s}
              href={`/admin/noticias?status=${s}&category=${params.category ?? 'all'}`}
              className={`rounded-full px-3 py-1 text-xs font-bold transition-colors ${
                (params.status ?? 'all') === s
                  ? 'bg-mira-magenta text-white shadow-lg shadow-mira-magenta/25'
                  : 'border border-mira-line bg-white text-slate-600 hover:border-mira-magenta/30 hover:text-mira-magenta'
              }`}
            >
              {s === 'all' ? 'Todos' : STATUS_LABELS[s]}
            </Link>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Categoría:</span>
          {['all', ...CATEGORIES].map((c) => (
            <Link
              key={c}
              href={`/admin/noticias?status=${params.status ?? 'all'}&category=${c}`}
              className={`rounded-full px-3 py-1 text-xs font-bold transition-colors ${
                (params.category ?? 'all') === c
                  ? 'bg-mira-ink text-white'
                  : 'border border-mira-line bg-white text-slate-600 hover:border-slate-400'
              }`}
            >
              {c === 'all' ? 'Todas' : c}
            </Link>
          ))}
        </div>
      </div>

      {/* Tabla */}
      {news.length === 0 ? (
        <div className="mira-card rounded-2xl">
          <EmptyState
            icon={Newspaper}
            title="No hay noticias con estos filtros"
            description="Crea la primera noticia o ajusta los filtros."
            action={{ label: 'Crear noticia', href: '/admin/noticias/nueva' }}
          />
        </div>
      ) : (
        <MiraTable
          headers={['Título', 'Estado', 'Categoría', 'Publicada', { label: 'Acciones', align: 'right' }]}
        >
          {news.map((item) => (
            <MiraTr key={item.id}>
              <MiraTd>
                <div className="font-bold leading-tight text-mira-ink">{item.title}</div>
                <div className="mt-0.5 font-mono text-xs text-slate-400">{item.slug}</div>
                {(item.markets?.name || item.products?.name) && (
                  <div className="mt-0.5 text-xs text-mira-magenta">
                    {item.markets?.name}{item.products?.name ? ` · ${item.products.name}` : ''}
                  </div>
                )}
              </MiraTd>
              <MiraTd><MiraStatusBadge status={item.status} kind="news" /></MiraTd>
              <MiraTd className="text-slate-600">{item.category ?? '—'}</MiraTd>
              <MiraTd className="text-slate-500">
                {item.published_at
                  ? new Date(item.published_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
                  : '—'}
              </MiraTd>
              <MiraTd align="right">
                <div className="flex items-center justify-end gap-1">
                  <Link href={`/admin/noticias/${item.id}`} className={miraBtn.icon} title="Ver detalle">
                    <Eye size={15} />
                  </Link>
                  <Link href={`/admin/noticias/${item.id}/editar`} className={miraBtn.icon} title="Editar">
                    <Pencil size={15} />
                  </Link>
                  {item.status !== 'published' && (
                    <form action={async () => { 'use server'; await changeNewsStatus(item.id, 'published') }}>
                      <button type="submit" className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-emerald-50 hover:text-emerald-600" title="Publicar">
                        <Globe size={15} />
                      </button>
                    </form>
                  )}
                  {item.status === 'published' && (
                    <form action={async () => { 'use server'; await changeNewsStatus(item.id, 'draft') }}>
                      <button type="submit" className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-amber-50 hover:text-amber-600" title="Volver a borrador">
                        <FileText size={15} />
                      </button>
                    </form>
                  )}
                  {item.status !== 'archived' && (
                    <form action={async () => { 'use server'; await changeNewsStatus(item.id, 'archived') }}>
                      <button type="submit" className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600" title="Archivar">
                        <Archive size={15} />
                      </button>
                    </form>
                  )}
                  <NewsDeleteButton id={item.id} title={item.title} />
                </div>
              </MiraTd>
            </MiraTr>
          ))}
        </MiraTable>
      )}
    </div>
  )
}

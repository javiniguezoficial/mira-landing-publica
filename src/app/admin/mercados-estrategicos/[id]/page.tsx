import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Globe2, Pencil, ArrowLeft, TrendingUp, Package, Layers } from 'lucide-react'
import { getStrategicMarketDetail } from '@/lib/actions/markets'
import { MiraPageHeader } from '@/components/mira/MiraPageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { miraBtn } from '@/lib/miraButtons'

export const dynamic = 'force-dynamic'

export default async function StrategicMarketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const detail = await getStrategicMarketDetail(id)
  if (!detail) notFound()

  const { strategicMarket: sm, categories } = detail
  const totalMarkets = categories.reduce((acc, cat) => acc + cat.markets.length, 0)
  const totalProducts = categories.reduce(
    (acc, cat) => acc + cat.markets.reduce((a, m) => a + m.productCount, 0),
    0,
  )

  return (
    <div className="w-full space-y-6 p-4 md:p-6 xl:p-8">
      <div>
        <Link
          href="/admin/mercados-estrategicos"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-mira-magenta"
        >
          <ArrowLeft size={14} /> Mercados estratégicos
        </Link>
        <MiraPageHeader
          icon={Globe2}
          title={`${sm.icon ?? '🌍'} ${sm.name}`}
          subtitle={`${categories.length} ${categories.length === 1 ? 'categoría' : 'categorías'} · ${totalMarkets} ${totalMarkets === 1 ? 'mercado' : 'mercados'} · ${totalProducts} referencias`}
          actions={
            <Link href={`/admin/mercados-estrategicos/${id}/editar`} className={miraBtn.ghost}>
              <Pencil size={14} /> Editar
            </Link>
          }
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {!sm.is_active && (
            <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-500">
              Inactivo
            </span>
          )}
          {sm.description && (
            <p className="text-sm text-slate-500">{sm.description}</p>
          )}
        </div>
      </div>

      {categories.length === 0 ? (
        <div className="mira-card rounded-2xl">
          <EmptyState
            icon={Layers}
            title="Sin categorías asignadas"
            description="Aún no hay categorías asignadas a este mercado estratégico. Edita una categoría y selecciona este mercado estratégico."
            action={{ label: 'Ir a Mercados', href: '/admin/mercados' }}
          />
        </div>
      ) : (
        <div className="space-y-4">
          {categories.map(cat => (
            <div key={cat.id} className="mira-card overflow-hidden rounded-2xl">
              {/* Cabecera categoría */}
              <div className="flex items-center justify-between border-b border-mira-line bg-mira-canvas/60 px-5 py-3 sm:px-6">
                <div className="flex items-center gap-3">
                  <span className="text-xl">{cat.icon ?? '📦'}</span>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-black text-mira-ink">{cat.name}</p>
                    {!cat.is_active && (
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-400">
                        Inactiva
                      </span>
                    )}
                    <span className="rounded-md bg-mira-canvas px-2 py-0.5 text-[10px] font-bold text-slate-400">
                      {cat.markets.length} {cat.markets.length === 1 ? 'mercado' : 'mercados'}
                    </span>
                  </div>
                </div>
                <Link
                  href="/admin/mercados"
                  className="text-xs font-bold text-mira-magenta hover:underline"
                >
                  Gestionar →
                </Link>
              </div>

              {/* Mercados de la categoría */}
              {cat.markets.length === 0 ? (
                <div className="px-5 py-3 text-sm text-slate-400 sm:px-6">
                  Sin mercados en esta categoría
                </div>
              ) : (
                <div className="divide-y divide-mira-line">
                  {cat.markets.map(market => (
                    <div
                      key={market.id}
                      className="flex items-center justify-between px-5 py-3 sm:px-6"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <TrendingUp size={14} className="shrink-0 text-mira-magenta/50" />
                        <span className="text-sm font-semibold text-mira-ink">{market.name}</span>
                        <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">
                          {market.country_scope}
                        </span>
                        {!market.is_active && (
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-400">
                            Inactivo
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1 text-xs text-slate-400">
                          <Package size={11} />
                          {market.productCount} {market.productCount === 1 ? 'referencia' : 'referencias'}
                        </span>
                        <Link
                          href={`/admin/mercados/${market.id}`}
                          className="text-xs font-bold text-mira-magenta hover:underline"
                        >
                          Ver →
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

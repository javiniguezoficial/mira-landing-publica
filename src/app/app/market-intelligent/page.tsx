import Link from 'next/link'
import { TrendingUp, Package, ArrowRight } from 'lucide-react'
import { getStrategicMarketGroups } from '@/lib/queries/markets'
import { MiraPageHeader } from '@/components/mira/MiraPageHeader'
import { MiraCategoryCard } from '@/components/mira/MiraCategoryCard'
import { EmptyState } from '@/components/shared/EmptyState'

export const dynamic = 'force-dynamic'

export default async function MarketIntelligentPage() {
  const groups = await getStrategicMarketGroups()
  const hasCategories = groups.some(g => g.categories.length > 0)
  const showStrategicHeaders = groups.some(g => g.id !== null)

  return (
    <div className="w-full space-y-6 p-4 md:p-6 xl:p-8">
      <MiraPageHeader
        icon={TrendingUp}
        title="Market Intelligence"
        subtitle="Mercados y referencias disponibles en tu plan"
      />

      {!hasCategories ? (
        <div className="mira-card rounded-2xl">
          <EmptyState icon={TrendingUp} title="Sin mercados disponibles" description="No hay mercados disponibles en este momento. Contacta con tu administrador." />
        </div>
      ) : (
        <>
          {/* Navegación rápida por mercado estratégico */}
          {showStrategicHeaders && groups.length > 1 && (
            <nav className="flex flex-wrap gap-2 rounded-2xl border border-mira-line bg-mira-canvas/40 p-3">
              {groups.map(group => (
                <a
                  key={group.id ?? 'otros'}
                  href={`#sm-${group.id ?? 'otros'}`}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-mira-line bg-white px-3 py-1.5 text-xs font-bold text-slate-600 transition-all hover:border-mira-magenta/40 hover:bg-mira-magenta-soft hover:text-mira-magenta"
                >
                  <span>{group.icon ?? (group.id ? '🌍' : '📦')}</span>
                  <span>{group.name ?? 'Otros mercados'}</span>
                  <span className="rounded-md bg-mira-canvas px-1.5 py-0.5 text-[10px] text-slate-400">
                    {group.categories.length}
                  </span>
                </a>
              ))}
            </nav>
          )}

          <div className="space-y-8">
            {groups.map(group => (
              <div
                key={group.id ?? 'sin-mercado-estrategico'}
                id={`sm-${group.id ?? 'otros'}`}
                className="scroll-mt-20 space-y-5"
              >
                {showStrategicHeaders && (
                  <div className="flex items-center gap-2.5 border-b border-mira-line pb-2">
                    <span className="text-lg">{group.icon ?? (group.id ? '🌍' : '📦')}</span>
                    <h2 className="text-sm font-black uppercase tracking-wider text-mira-ink">
                      {group.name ?? 'Otros mercados'}
                    </h2>
                  </div>
                )}

                {group.categories.map(cat => (
                  <MiraCategoryCard
                    key={cat.id}
                    emoji={cat.icon ?? '📦'}
                    name={cat.name}
                    description={cat.description}
                    meta={`${cat.markets.length} ${cat.markets.length === 1 ? 'mercado' : 'mercados'}`}
                  >
                    <div className="divide-y divide-mira-line">
                      {cat.markets.map(market => (
                        <div key={market.id} className="px-5 py-4">
                          <div className="mb-3 flex flex-wrap items-center gap-2">
                            <TrendingUp size={15} className="shrink-0 text-mira-magenta" />
                            <span className="text-sm font-bold text-mira-ink">{market.name}</span>
                            <span className="rounded-md bg-mira-canvas px-2 py-0.5 text-[10px] font-bold text-slate-500">
                              {market.country_scope}
                            </span>
                            {market.description && (
                              <span className="hidden text-xs text-slate-400 sm:inline">— {market.description}</span>
                            )}
                          </div>

                          {market.products.length > 0 && (
                            <div className="flex flex-wrap gap-2 sm:pl-6">
                              {market.products.map(product => (
                                <Link
                                  key={product.id}
                                  href={`/app/market-intelligent/${market.slug}/${product.slug}`}
                                  className="group flex items-center gap-2 rounded-xl border border-mira-line bg-white px-3 py-2 transition-all hover:-translate-y-0.5 hover:border-mira-magenta/30 hover:shadow-sm"
                                >
                                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-mira-magenta-soft">
                                    <Package size={13} className="text-mira-magenta" />
                                  </span>
                                  <span className="text-xs font-bold text-slate-700 transition-colors group-hover:text-mira-magenta">{product.name}</span>
                                  <span className="rounded-md bg-mira-canvas px-1.5 py-0.5 text-[10px] font-bold text-slate-400">/ {product.unit}</span>
                                  <ArrowRight size={12} className="text-slate-300 transition-colors group-hover:text-mira-magenta" />
                                </Link>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </MiraCategoryCard>
                ))}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

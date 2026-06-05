import { TrendingUp, Package } from 'lucide-react'
import { getCategoriesWithMarkets } from '@/lib/queries/markets'

export const dynamic = 'force-dynamic'

export default async function MarketIntelligentPage() {
  const categories = await getCategoriesWithMarkets()

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-heading font-bold text-slate-900">Market Intelligence</h1>
        <p className="text-slate-500 font-body text-sm mt-1">
          Mercados y productos disponibles en tu plan
        </p>
      </div>

      {categories.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <TrendingUp size={32} className="text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 text-sm">No hay mercados disponibles en este momento.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {categories.map(cat => (
            <div key={cat.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              {/* Category header */}
              <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100 bg-slate-50">
                <span className="text-2xl">{cat.icon ?? '📦'}</span>
                <div>
                  <h2 className="text-base font-heading font-bold text-slate-900">{cat.name}</h2>
                  {cat.description && (
                    <p className="text-xs text-slate-500">{cat.description}</p>
                  )}
                </div>
                <span className="ml-auto text-xs font-bold text-slate-400">
                  {cat.markets.length} {cat.markets.length === 1 ? 'mercado' : 'mercados'}
                </span>
              </div>

              {/* Markets */}
              <div className="divide-y divide-slate-50">
                {cat.markets.map(market => (
                  <div key={market.id} className="px-6 py-4">
                    <div className="flex items-center gap-2 mb-3">
                      <TrendingUp size={15} className="text-mira-primary shrink-0" />
                      <span className="text-sm font-bold text-slate-800">{market.name}</span>
                      <span className="text-xs font-bold px-2 py-0.5 bg-slate-100 text-slate-500 rounded ml-1">
                        {market.country_scope}
                      </span>
                      {market.description && (
                        <span className="text-xs text-slate-400 ml-1 hidden sm:inline">
                          — {market.description}
                        </span>
                      )}
                    </div>

                    {/* Products */}
                    {market.products.length > 0 && (
                      <div className="flex flex-wrap gap-2 pl-5">
                        {market.products.map(product => (
                          <div
                            key={product.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg"
                          >
                            <Package size={12} className="text-slate-400" />
                            <span className="text-xs font-semibold text-slate-700">{product.name}</span>
                            <span className="text-[10px] font-bold text-slate-400 ml-0.5">/ {product.unit}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Placeholder próximas funciones */}
      <div className="mt-8 bg-white rounded-xl border border-slate-200 p-6 text-center">
        <p className="text-slate-400 font-body text-sm">
          El histórico de precios y alertas de mercado se activarán en las siguientes fases.
        </p>
      </div>
    </div>
  )
}

import Link from 'next/link'
import { Plus, Pencil, TrendingUp } from 'lucide-react'
import { getCategories, getMarkets, toggleCategory, toggleMarket } from '@/lib/actions/markets'
import { ToggleButton } from '@/components/admin/markets/ToggleButton'

export const dynamic = 'force-dynamic'

export default async function MercadosPage() {
  const [categories, markets] = await Promise.all([getCategories(), getMarkets()])

  const marketsByCategory = categories.map(cat => ({
    ...cat,
    markets: markets.filter(m => m.category_id === cat.id),
  }))

  const totalMarkets = markets.length
  const totalProducts = 0

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-heading font-bold text-slate-900">Market Intelligence</h1>
          <p className="text-slate-500 font-body text-sm mt-1">
            {categories.length} categorías · {totalMarkets} mercados
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href="/admin/mercados/categorias/nueva"
            className="inline-flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 text-sm font-bold rounded-lg hover:bg-slate-50 transition-colors"
          >
            <Plus size={15} />
            Categoría
          </Link>
          <Link
            href="/admin/mercados/nuevo"
            className="inline-flex items-center gap-2 px-4 py-2 bg-mira-primary text-white text-sm font-bold rounded-lg hover:bg-mira-primary/90 transition-colors"
          >
            <Plus size={15} />
            Mercado
          </Link>
        </div>
      </div>

      <div className="space-y-6">
        {marketsByCategory.map(cat => (
          <div key={cat.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
            {/* Category header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-3">
                <span className="text-xl">{cat.icon ?? '📦'}</span>
                <div>
                  <p className="text-sm font-bold text-slate-900">{cat.name}</p>
                  {cat.description && (
                    <p className="text-xs text-slate-500">{cat.description}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <ToggleButton id={cat.id} isActive={cat.is_active} onToggle={toggleCategory} />
                <Link
                  href={`/admin/mercados/categorias/${cat.id}/editar`}
                  className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                >
                  <Pencil size={14} />
                </Link>
              </div>
            </div>

            {/* Markets */}
            {cat.markets.length === 0 ? (
              <div className="px-6 py-4 text-sm text-slate-400 italic">Sin mercados en esta categoría</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left px-6 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider">Mercado</th>
                    <th className="text-left px-6 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider">Ámbito</th>
                    <th className="text-left px-6 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider">Slug</th>
                    <th className="px-6 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Activo</th>
                    <th className="px-6 py-2 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {cat.markets.map(market => (
                    <tr key={market.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-3 font-semibold text-slate-800">
                        <div className="flex items-center gap-2">
                          <TrendingUp size={14} className="text-slate-300 shrink-0" />
                          {market.name}
                        </div>
                      </td>
                      <td className="px-6 py-3">
                        <span className="text-xs font-bold px-2 py-0.5 bg-slate-100 text-slate-600 rounded">
                          {market.country_scope}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-slate-400 font-mono text-xs">{market.slug}</td>
                      <td className="px-6 py-3 text-right">
                        <ToggleButton id={market.id} isActive={market.is_active} onToggle={toggleMarket} />
                      </td>
                      <td className="px-6 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/admin/mercados/${market.id}`}
                            className="text-xs font-bold text-mira-primary hover:underline"
                          >
                            Productos
                          </Link>
                          <Link
                            href={`/admin/mercados/${market.id}/editar`}
                            className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                          >
                            <Pencil size={14} />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

import Link from 'next/link'
import { Plus, Pencil, TrendingUp, LineChart } from 'lucide-react'
import { getCategories, getMarkets, toggleCategory, toggleMarket } from '@/lib/actions/markets'
import { ToggleButton } from '@/components/admin/markets/ToggleButton'
import { MiraPageHeader } from '@/components/mira/MiraPageHeader'
import { miraBtn } from '@/lib/miraButtons'

export const dynamic = 'force-dynamic'

export default async function MercadosPage() {
  const [categories, markets] = await Promise.all([getCategories(), getMarkets()])

  const marketsByCategory = categories.map(cat => ({
    ...cat,
    markets: markets.filter(m => m.category_id === cat.id),
  }))

  const totalMarkets = markets.length

  return (
    <div className="w-full space-y-6 p-4 md:p-6 xl:p-8">
      <MiraPageHeader
        icon={LineChart}
        title="Market Intelligence"
        subtitle={`${categories.length} categorías · ${totalMarkets} mercados`}
        actions={
          <>
            <Link href="/admin/mercados/categorias/nueva" className={miraBtn.ghost}>
              <Plus size={15} /> Categoría
            </Link>
            <Link href="/admin/mercados/nuevo" className={miraBtn.primary}>
              <Plus size={15} /> Mercado
            </Link>
          </>
        }
      />

      <div className="space-y-6">
        {marketsByCategory.map(cat => (
          <div key={cat.id} className="mira-card overflow-hidden rounded-2xl">
            {/* Category header */}
            <div className="flex items-center justify-between border-b border-mira-line bg-mira-canvas/60 px-5 py-4 sm:px-6">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{cat.icon ?? '📦'}</span>
                <div>
                  <p className="text-sm font-black text-mira-ink">{cat.name}</p>
                  {cat.description && (
                    <p className="text-xs text-slate-500">{cat.description}</p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <ToggleButton id={cat.id} isActive={cat.is_active} onToggle={toggleCategory} />
                <Link
                  href={`/admin/mercados/categorias/${cat.id}/editar`}
                  className={miraBtn.icon}
                >
                  <Pencil size={14} />
                </Link>
              </div>
            </div>

            {/* Markets */}
            {cat.markets.length === 0 ? (
              <div className="px-5 py-5 text-sm text-slate-400 sm:px-6">Sin mercados en esta categoría</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-mira-line">
                      <th className="px-5 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-slate-500 sm:px-6">Mercado</th>
                      <th className="px-5 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-slate-500 sm:px-6">Ámbito</th>
                      <th className="px-5 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-slate-500 sm:px-6">Slug</th>
                      <th className="px-5 py-2.5 text-right text-xs font-bold uppercase tracking-wider text-slate-500 sm:px-6">Activo</th>
                      <th className="px-5 py-2.5 text-right text-xs font-bold uppercase tracking-wider text-slate-500 sm:px-6">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-mira-line">
                    {cat.markets.map(market => (
                      <tr key={market.id} className="transition-colors hover:bg-mira-canvas/70">
                        <td className="px-5 py-3 font-bold text-mira-ink sm:px-6">
                          <div className="flex items-center gap-2">
                            <TrendingUp size={14} className="shrink-0 text-mira-magenta/50" />
                            {market.name}
                          </div>
                        </td>
                        <td className="px-5 py-3 sm:px-6">
                          <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">
                            {market.country_scope}
                          </span>
                        </td>
                        <td className="px-5 py-3 font-mono text-xs text-slate-400 sm:px-6">{market.slug}</td>
                        <td className="px-5 py-3 text-right sm:px-6">
                          <ToggleButton id={market.id} isActive={market.is_active} onToggle={toggleMarket} />
                        </td>
                        <td className="px-5 py-3 text-right sm:px-6">
                          <div className="flex items-center justify-end gap-2">
                            <Link
                              href={`/admin/mercados/${market.id}`}
                              className="text-xs font-bold text-mira-magenta hover:underline"
                            >
                              Productos
                            </Link>
                            <Link
                              href={`/admin/mercados/${market.id}/editar`}
                              className={miraBtn.icon}
                            >
                              <Pencil size={14} />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

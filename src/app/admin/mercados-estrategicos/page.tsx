import Link from 'next/link'
import { Plus, Pencil, Globe2, ChevronRight } from 'lucide-react'
import { getStrategicMarkets, getCategories, toggleStrategicMarket } from '@/lib/actions/markets'
import { ToggleButton } from '@/components/admin/markets/ToggleButton'
import { MiraPageHeader } from '@/components/mira/MiraPageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { miraBtn } from '@/lib/miraButtons'

export const dynamic = 'force-dynamic'

export default async function MercadosEstrategicosPage() {
  const [strategicMarkets, categories] = await Promise.all([
    getStrategicMarkets(),
    getCategories(),
  ])

  const categoryCounts = new Map<string, number>()
  for (const cat of categories) {
    if (cat.strategic_market_id) {
      categoryCounts.set(cat.strategic_market_id, (categoryCounts.get(cat.strategic_market_id) ?? 0) + 1)
    }
  }

  return (
    <div className="w-full space-y-6 p-4 md:p-6 xl:p-8">
      <MiraPageHeader
        icon={Globe2}
        title="Mercados estratégicos"
        subtitle={`${strategicMarkets.length} ${strategicMarkets.length === 1 ? 'mercado estratégico' : 'mercados estratégicos'} · nivel superior de la segmentación`}
        actions={
          <Link href="/admin/mercados-estrategicos/nuevo" className={miraBtn.primary}>
            <Plus size={15} /> Mercado estratégico
          </Link>
        }
      />

      {strategicMarkets.length === 0 ? (
        <div className="mira-card rounded-2xl">
          <EmptyState
            icon={Globe2}
            title="Aún no hay mercados estratégicos"
            description="Crea el primer mercado estratégico para agrupar las categorías."
            action={{ label: 'Crear mercado estratégico', href: '/admin/mercados-estrategicos/nuevo' }}
          />
        </div>
      ) : (
        <div className="mira-card overflow-hidden rounded-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-mira-line bg-mira-canvas/60">
                  <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500 sm:px-6">Mercado estratégico</th>
                  <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500 sm:px-6">Categorías</th>
                  <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500 sm:px-6">Slug</th>
                  <th className="px-5 py-3 text-right text-xs font-bold uppercase tracking-wider text-slate-500 sm:px-6">Orden</th>
                  <th className="px-5 py-3 text-right text-xs font-bold uppercase tracking-wider text-slate-500 sm:px-6">Activo</th>
                  <th className="px-5 py-3 text-right text-xs font-bold uppercase tracking-wider text-slate-500 sm:px-6">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-mira-line">
                {strategicMarkets.map(sm => {
                  const catCount = categoryCounts.get(sm.id) ?? 0
                  return (
                    <tr key={sm.id} className="transition-colors hover:bg-mira-canvas/70">
                      <td className="px-5 py-3 sm:px-6">
                        <Link
                          href={`/admin/mercados-estrategicos/${sm.id}`}
                          className="flex items-center gap-2.5 hover:opacity-80"
                        >
                          <span className="text-xl">{sm.icon ?? '🌍'}</span>
                          <div>
                            <p className="font-bold text-mira-ink">{sm.name}</p>
                            {sm.description && (
                              <p className="text-xs font-normal text-slate-400">{sm.description}</p>
                            )}
                          </div>
                        </Link>
                      </td>
                      <td className="px-5 py-3 sm:px-6">
                        <Link
                          href={`/admin/mercados-estrategicos/${sm.id}`}
                          className="inline-flex items-center gap-1"
                        >
                          <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${catCount > 0 ? 'bg-mira-magenta-soft text-mira-magenta' : 'bg-slate-100 text-slate-400'}`}>
                            {catCount} {catCount === 1 ? 'categoría' : 'categorías'}
                          </span>
                          {catCount > 0 && <ChevronRight size={12} className="text-mira-magenta" />}
                        </Link>
                      </td>
                      <td className="px-5 py-3 font-mono text-xs text-slate-400 sm:px-6">{sm.slug}</td>
                      <td className="px-5 py-3 text-right text-slate-500 sm:px-6">{sm.sort_order}</td>
                      <td className="px-5 py-3 text-right sm:px-6">
                        <ToggleButton id={sm.id} isActive={sm.is_active} onToggle={toggleStrategicMarket} />
                      </td>
                      <td className="px-5 py-3 text-right sm:px-6">
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/admin/mercados-estrategicos/${sm.id}`}
                            className="text-xs font-bold text-mira-magenta hover:underline"
                          >
                            Ver
                          </Link>
                          <Link href={`/admin/mercados-estrategicos/${sm.id}/editar`} className={miraBtn.icon}>
                            <Pencil size={14} />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

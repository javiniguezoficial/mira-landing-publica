import Link from 'next/link'
import { TrendingUp, Package, ArrowRight, DollarSign, Star } from 'lucide-react'
import { getStrategicMarketGroups } from '@/lib/queries/markets'
import { getMarketAccessContext } from '@/lib/queries/market-access'
import { getFavoriteMarketCards, DASHBOARD_FAVORITES_PERIOD } from '@/lib/queries/favorite-markets'
import { marketPeriodDescription } from '@/lib/markets/period'
import { collectLonjas, resolveLonja, LONJA_PARAM } from '@/lib/markets/lonja'
import { MiraPageHeader } from '@/components/mira/MiraPageHeader'
import { MiraCategoryCard } from '@/components/mira/MiraCategoryCard'
import { EmptyState } from '@/components/shared/EmptyState'
import { ModuleDisabledNotice } from '@/components/shared/ModuleDisabledNotice'
import { FavoriteMarketButton } from '@/components/app/markets/FavoriteMarketButton'
import { FavoriteMarketsBlock } from '@/components/app/markets/FavoriteMarketsBlock'
import { LonjaFilter } from '@/components/app/markets/LonjaFilter'
import { miraBtn } from '@/lib/miraButtons'

export const dynamic = 'force-dynamic'

const BASE_PATH = '/app/market-intelligent'

type SP = { [LONJA_PARAM]?: string }

export default async function MarketIntelligentPage({
  searchParams,
}: {
  searchParams: Promise<SP>
}) {
  // Contexto de acceso resuelto UNA vez: módulo (1.4), mercados deshabilitados
  // (2.2) y favoritos (2.1) en una sola carga. Ningún componente de más abajo
  // vuelve a preguntar.
  const access = await getMarketAccessContext()

  // El módulo se comprueba ANTES de consultar nada: con Market Intelligence
  // apagado no se carga ni se filtra contenido operativo, solo se explica.
  // Se llega aquí tanto desde el menú como escribiendo la URL, y en los dos
  // casos la respuesta es la misma pantalla — no una redirección al Dashboard.
  if (!access.moduleEnabled) {
    return (
      <div className="w-full space-y-6 p-4 md:p-6 xl:p-8">
        <MiraPageHeader
          icon={TrendingUp}
          title="Market Intelligence"
          subtitle="Módulo no disponible para tu organización"
        />
        <ModuleDisabledNotice module="markets" />
      </div>
    )
  }

  const sp = await searchParams
  const [groups, favoritos] = await Promise.all([
    // Los mercados deshabilitados para la organización ya NO llegan aquí:
    // `client_read_markets` los excluye en SQL desde la migración 028. Este
    // listado es, por tanto, exactamente lo que esta organización puede ver.
    getStrategicMarketGroups(),
    getFavoriteMarketCards(),
  ])

  // Lonjas realmente presentes en lo que esta persona puede ver. Se calculan
  // sobre el árbol ya filtrado por RLS, así que nunca aparece una lonja que
  // solo exista en un mercado deshabilitado.
  const lonjasDisponibles = collectLonjas(
    groups.flatMap((g) =>
      g.categories.flatMap((c) => c.markets.flatMap((m) => m.products.map((p) => p.lonja))),
    ),
  )
  const lonjaActiva = resolveLonja(sp[LONJA_PARAM], lonjasDisponibles)

  // El filtro de lonja acota qué PRODUCTOS se listan; un mercado sin productos
  // de esa lonja desaparece, y una categoría sin mercados también.
  const gruposFiltrados = lonjaActiva
    ? groups
        .map((g) => ({
          ...g,
          categories: g.categories
            .map((c) => ({
              ...c,
              markets: c.markets
                .map((m) => ({ ...m, products: m.products.filter((p) => p.lonja === lonjaActiva) }))
                .filter((m) => m.products.length > 0),
            }))
            .filter((c) => c.markets.length > 0),
        }))
        .filter((g) => g.categories.length > 0)
    : groups

  const hasCategories = gruposFiltrados.some((g) => g.categories.length > 0)
  const showStrategicHeaders = gruposFiltrados.some((g) => g.id !== null)

  return (
    <div className="w-full space-y-6 p-4 md:p-6 xl:p-8">
      <MiraPageHeader
        icon={TrendingUp}
        title="Market Intelligence"
        subtitle="Mercados y referencias disponibles en tu plan"
        actions={
          <Link href={`${BASE_PATH}/precios`} className={miraBtn.primary}>
            <DollarSign size={14} /> Ver y filtrar precios
          </Link>
        }
      />

      {/* 1. Favoritos primero: es lo que esta persona ha dicho que le importa. */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Star size={15} className="text-mira-magenta" aria-hidden="true" />
          <h2 className="text-sm font-black uppercase tracking-wider text-mira-ink">
            Mis mercados favoritos
          </h2>
        </div>
        <FavoriteMarketsBlock
          markets={favoritos}
          periodDescription={marketPeriodDescription(DASHBOARD_FAVORITES_PERIOD)}
          showAllLink={false}
        />
      </section>

      {/* 2. Filtro de lonja sobre el catálogo completo. */}
      {lonjasDisponibles.length > 0 && (
        <div className="mira-card flex flex-wrap items-end gap-4 rounded-2xl p-4">
          <LonjaFilter
            available={lonjasDisponibles}
            active={lonjaActiva}
            basePath={BASE_PATH}
            searchParams={sp as Record<string, string | undefined>}
          />
          {lonjaActiva && (
            <Link href={BASE_PATH} className={miraBtn.ghost}>
              Quitar filtro
            </Link>
          )}
        </div>
      )}

      {!hasCategories ? (
        <div className="mira-card rounded-2xl">
          <EmptyState
            icon={TrendingUp}
            title={lonjaActiva ? 'Sin resultados para esta lonja' : 'Sin mercados disponibles'}
            description={
              lonjaActiva
                ? `No hay productos de la lonja «${lonjaActiva}» en los mercados disponibles. Prueba con otra lonja o quita el filtro.`
                : 'No hay mercados disponibles en este momento. Contacta con tu administrador.'
            }
          />
        </div>
      ) : (
        <>
          {/* Navegación rápida por mercado estratégico */}
          {showStrategicHeaders && gruposFiltrados.length > 1 && (
            <nav className="flex flex-wrap gap-2 rounded-2xl border border-mira-line bg-mira-canvas/40 p-3">
              {gruposFiltrados.map(group => (
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
            {gruposFiltrados.map(group => (
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
                            {/* La estrella cierra la fila: alterna sin recargar. */}
                            <span className="ml-auto">
                              <FavoriteMarketButton
                                marketId={market.id}
                                marketName={market.name}
                                initialIsFavorite={access.favoriteMarketIds.has(market.id)}
                              />
                            </span>
                          </div>

                          {market.products.length > 0 && (
                            <div className="flex flex-wrap gap-2 sm:pl-6">
                              {market.products.map(product => (
                                <Link
                                  key={product.id}
                                  href={`${BASE_PATH}/${market.slug}/${product.slug}`}
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

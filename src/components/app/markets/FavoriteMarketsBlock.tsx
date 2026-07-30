import Link from 'next/link'
import { Star, TrendingUp, TrendingDown, Minus, ArrowRight } from 'lucide-react'
import type { FavoriteMarketCard } from '@/lib/queries/favorite-markets'
import { NO_FAVORITES_COPY } from '@/lib/markets/access'
import { formatNumber, currencySymbol, unitLabel } from '@/lib/utils'
import { cn } from '@/lib/utils'

interface Props {
  markets: FavoriteMarketCard[]
  /** Texto que describe la ventana temporal de la variación mostrada. */
  periodDescription: string
  /** Si se enseña el enlace a Market Intelligence (sobra estando ya allí). */
  showAllLink?: boolean
}

/**
 * Bloque de mercados favoritos (2.1).
 *
 * Compartido por el Dashboard y por Market Intelligence para que los dos sitios
 * no puedan describir el mismo estado de dos maneras.
 *
 * ── Estado vacío ────────────────────────────────────────────────────────────
 *
 * Cuando no hay favoritos NO se pinta una sección vacía ni se oculta el bloque
 * sin más: se explica cómo se añaden. Alguien que nunca ha visto la estrella no
 * puede adivinar que existe.
 *
 * ── Sobre lo que no se ve ───────────────────────────────────────────────────
 *
 * Los favoritos que apuntan a un mercado deshabilitado para la organización ya
 * vienen filtrados por `getFavoriteMarketCards`, y RLS los habría quitado
 * igualmente. Aquí no se menciona que existen: sería informar de un mercado que
 * esta organización no puede ver.
 */
export function FavoriteMarketsBlock({ markets, periodDescription, showAllLink = true }: Props) {
  if (markets.length === 0) {
    return (
      <div className="mira-card rounded-2xl">
        <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-mira-magenta-soft">
            <Star size={18} className="text-mira-magenta" aria-hidden="true" />
          </div>
          <p className="text-sm font-bold text-mira-ink">{NO_FAVORITES_COPY.title}</p>
          <p className="max-w-xs text-xs text-slate-500">{NO_FAVORITES_COPY.description}</p>
          {showAllLink && (
            <Link
              href="/app/market-intelligent"
              className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-mira-magenta hover:underline"
            >
              Ir a Market Intelligence <ArrowRight size={12} aria-hidden="true" />
            </Link>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {markets.map((market) => {
        const sinDatos = market.lastPrice === null
        const subiendo = (market.change ?? 0) > 0
        const plano = (market.change ?? 0) === 0
        const ChangeIcon = plano ? Minus : subiendo ? TrendingUp : TrendingDown
        // En precios de compra, subir es malo: el color sigue esa lectura, igual
        // que en el detalle de producto.
        const changeColor = plano
          ? 'text-slate-500'
          : subiendo
            ? 'text-red-600'
            : 'text-emerald-600'

        const href = market.productSlug
          ? `/app/market-intelligent/${market.slug}/${market.productSlug}`
          : '/app/market-intelligent'

        return (
          <Link
            key={market.id}
            href={href}
            className="mira-card group flex flex-col gap-2 rounded-2xl p-4 transition-all hover:-translate-y-0.5 hover:border-mira-magenta/30 hover:shadow-sm"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-mira-ink transition-colors group-hover:text-mira-magenta">
                  {market.name}
                </p>
                <p className="truncate text-[11px] text-slate-400">
                  {market.categoryName} · {market.countryScope}
                </p>
              </div>
              <Star
                size={14}
                className="shrink-0 fill-current text-mira-magenta"
                aria-label="Mercado favorito"
              />
            </div>

            {sinDatos ? (
              <p className="text-xs text-slate-400">Sin precios en {periodDescription.toLowerCase()}</p>
            ) : (
              <>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-lg font-black text-mira-ink">
                    {formatNumber(market.lastPrice as number, 2)}
                  </span>
                  <span className="text-xs font-bold text-slate-400">
                    {currencySymbol(market.currency ?? 'EUR')}/{unitLabel(market.unit ?? '')}
                  </span>
                </div>

                <div className="flex items-center justify-between gap-2">
                  {market.change !== null && (
                    <span className={cn('inline-flex items-center gap-1 text-xs font-bold', changeColor)}>
                      <ChangeIcon size={12} aria-hidden="true" />
                      {market.change > 0 ? '+' : ''}
                      {formatNumber(market.change, 2)}%
                    </span>
                  )}
                  {market.lastDate && (
                    <span className="text-[10px] text-slate-400">
                      {new Date(market.lastDate).toLocaleDateString('es-ES', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </span>
                  )}
                </div>
              </>
            )}
          </Link>
        )
      })}
    </div>
  )
}

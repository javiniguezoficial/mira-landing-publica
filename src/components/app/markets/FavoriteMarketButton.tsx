'use client'

import { useOptimistic, useState, useTransition } from 'react'
import { Star } from 'lucide-react'
import { toggleMarketFavorite } from '@/lib/actions/market-favorites'
import { cn } from '@/lib/utils'

interface Props {
  marketId: string
  marketName: string
  initialIsFavorite: boolean
  /** `icon` para las tarjetas del listado; `button` para la cabecera de detalle. */
  variant?: 'icon' | 'button'
}

/**
 * Estrella para marcar un mercado como favorito (2.1).
 *
 * ── Por qué optimista ───────────────────────────────────────────────────────
 *
 * `useOptimistic` pinta el estado nuevo antes de que responda el servidor, así
 * que la estrella reacciona al instante y la página NO se recarga entera. Si la
 * acción falla, React descarta el valor optimista y vuelve solo el real — no
 * hay que revertir nada a mano.
 *
 * ── Clics repetidos ─────────────────────────────────────────────────────────
 *
 * El botón se deshabilita mientras hay una transición en curso, pero eso es
 * comodidad, no la garantía: la garantía es el índice único
 * `(user_id, market_id)` y el `upsert` de la Server Action. Dos pestañas
 * abiertas no pasan por este `disabled` y aun así no pueden duplicar la fila.
 *
 * ── Accesibilidad ───────────────────────────────────────────────────────────
 *
 * `aria-pressed` comunica el estado a un lector de pantalla, cosa que el color
 * de la estrella por sí solo no hace. El `aria-label` nombra el mercado, porque
 * en un listado hay muchas estrellas y «Añadir a favoritos» a secas no
 * distingue cuál. El `title` da la misma información al pasar el ratón.
 */
export function FavoriteMarketButton({
  marketId,
  marketName,
  initialIsFavorite,
  variant = 'icon',
}: Props) {
  const [isFavorite, setIsFavorite] = useState(initialIsFavorite)
  const [optimistic, setOptimistic] = useOptimistic(isFavorite)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function alternar() {
    const siguiente = !optimistic
    setError(null)
    startTransition(async () => {
      setOptimistic(siguiente)
      const resultado = await toggleMarketFavorite(marketId, siguiente)
      if (resultado?.error) {
        setError(resultado.error)
        return
      }
      setIsFavorite(siguiente)
    })
  }

  const etiqueta = optimistic
    ? `Quitar ${marketName} de favoritos`
    : `Añadir ${marketName} a favoritos`

  if (variant === 'button') {
    return (
      <div className="flex flex-col items-start gap-1">
        <button
          type="button"
          onClick={alternar}
          disabled={pending}
          aria-pressed={optimistic}
          aria-label={etiqueta}
          title={etiqueta}
          className={cn(
            'inline-flex items-center justify-center gap-1.5 rounded-xl border px-4 py-2 text-sm font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-60',
            optimistic
              ? 'border-mira-magenta/30 bg-mira-magenta-soft text-mira-magenta'
              : 'border-mira-line bg-white text-slate-600 hover:border-mira-magenta/30 hover:text-mira-magenta',
          )}
        >
          <Star size={14} className={cn(optimistic && 'fill-current')} aria-hidden="true" />
          {optimistic ? 'En favoritos' : 'Añadir a favoritos'}
        </button>
        {error && <span className="text-[11px] font-semibold text-red-600">{error}</span>}
      </div>
    )
  }

  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        onClick={alternar}
        disabled={pending}
        aria-pressed={optimistic}
        aria-label={etiqueta}
        title={etiqueta}
        className={cn(
          'inline-flex items-center justify-center rounded-lg p-1.5 transition-colors disabled:cursor-not-allowed disabled:opacity-60',
          optimistic
            ? 'text-mira-magenta hover:bg-mira-magenta-soft'
            : 'text-slate-300 hover:bg-mira-magenta-soft hover:text-mira-magenta',
        )}
      >
        <Star size={15} className={cn(optimistic && 'fill-current')} aria-hidden="true" />
      </button>
      {error && <span className="max-w-[160px] text-right text-[10px] text-red-600">{error}</span>}
    </span>
  )
}

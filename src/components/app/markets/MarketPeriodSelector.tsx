import Link from 'next/link'
import { CalendarRange } from 'lucide-react'
import {
  MARKET_PERIODS,
  buildPeriodHref,
  marketPeriodDescription,
  type MarketPeriod,
} from '@/lib/markets/period'
import { cn } from '@/lib/utils'

interface Props {
  active: MarketPeriod
  /** Ruta sobre la que se construyen los enlaces (sin query). */
  basePath: string
  /** Search params actuales, para no perder mercado, producto ni lonja al cambiar. */
  searchParams: Record<string, string | undefined>
}

/**
 * Selector de periodo temporal (2.3).
 *
 * ── Por qué son enlaces y no botones ────────────────────────────────────────
 *
 * Cada periodo es una URL distinta, así que el control natural es un enlace:
 * se puede compartir, marcar y abrir en otra pestaña, y el estado sobrevive a
 * una recarga. Además esto es un Server Component sin JavaScript propio — el
 * filtrado ocurre entero en la consulta, nunca trayendo el histórico al
 * navegador para recortarlo después.
 *
 * ── Etiquetas ───────────────────────────────────────────────────────────────
 *
 * Las etiquetas visibles son EXACTAMENTE `W`, `3W`, `6W`, `Y`, `3Y` y `ALL`.
 * Por sí solas no se entienden, así que cada una lleva su descripción completa
 * en `aria-label` y en `title`: quien use lector de pantalla oye «Últimas 3
 * semanas (21 días)», no la letra suelta.
 */
export function MarketPeriodSelector({ active, basePath, searchParams }: Props) {
  return (
    <div
      role="group"
      aria-label="Periodo de tiempo"
      className="inline-flex flex-wrap items-center gap-1 rounded-xl border border-mira-line bg-white p-1"
    >
      <span className="flex items-center gap-1.5 pl-2 pr-1 text-[11px] font-bold uppercase tracking-wider text-slate-400">
        <CalendarRange size={13} aria-hidden="true" />
        Periodo
      </span>

      {MARKET_PERIODS.map((period) => {
        const isActive = period === active
        const description = marketPeriodDescription(period)

        return (
          <Link
            key={period}
            href={buildPeriodHref(basePath, searchParams, period)}
            scroll={false}
            aria-label={description}
            aria-current={isActive ? 'true' : undefined}
            title={description}
            className={cn(
              'rounded-lg px-2.5 py-1.5 text-xs font-bold transition-colors',
              isActive
                ? 'bg-mira-magenta text-white shadow-sm shadow-mira-magenta/25'
                : 'text-slate-500 hover:bg-mira-magenta-soft hover:text-mira-magenta',
            )}
          >
            {period}
          </Link>
        )
      })}
    </div>
  )
}

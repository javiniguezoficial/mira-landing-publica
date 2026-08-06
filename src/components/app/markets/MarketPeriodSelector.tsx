import Link from 'next/link'
import { CalendarRange } from 'lucide-react'
import {
  MARKET_FROM_PARAM,
  MARKET_PERIODS,
  MARKET_PERIOD_PARAM,
  MARKET_PERIOD_QUERY_KEYS,
  MARKET_TO_PARAM,
  buildPeriodHref,
  marketPeriodDescription,
  marketPeriodLabel,
  type MarketPeriod,
} from '@/lib/markets/period'
import { miraBtn, miraField } from '@/lib/miraButtons'
import { cn } from '@/lib/utils'

interface Props {
  /** Periodo PEDIDO. Con un rango a medida inválido sigue siendo `CUSTOM`. */
  active: MarketPeriod
  /** Ruta sobre la que se construyen los enlaces (sin query). */
  basePath: string
  /** Search params actuales, para no perder mercado, producto ni lonja al cambiar. */
  searchParams: Record<string, string | undefined>
  /** Lo que se escribió en el rango, para repintarlo tal cual. */
  customFrom?: string
  customTo?: string
  /** Motivo por el que el rango no vale, si lo hay. */
  customError?: string | null
}

/**
 * Selector de periodo temporal (2.3, ampliado en 037).
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
 * Las etiquetas visibles son EXACTAMENTE `W`, `3W`, `6W`, `Y`, `3Y`, `ALL` y
 * `Personalizado`. Las seis primeras no se entienden por sí solas, así que cada
 * una lleva su descripción completa en `aria-label` y en `title`: quien use
 * lector de pantalla oye «Últimas 3 semanas (21 días)», no la letra suelta.
 *
 * ── El rango a medida (037) ─────────────────────────────────────────────────
 *
 * Es un `<form method="GET">`, no un control con estado de cliente. Así sigue
 * funcionando sin JavaScript, el rango acaba en la URL igual que los atajos y
 * sobrevive a una recarga sin ningún efecto ni ninguna sincronización.
 *
 * Los campos ocultos arrastran el resto de la query —lonja, mercado— porque un
 * `<form>` GET reemplaza la query entera al enviarse. Sin ellos, elegir un
 * rango de fechas borraría en silencio el filtro de país.
 */
export function MarketPeriodSelector({
  active,
  basePath,
  searchParams,
  customFrom = '',
  customTo = '',
  customError = null,
}: Props) {
  const esCustom = active === 'CUSTOM'

  // Lo que hay que conservar al enviar el formulario: todo menos los tres
  // parámetros de periodo (que pone el propio formulario) y `page`, que con
  // otra ventana temporal ya no significa lo mismo.
  const conservados: [string, string][] = []
  for (const [key, value] of Object.entries(searchParams)) {
    if (typeof value !== 'string' || value === '') continue
    if (key === 'page') continue
    if ((MARKET_PERIOD_QUERY_KEYS as readonly string[]).includes(key)) continue
    conservados.push([key, value])
  }

  return (
    <div className="space-y-2">
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
              href={buildPeriodHref(basePath, searchParams, period, {
                from: customFrom,
                to: customTo,
              })}
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
              {marketPeriodLabel(period)}
            </Link>
          )
        })}
      </div>

      {esCustom && (
        <form
          method="GET"
          action={basePath}
          className="flex flex-wrap items-end gap-2 rounded-xl border border-mira-line bg-white p-3"
        >
          <input type="hidden" name={MARKET_PERIOD_PARAM} value="CUSTOM" />
          {conservados.map(([key, value]) => (
            <input key={key} type="hidden" name={key} value={value} />
          ))}

          <div>
            <label
              htmlFor="mira-period-from"
              className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-400"
            >
              Fecha desde
            </label>
            <input
              id="mira-period-from"
              type="date"
              name={MARKET_FROM_PARAM}
              defaultValue={customFrom}
              aria-invalid={customError ? 'true' : undefined}
              aria-describedby={customError ? 'mira-period-error' : undefined}
              className={cn(miraField, 'w-auto')}
            />
          </div>

          <div>
            <label
              htmlFor="mira-period-to"
              className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-400"
            >
              Fecha hasta
            </label>
            <input
              id="mira-period-to"
              type="date"
              name={MARKET_TO_PARAM}
              defaultValue={customTo}
              aria-invalid={customError ? 'true' : undefined}
              aria-describedby={customError ? 'mira-period-error' : undefined}
              className={cn(miraField, 'w-auto')}
            />
          </div>

          <button type="submit" className={miraBtn.primary}>
            Aplicar rango
          </button>

          {customError && (
            // `role="alert"` y no un simple párrafo: el error aparece tras
            // enviar el formulario y debe anunciarse, no quedarse esperando a
            // que alguien vuelva a recorrer la página con el lector.
            <p
              id="mira-period-error"
              role="alert"
              className="w-full text-xs font-semibold text-red-600"
            >
              {customError}
            </p>
          )}

          {!customError && (
            <p className="w-full text-[11px] text-slate-400">
              Ambas fechas se incluyen en el resultado.
            </p>
          )}
        </form>
      )}
    </div>
  )
}

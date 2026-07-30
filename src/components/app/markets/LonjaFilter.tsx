'use client'

import { useRouter } from 'next/navigation'
import { Landmark } from 'lucide-react'
import { ALL_LONJAS_LABEL, LONJA_PARAM, lonjaAriaLabel } from '@/lib/markets/lonja'
import { miraField } from '@/lib/miraButtons'

interface Props {
  /** Lonjas realmente disponibles para el mercado o producto actual. */
  available: string[]
  active: string
  basePath: string
  searchParams: Record<string, string | undefined>
}

/**
 * Selector de lonja (2.4).
 *
 * ── Qué ofrece ──────────────────────────────────────────────────────────────
 *
 * SOLO las lonjas del mercado o producto que se está mirando, calculadas en
 * servidor. Nunca el catálogo completo de las 102 lonjas del sistema: eso
 * ofrecería opciones sin datos y, peor, dejaría entrever qué lonjas existen en
 * mercados que esta organización no puede ver.
 *
 * ── Estado vacío ────────────────────────────────────────────────────────────
 *
 * Si no hay ninguna lonja informada, no se pinta un desplegable vacío: se dice
 * que no hay lonjas para este mercado. Un `<select>` con una sola opción
 * inservible es peor que no tener el control.
 *
 * ── Navegación ──────────────────────────────────────────────────────────────
 *
 * Cambiar de lonja reescribe la URL conservando el resto —muy en particular el
 * periodo—, así que los dos filtros se combinan. Se quita `page` porque la
 * paginación anterior ya no significa lo mismo. `router.push` navega sin
 * recargar la página entera.
 */
export function LonjaFilter({ available, active, basePath, searchParams }: Props) {
  const router = useRouter()

  if (available.length === 0) {
    return (
      <p className="text-xs text-slate-400">
        No hay lonjas informadas para esta selección.
      </p>
    )
  }

  function cambiar(value: string) {
    const params = new URLSearchParams()
    for (const [key, raw] of Object.entries(searchParams)) {
      if (key === LONJA_PARAM || key === 'page' || !raw) continue
      params.set(key, raw)
    }
    if (value) params.set(LONJA_PARAM, value)

    const qs = params.toString()
    router.push(qs ? `${basePath}?${qs}` : basePath, { scroll: false })
  }

  return (
    <div className="min-w-[200px]">
      <label
        htmlFor="mira-lonja-filter"
        className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400"
      >
        <Landmark size={13} aria-hidden="true" />
        Lonja
      </label>
      <select
        id="mira-lonja-filter"
        value={active}
        onChange={(e) => cambiar(e.target.value)}
        aria-label={lonjaAriaLabel(active)}
        className={miraField}
      >
        <option value="">{ALL_LONJAS_LABEL}</option>
        {available.map((lonja) => (
          <option key={lonja} value={lonja}>
            {lonja}
          </option>
        ))}
      </select>
    </div>
  )
}

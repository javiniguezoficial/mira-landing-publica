'use client'

import { useRouter } from 'next/navigation'
import { Globe2, Landmark } from 'lucide-react'
import {
  ALL_COUNTRIES_LABEL,
  ALL_LONJAS_LABEL,
  COUNTRY_FILTER_LABEL,
  LONJA_FILTER_LABEL,
  LONJA_PARAM,
  lonjaAriaLabel,
} from '@/lib/markets/lonja'
import { miraField } from '@/lib/miraButtons'

interface Props {
  /** Lonjas realmente disponibles para el mercado o producto actual. */
  available: string[]
  active: string
  basePath: string
  searchParams: Record<string, string | undefined>
  /**
   * 034 — oculta la opción «Todas las lonjas».
   *
   * Se usa en la ficha de producto, donde el gráfico dibuja UNA serie: ofrecer
   * «todas» ahí significaría pintar los precios de España, Alemania y Europa
   * como una sola línea con saltos, que es peor que no poder elegirlo. En el
   * catálogo, donde «todas» solo significa «no filtres el listado», sí se
   * ofrece.
   */
  requireSelection?: boolean
  /**
   * 037 — rótulo VISIBLE del selector.
   *
   * La portada lo presenta como «País» y la ficha de producto sigue diciendo
   * «Lonja». Solo cambia el texto: mismo parámetro, misma consulta, mismos
   * valores. Ver `lib/markets/lonja.ts` para el porqué de la distinción.
   */
  label?: string
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
export function LonjaFilter({
  available,
  active,
  basePath,
  searchParams,
  requireSelection = false,
  label = LONJA_FILTER_LABEL,
}: Props) {
  const router = useRouter()

  const esPais = label === COUNTRY_FILTER_LABEL
  const Icono = esPais ? Globe2 : Landmark
  const etiquetaTodas = esPais ? ALL_COUNTRIES_LABEL : ALL_LONJAS_LABEL

  if (available.length === 0) {
    return (
      <p className="text-xs text-slate-400">
        {esPais
          ? 'No hay países informados para esta selección.'
          : 'No hay lonjas informadas para esta selección.'}
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
        <Icono size={13} aria-hidden="true" />
        {label}
        {/* 037 — con veinte o treinta opciones conviene decir cuántas hay antes
            de abrir el desplegable. «Canal Estándar» cotiza en 20 plazas y
            «Leche Mundo» en 27; hasta ahora solo se veían 8 y nada indicaba que
            faltaran las demás. */}
        {available.length > 8 && (
          <span className="rounded-md bg-mira-canvas px-1.5 py-0.5 text-[10px] font-bold text-slate-400">
            {available.length}
          </span>
        )}
      </label>
      {/*
        Se mantiene un `<select>` nativo, y es una decisión:

        · desplegable con scroll propio, sin romper el diseño con 27 opciones;
        · teclado y lector de pantalla gratis, sin reimplementar el patrón
          combobox de ARIA;
        · en móvil abre el selector del sistema, que ya trae búsqueda.

        La alternativa —un botón por lonja— era justo lo que había que evitar.
      */}
      <select
        id="mira-lonja-filter"
        value={active}
        onChange={(e) => cambiar(e.target.value)}
        aria-label={lonjaAriaLabel(active, label)}
        className={miraField}
      >
        {!requireSelection && <option value="">{etiquetaTodas}</option>}
        {available.map((lonja) => (
          <option key={lonja} value={lonja}>
            {lonja}
          </option>
        ))}
      </select>
    </div>
  )
}

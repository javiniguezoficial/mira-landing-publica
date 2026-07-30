// Filtros temporales rápidos de Market Intelligence (Fase 2.3).
//
// Módulo puro: sin Next, sin Supabase, sin `Date.now()` implícito repartido por
// componentes. Es la ÚNICA fuente de verdad sobre qué periodos existen, cómo se
// escriben en la URL y qué fecha inicial produce cada uno.
//
// ── Semántica, decidida y fijada aquí ───────────────────────────────────────
//
//   · VENTANA MÓVIL desde hoy, no calendario. `W` son «los últimos 7 días»,
//     no «la semana en curso». Es lo que espera quien mira precios: la
//     comparación no debe cambiar de tamaño según el día de la semana.
//   · LÍMITE INFERIOR INCLUSIVO. La consulta usa `recorded_at >= desde`, así
//     que el día `desde` entra. `W` cubre por tanto hoy y los 6 anteriores.
//   · SIN LÍMITE SUPERIOR. No se recorta por arriba: si hay precios con fecha
//     futura —los hay: el histórico llega a 2026-07-01— deben verse. Poner un
//     `<= hoy` los ocultaría sin que nadie lo hubiera pedido.
//   · FECHA CIVIL, NO INSTANTE. `product_price_records.recorded_at` es `date`,
//     no `timestamptz`. Se compara contra `YYYY-MM-DD` en horario LOCAL del
//     servidor, nunca contra un ISO en UTC: `toISOString()` sobre una fecha
//     local de madrugada retrocede un día y desplazaría la ventana entera.
//
// La columna temporal real es `recorded_at`, la fecha del dato. NUNCA
// `created_at`, que es cuándo se importó la fila y no dice nada del mercado.

/** Los periodos que existen. Las etiquetas visibles son exactamente estas. */
export const MARKET_PERIODS = ['W', '3W', '6W', 'Y', '3Y', 'ALL'] as const

export type MarketPeriod = (typeof MARKET_PERIODS)[number]

/**
 * Periodo por defecto.
 *
 * `Y` — un año. Cubre el ciclo agrícola completo, que es la unidad con la que
 * se razona en estos mercados, y evita que un producto con datos mensuales
 * aparezca como una gráfica vacía. Las vistas anteriores a 2.3 usaban ventanas
 * de 90 días fijas; ninguna era un default declarado que haya que respetar.
 */
export const DEFAULT_MARKET_PERIOD: MarketPeriod = 'Y'

/** Nombre del search param. Un solo sitio donde cambiarlo. */
export const MARKET_PERIOD_PARAM = 'period'

interface PeriodDefinition {
  /** Días hacia atrás desde hoy. `null` = todo el histórico. */
  days: number | null
  /** Texto completo para `aria-label` y tooltip: la etiqueta sola no se entiende. */
  description: string
}

const DEFINITIONS: Record<MarketPeriod, PeriodDefinition> = {
  W:   { days: 7,      description: 'Última semana (7 días)' },
  '3W': { days: 21,    description: 'Últimas 3 semanas (21 días)' },
  '6W': { days: 42,    description: 'Últimas 6 semanas (42 días)' },
  Y:   { days: 365,    description: 'Último año' },
  '3Y': { days: 1095,  description: 'Últimos 3 años' },
  ALL: { days: null,   description: 'Todo el histórico disponible' },
}

export function isMarketPeriod(value: unknown): value is MarketPeriod {
  return MARKET_PERIODS.some((p) => p === value)
}

/**
 * Normaliza lo que llega de la URL.
 *
 * Fail-safe hacia el DEFAULT, no hacia `ALL`: un valor corrupto no debe hacer
 * que la consulta barra el histórico entero sin que nadie lo haya pedido.
 * Acepta minúsculas por comodidad (`?period=w`), porque escribir la URL a mano
 * es un caso real y no hay ninguna razón para castigarlo.
 */
export function parseMarketPeriod(raw: unknown): MarketPeriod {
  if (typeof raw !== 'string') return DEFAULT_MARKET_PERIOD
  const upper = raw.trim().toUpperCase()
  return isMarketPeriod(upper) ? upper : DEFAULT_MARKET_PERIOD
}

/** Texto completo del periodo, para `aria-label`, `title` y textos de ayuda. */
export function marketPeriodDescription(period: MarketPeriod): string {
  return DEFINITIONS[period].description
}

/** Días que abarca el periodo. `null` en `ALL`. Útil para tests y para depurar. */
export function marketPeriodDays(period: MarketPeriod): number | null {
  return DEFINITIONS[period].days
}

/**
 * Formatea una fecha como `YYYY-MM-DD` en horario LOCAL.
 *
 * No se usa `toISOString().slice(0, 10)`: ese convierte a UTC primero, así que
 * en España (UTC+1/+2) una fecha local a las 00:30 se convierte en el día
 * ANTERIOR. Sobre una columna `date` eso desplaza la ventana un día completo,
 * y el error solo aparece de madrugada — justo cuando nadie está mirando.
 */
export function toDateOnly(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Fecha inicial del periodo, en formato `YYYY-MM-DD`. `null` para `ALL`.
 *
 * El resultado va directo a `recorded_at >= …`, así que el filtrado ocurre en
 * PostgreSQL: nunca se trae el histórico al navegador para recortarlo después.
 *
 * `now` es inyectable para poder probar el cálculo sin depender del reloj.
 *
 * La resta se hace con `setDate()`, que normaliza meses, años y bisiestos por
 * sí solo. `3Y` se define como 1095 días —tres años de 365— y no como «misma
 * fecha hace tres años»: es una ventana móvil, y así el tamaño de la ventana no
 * depende de cuántos 29 de febrero caigan dentro.
 */
export function marketPeriodStartDate(
  period: MarketPeriod,
  now: Date = new Date(),
): string | null {
  const days = DEFINITIONS[period].days
  if (days === null) return null

  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  // `days - 1` porque el límite es INCLUSIVO: W debe cubrir hoy más 6 días
  // atrás, que son 7 días de datos, no 8.
  start.setDate(start.getDate() - (days - 1))
  return toDateOnly(start)
}

/**
 * Todo lo que una superficie necesita saber del periodo activo, resuelto una
 * sola vez. Evita que cada componente vuelva a llamar al parser y al cálculo.
 */
export interface ResolvedMarketPeriod {
  period: MarketPeriod
  /** `YYYY-MM-DD` inclusivo, o `null` en `ALL`. */
  from: string | null
  description: string
}

export function resolveMarketPeriod(
  raw: unknown,
  now: Date = new Date(),
): ResolvedMarketPeriod {
  const period = parseMarketPeriod(raw)
  return {
    period,
    from: marketPeriodStartDate(period, now),
    description: marketPeriodDescription(period),
  }
}

/**
 * Conserva el resto de la query al cambiar de periodo.
 *
 * Cambiar el periodo NO debe perder el mercado, el producto ni la lonja que la
 * persona ya había elegido, y navegar a otro producto tampoco debe reiniciar el
 * periodo. Se elimina `page` a propósito: con otra ventana temporal, la página
 * 7 del listado anterior no significa nada.
 */
export function buildPeriodHref(
  basePath: string,
  current: URLSearchParams | Record<string, string | undefined>,
  period: MarketPeriod,
): string {
  const params = new URLSearchParams()

  const entries: [string, string | undefined][] =
    current instanceof URLSearchParams
      ? Array.from(current.entries())
      : Object.entries(current)

  for (const [key, value] of entries) {
    if (key === MARKET_PERIOD_PARAM || key === 'page' || typeof value !== 'string' || !value) {
      continue
    }
    params.set(key, value)
  }

  params.set(MARKET_PERIOD_PARAM, period)
  const qs = params.toString()
  return qs ? `${basePath}?${qs}` : basePath
}

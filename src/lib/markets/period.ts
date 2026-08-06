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

import { formatCivilDateNumeric, parseCivilDate } from './chart-dates'

/**
 * Los periodos que existen.
 *
 * `CUSTOM` se añade al final a propósito: los seis atajos siguen ocupando el
 * mismo sitio y en el mismo orden, y el rango a medida es lo último que se
 * ofrece. Su etiqueta visible NO es «CUSTOM» sino «Personalizado» — ver
 * `marketPeriodLabel`.
 */
export const MARKET_PERIODS = ['W', '3W', '6W', 'Y', '3Y', 'ALL', 'CUSTOM'] as const

export type MarketPeriod = (typeof MARKET_PERIODS)[number]

/** Los seis atajos de ventana móvil, sin el rango a medida. */
export const MARKET_QUICK_PERIODS = MARKET_PERIODS.filter(
  (p): p is Exclude<MarketPeriod, 'CUSTOM'> => p !== 'CUSTOM',
)

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

/** Extremos del rango personalizado en la URL. Ambos INCLUSIVOS. */
export const MARKET_FROM_PARAM = 'from'
export const MARKET_TO_PARAM = 'to'

/** Los tres parámetros que describen la ventana temporal. */
export const MARKET_PERIOD_QUERY_KEYS = [
  MARKET_PERIOD_PARAM,
  MARKET_FROM_PARAM,
  MARKET_TO_PARAM,
] as const

interface PeriodDefinition {
  /** Días hacia atrás desde hoy. `null` = todo el histórico o rango explícito. */
  days: number | null
  /** Texto completo para `aria-label` y tooltip: la etiqueta sola no se entiende. */
  description: string
  /** Lo que se lee en el botón. Coincide con la clave salvo en `CUSTOM`. */
  label: string
}

const DEFINITIONS: Record<MarketPeriod, PeriodDefinition> = {
  W:   { days: 7,      description: 'Última semana (7 días)',      label: 'W' },
  '3W': { days: 21,    description: 'Últimas 3 semanas (21 días)', label: '3W' },
  '6W': { days: 42,    description: 'Últimas 6 semanas (42 días)', label: '6W' },
  Y:   { days: 365,    description: 'Último año',                  label: 'Y' },
  '3Y': { days: 1095,  description: 'Últimos 3 años',              label: '3Y' },
  ALL: { days: null,   description: 'Todo el histórico disponible', label: 'ALL' },
  CUSTOM: {
    days: null,
    description: 'Rango de fechas personalizado',
    label: 'Personalizado',
  },
}

/** Etiqueta VISIBLE del periodo. `CUSTOM` se lee «Personalizado». */
export function marketPeriodLabel(period: MarketPeriod): string {
  return DEFINITIONS[period].label
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

// ── Rango personalizado ─────────────────────────────────────────────────────
//
// ── Semántica, fijada aquí igual que la de los atajos ───────────────────────
//
//   · LOS DOS EXTREMOS SON INCLUSIVOS. `from=2025-01-01&to=2025-01-31` cubre
//     enero entero, el 1 y el 31 incluidos. La consulta usa `>= from` y
//     `<= to` sobre `recorded_at`, que es una columna `date`.
//   · FECHAS CIVILES, NO INSTANTES. No se convierte a `timestamptz` en ningún
//     punto: no hay hora, no hay zona y por tanto no hay día que se desplace.
//   · NO SE CORRIGE NADA. Si la fecha de inicio es posterior a la final, es un
//     error que se enseña — no se intercambian los extremos. Intercambiarlos
//     devolvería datos que nadie ha pedido y el error pasaría inadvertido.
//   · UN RANGO INVÁLIDO NO ABRE EL HISTÓRICO. Se cae al periodo por DEFECTO,
//     nunca a `ALL`: una fecha mal escrita no puede acabar barriendo la tabla
//     entera.

export interface CustomRange {
  from: string
  to: string
}

export interface CustomRangeResult {
  range?: CustomRange
  error?: string
}

/**
 * Valida el rango que llega por URL o por formulario.
 *
 * Devuelve `{ error }` en lugar de lanzar: esto viene de un campo de fecha y un
 * rango mal puesto es un mensaje que enseñar, no una excepción.
 */
export function parseCustomRange(
  rawFrom: unknown,
  rawTo: unknown,
): CustomRangeResult {
  const from = typeof rawFrom === 'string' ? rawFrom.trim() : ''
  const to = typeof rawTo === 'string' ? rawTo.trim() : ''

  if (!from && !to) {
    return { error: 'Indica la fecha de inicio y la fecha final del rango.' }
  }
  if (!from) return { error: 'Falta la fecha de inicio del rango.' }
  if (!to) return { error: 'Falta la fecha final del rango.' }

  if (!parseCivilDate(from)) {
    return { error: `La fecha de inicio «${from}» no es una fecha válida (AAAA-MM-DD).` }
  }
  if (!parseCivilDate(to)) {
    return { error: `La fecha final «${to}» no es una fecha válida (AAAA-MM-DD).` }
  }

  // Comparación de cadenas `YYYY-MM-DD`: el orden lexicográfico y el
  // cronológico coinciden, así que no hace falta construir dos `Date`.
  if (from > to) {
    return {
      error: `La fecha de inicio (${formatCivilDateNumeric(from)}) no puede ser posterior a la final (${formatCivilDateNumeric(to)}).`,
    }
  }

  return { range: { from, to } }
}

/** Descripción legible del rango: «Del 01/01/2025 al 31/01/2025». */
export function customRangeDescription(range: CustomRange): string {
  return `Del ${formatCivilDateNumeric(range.from)} al ${formatCivilDateNumeric(range.to)}`
}

/**
 * Todo lo que una superficie necesita saber del periodo activo, resuelto una
 * sola vez. Evita que cada componente vuelva a llamar al parser y al cálculo.
 */
export interface ResolvedMarketPeriod {
  /**
   * Periodo EFECTIVO, el que se consulta.
   *
   * Con un rango personalizado mal escrito NO es `CUSTOM`: es el periodo por
   * defecto, porque es lo que de verdad se está enseñando.
   */
  period: MarketPeriod
  /**
   * Periodo PEDIDO en la URL.
   *
   * Se conserva aparte para que el selector siga marcando «Personalizado» y los
   * campos de fecha sigan abiertos con lo que se escribió, en lugar de saltar a
   * otra pestaña y perder el error de vista.
   */
  requested: MarketPeriod
  /** `YYYY-MM-DD` inclusivo, o `null` en `ALL`. */
  from: string | null
  /** `YYYY-MM-DD` inclusivo. Solo lo fija `CUSTOM`; `null` en el resto. */
  to: string | null
  description: string
  /** Motivo por el que el rango personalizado no vale, o `null`. */
  customError: string | null
  /** Lo que se escribió, tal cual, para repintar los campos sin corregirlo. */
  customFromInput: string
  customToInput: string
}

export function resolveMarketPeriod(
  raw: unknown,
  now: Date = new Date(),
  rawFrom: unknown = undefined,
  rawTo: unknown = undefined,
): ResolvedMarketPeriod {
  const requested = parseMarketPeriod(raw)
  const customFromInput = typeof rawFrom === 'string' ? rawFrom.trim() : ''
  const customToInput = typeof rawTo === 'string' ? rawTo.trim() : ''

  if (requested !== 'CUSTOM') {
    return {
      period: requested,
      requested,
      from: marketPeriodStartDate(requested, now),
      to: null,
      description: marketPeriodDescription(requested),
      customError: null,
      customFromInput,
      customToInput,
    }
  }

  const { range, error } = parseCustomRange(customFromInput, customToInput)

  if (!range) {
    return {
      period: DEFAULT_MARKET_PERIOD,
      requested: 'CUSTOM',
      from: marketPeriodStartDate(DEFAULT_MARKET_PERIOD, now),
      to: null,
      description: marketPeriodDescription(DEFAULT_MARKET_PERIOD),
      customError: error ?? 'Rango de fechas no válido.',
      customFromInput,
      customToInput,
    }
  }

  return {
    period: 'CUSTOM',
    requested: 'CUSTOM',
    from: range.from,
    to: range.to,
    description: customRangeDescription(range),
    customError: null,
    customFromInput,
    customToInput,
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
  custom?: { from?: string; to?: string },
): string {
  const params = new URLSearchParams()

  const entries: [string, string | undefined][] =
    current instanceof URLSearchParams
      ? Array.from(current.entries())
      : Object.entries(current)

  for (const [key, value] of entries) {
    // `from`/`to` se descartan SIEMPRE y se vuelven a poner abajo solo si el
    // destino es `CUSTOM`. Arrastrarlos a un atajo dejaría en la URL un rango
    // que ya no se está aplicando, y bastaría volver a pulsar «Personalizado»
    // para que reapareciera un filtro que la persona creía haber quitado.
    if (
      (MARKET_PERIOD_QUERY_KEYS as readonly string[]).includes(key) ||
      key === 'page' ||
      typeof value !== 'string' ||
      !value
    ) {
      continue
    }
    params.set(key, value)
  }

  params.set(MARKET_PERIOD_PARAM, period)

  if (period === 'CUSTOM') {
    if (custom?.from) params.set(MARKET_FROM_PARAM, custom.from)
    if (custom?.to) params.set(MARKET_TO_PARAM, custom.to)
  }

  const qs = params.toString()
  return qs ? `${basePath}?${qs}` : basePath
}

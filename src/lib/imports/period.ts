// Periodo de una importación masiva (Fase 2.5, MVP).
//
// Módulo puro.
//
// ── Qué hace y qué NO hace el periodo ───────────────────────────────────────
//
// El periodo declara qué se está subiendo: la semana 31 de 2026, julio de 2026
// o el año 2025. Sirve para UNA cosa: comprobar que todas las fechas del
// fichero caen dentro de ese rango, y evitar así el error más caro y silencioso
// de todos — subir el fichero de la semana pasada creyendo que es el de esta.
//
// NO altera `recorded_at`. Ni una fecha se corrige, se redondea ni se desplaza:
// si una fila cae fuera del rango, es un ERROR de esa fila y se rechaza. Ajustar
// la fecha «para que encaje» inventaría un dato de mercado que nadie publicó.
//
// La granularidad tampoco se guarda en `product_price_records`. El documento de
// diseño la dejó como decisión pendiente del cliente; hasta que se resuelva, un
// precio es un precio con su fecha, y el periodo vive en el batch, que es donde
// describe la operación de carga sin contaminar el dato.

export const IMPORT_PERIOD_TYPES = ['week', 'month', 'year'] as const

export type ImportPeriodType = (typeof IMPORT_PERIOD_TYPES)[number]

export const IMPORT_PERIOD_LABELS: Record<ImportPeriodType, string> = {
  week: 'Semana',
  month: 'Mes',
  year: 'Año',
}

export function isImportPeriodType(value: unknown): value is ImportPeriodType {
  return IMPORT_PERIOD_TYPES.some((t) => t === value)
}

/** Rango cerrado por ambos extremos, en fechas civiles `YYYY-MM-DD`. */
export interface ImportPeriodRange {
  type: ImportPeriodType
  /** Primer día incluido. */
  from: string
  /** Último día incluido. */
  to: string
  /** Texto para la interfaz: «Semana 31 de 2026 (27 jul – 2 ago)». */
  label: string
}

// ── Fechas civiles, sin zonas horarias ──────────────────────────────────────
//
// `recorded_at` es `date`. Todo el cálculo se hace con fechas locales y se
// formatea a mano: `toISOString()` convierte a UTC y en España desplaza el día
// de madrugada, que sobre un rango de semana significa incluir o excluir un día
// entero equivocado.

export function toDateOnly(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Valida y convierte `YYYY-MM-DD` en `Date` local. `null` si no es válida. */
export function parseDateOnly(raw: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw.trim())
  if (!m) return null

  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null

  const fecha = new Date(y, mo - 1, d)
  // Rechaza fechas que no existen: `2026-02-30` se desbordaría a marzo.
  if (fecha.getFullYear() !== y || fecha.getMonth() !== mo - 1 || fecha.getDate() !== d) {
    return null
  }
  return fecha
}

// ── Semana ISO 8601 ─────────────────────────────────────────────────────────
//
// La semana ISO empieza en LUNES y la semana 1 de un año es la que contiene su
// primer jueves. De ahí salen los casos raros que hay que acertar: el 1 de enero
// de 2027 es viernes y pertenece a la semana 53 de 2026, y el 29 de diciembre de
// 2025 es lunes y pertenece a la semana 1 de 2026.
//
// Se implementa a mano en lugar de aproximarlo con «el 1 de enero más N×7»,
// que falla exactamente en esos bordes.

/**
 * Diferencia en días CIVILES entre dos fechas.
 *
 * Se normaliza a UTC antes de restar. Restando `getTime()` de fechas locales, el
 * cambio de horario de verano mete una hora de diferencia —del 1 de enero
 * (UTC+1) al 30 de julio (UTC+2) hay 209,96 días, no 210—, y esa hora basta
 * para que un `Math.floor` sobre semanas caiga una semana atrás. Se detectó
 * porque el 27 de julio de 2026 salía en la semana 30 en vez de la 31.
 */
function diasEntre(desde: Date, hasta: Date): number {
  const a = Date.UTC(desde.getFullYear(), desde.getMonth(), desde.getDate())
  const b = Date.UTC(hasta.getFullYear(), hasta.getMonth(), hasta.getDate())
  return Math.round((b - a) / 86_400_000)
}

/** Cuántas semanas ISO tiene un año: 52, o 53 en los años largos. */
export function isoWeeksInYear(year: number): number {
  return diasEntre(isoWeekStart(year, 1), isoWeekStart(year + 1, 1)) / 7
}

/** Lunes de la semana ISO indicada. */
export function isoWeekStart(year: number, week: number): Date {
  // 4 de enero siempre cae en la semana 1 (por la regla del primer jueves).
  const cuatroEnero = new Date(year, 0, 4)
  // getDay(): 0 = domingo. En ISO el lunes es 1 y el domingo 7.
  const diaIso = cuatroEnero.getDay() === 0 ? 7 : cuatroEnero.getDay()
  const lunesSemana1 = new Date(year, 0, 4 - (diaIso - 1))
  const resultado = new Date(lunesSemana1)
  resultado.setDate(lunesSemana1.getDate() + (week - 1) * 7)
  return resultado
}

/** Año y semana ISO a los que pertenece una fecha. */
export function isoWeekOf(date: Date): { year: number; week: number } {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const diaIso = d.getDay() === 0 ? 7 : d.getDay()
  // Al jueves de esa semana: su año natural ES el año ISO de la semana.
  d.setDate(d.getDate() + (4 - diaIso))
  const anioIso = d.getFullYear()

  // `diasEntre` normaliza a UTC: restar milisegundos de fechas locales falla al
  // cruzar el cambio de horario de verano (ver el comentario de esa función).
  const semana = Math.floor(diasEntre(new Date(anioIso, 0, 1), d) / 7) + 1
  return { year: anioIso, week: semana }
}

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

function diaCorto(date: Date): string {
  return `${date.getDate()} ${MESES[date.getMonth()].slice(0, 3)}`
}

export interface ResolvePeriodInput {
  type: ImportPeriodType
  year: number
  /** Semana ISO 1–53. Solo para `week`. */
  week?: number
  /** Mes 1–12. Solo para `month`. */
  month?: number
}

export interface PeriodResolution {
  range?: ImportPeriodRange
  error?: string
}

/** Años admitidos. Cota defensiva contra un `year` absurdo en el formulario. */
export const MIN_IMPORT_YEAR = 2000
export const MAX_IMPORT_YEAR = 2100

/**
 * Convierte la selección del formulario en un rango de fechas concreto.
 *
 * Devuelve `{ error }` en lugar de lanzar: la selección viene de un formulario
 * y un error de rango es un mensaje que enseñar, no una excepción.
 */
export function resolveImportPeriod(input: ResolvePeriodInput): PeriodResolution {
  const { type, year } = input

  if (!isImportPeriodType(type)) return { error: 'Tipo de periodo no válido.' }
  if (!Number.isInteger(year) || year < MIN_IMPORT_YEAR || year > MAX_IMPORT_YEAR) {
    return { error: `El año debe estar entre ${MIN_IMPORT_YEAR} y ${MAX_IMPORT_YEAR}.` }
  }

  if (type === 'year') {
    return {
      range: {
        type,
        from: `${year}-01-01`,
        to: `${year}-12-31`,
        label: `Año ${year}`,
      },
    }
  }

  if (type === 'month') {
    const month = input.month
    if (!Number.isInteger(month) || month === undefined || month < 1 || month > 12) {
      return { error: 'El mes debe estar entre 1 y 12.' }
    }
    const primero = new Date(year, month - 1, 1)
    // Día 0 del mes siguiente = último día de este mes. Resuelve febrero y los
    // bisiestos sin ninguna tabla.
    const ultimo = new Date(year, month, 0)
    return {
      range: {
        type,
        from: toDateOnly(primero),
        to: toDateOnly(ultimo),
        label: `${MESES[month - 1]} de ${year}`,
      },
    }
  }

  const week = input.week
  const semanasDelAnio = isoWeeksInYear(year)
  if (!Number.isInteger(week) || week === undefined || week < 1 || week > semanasDelAnio) {
    return { error: `La semana debe estar entre 1 y ${semanasDelAnio} para el año ${year}.` }
  }

  const lunes = isoWeekStart(year, week)
  const domingo = new Date(lunes)
  domingo.setDate(lunes.getDate() + 6)

  return {
    range: {
      type,
      from: toDateOnly(lunes),
      to: toDateOnly(domingo),
      label: `Semana ${week} de ${year} (${diaCorto(lunes)} – ${diaCorto(domingo)})`,
    },
  }
}

/**
 * ¿Cae esta fecha dentro del periodo?
 *
 * Comparación de cadenas `YYYY-MM-DD`, que en ese formato coincide con el orden
 * cronológico. Ambos extremos INCLUIDOS.
 */
export function isDateInPeriod(dateOnly: string, range: ImportPeriodRange): boolean {
  return dateOnly >= range.from && dateOnly <= range.to
}

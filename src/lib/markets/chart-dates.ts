// Fechas de los gráficos de Market Intelligence.
//
// Módulo PURO. Sin Next, sin Recharts, sin `Intl`.
//
// ── El fallo que se corrige ─────────────────────────────────────────────────
//
// Los gráficos escribían `15 may.` en el eje y en el tooltip. Con un histórico
// de un solo año eso basta; con `3Y` o `ALL` no: el 15 de mayo de 2024, el de
// 2025 y el de 2026 se leen exactamente igual, así que la serie parece repetir
// fechas y no hay forma de saber qué punto se está mirando.
//
// ── Por qué NO se usa `toLocaleDateString('es-ES', …)` ─────────────────────
//
// Dos motivos, y los dos han mordido ya en este repositorio:
//
//   1. ZONA HORARIA. `new Date('2024-05-15')` interpreta la cadena como
//      medianoche UTC. Al formatearla en una zona con desfase NEGATIVO sale el
//      día 14. `recorded_at` es `date` —una fecha civil, no un instante—, así
//      que se parte a mano en año, mes y día y se construye un `Date` LOCAL.
//
//   2. ICU. El nombre corto del mes cambia entre versiones de Node y entre
//      navegadores: `may` en unas, `may.` en otras. Un test sobre el texto
//      visible sería verde en local y rojo en el servidor. La tabla de meses
//      está escrita aquí, así que el resultado es el mismo en todas partes.

/** Meses abreviados en español. Sin punto: lo añade el formateador. */
const MESES_CORTOS = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun',
  'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
] as const

/** `YYYY-MM-DD` estricto. Nada de fechas «casi» válidas. */
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

export interface CivilDate {
  year: number
  /** 1–12. */
  month: number
  /** 1–31. */
  day: number
}

/**
 * Parte `YYYY-MM-DD` en sus tres números, comprobando que la fecha EXISTE.
 *
 * `2026-02-31` se rechaza: es sintácticamente correcta y no existe. Devolver
 * `null` en lugar de desplazarla al 3 de marzo —que es lo que haría `Date`— es
 * lo único aceptable cuando lo que está en juego es la fecha de un precio.
 */
export function parseCivilDate(raw: string | null | undefined): CivilDate | null {
  const m = ISO_DATE.exec((raw ?? '').trim())
  if (!m) return null

  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])

  if (month < 1 || month > 12 || day < 1 || day > 31) return null

  // Comprobación de existencia real: se construye la fecha LOCAL y se verifica
  // que no ha rodado a otro mes (30 de febrero → 2 de marzo).
  const d = new Date(year, month - 1, day)
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) {
    return null
  }

  return { year, month, day }
}

/** `YYYY-MM-DD` → `Date` en horario LOCAL, a las 00:00. `null` si no es válida. */
export function toLocalDate(raw: string | null | undefined): Date | null {
  const civil = parseCivilDate(raw)
  return civil ? new Date(civil.year, civil.month - 1, civil.day) : null
}

/**
 * Formato compacto: `15 may.`
 *
 * Es el que se usa en el eje X cuando toda la serie cae dentro del mismo año y
 * el año, por tanto, no aporta nada.
 */
export function formatChartDateShort(raw: string | null | undefined): string {
  const civil = parseCivilDate(raw)
  if (!civil) return (raw ?? '').trim()
  return `${civil.day} ${MESES_CORTOS[civil.month - 1]}.`
}

/**
 * Formato completo: `15 may. 2024`
 *
 * Es el del tooltip SIEMPRE, y el del eje X en cuanto la serie cruza un año.
 */
export function formatChartDateLong(raw: string | null | undefined): string {
  const civil = parseCivilDate(raw)
  if (!civil) return (raw ?? '').trim()
  return `${civil.day} ${MESES_CORTOS[civil.month - 1]}. ${civil.year}`
}

/** Elige uno de los dos formatos. Azúcar para los `tickFormatter` de Recharts. */
export function formatChartDate(raw: string | null | undefined, withYear: boolean): string {
  return withYear ? formatChartDateLong(raw) : formatChartDateShort(raw)
}

/**
 * ¿La serie cruza más de un año natural?
 *
 * Se mira el AÑO de cada fecha, no la distancia entre la primera y la última:
 * del 20 de diciembre al 10 de enero hay tres semanas y son dos años, y ahí el
 * año es justamente lo que distingue los puntos.
 *
 * Sirve tanto para una lista de fechas sueltas como para los puntos de un
 * gráfico, de ahí que acepte `null`/`undefined` sin quejarse: una fecha
 * ilegible no debería decidir el formato de todo el eje.
 */
export function spansMultipleYears(dates: readonly (string | null | undefined)[]): boolean {
  let primero: number | null = null
  for (const raw of dates) {
    const civil = parseCivilDate(raw)
    if (!civil) continue
    if (primero === null) primero = civil.year
    else if (civil.year !== primero) return true
  }
  return false
}

/** Fecha larga y legible para textos: `15 de mayo de 2024`. */
const MESES_LARGOS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
] as const

export function formatCivilDateLong(raw: string | null | undefined): string {
  const civil = parseCivilDate(raw)
  if (!civil) return (raw ?? '').trim()
  return `${civil.day} de ${MESES_LARGOS[civil.month - 1]} de ${civil.year}`
}

/** `DD/MM/AAAA`. Para tablas, donde la columna tiene que ser estrecha. */
export function formatCivilDateNumeric(raw: string | null | undefined): string {
  const civil = parseCivilDate(raw)
  if (!civil) return (raw ?? '').trim()
  const dd = String(civil.day).padStart(2, '0')
  const mm = String(civil.month).padStart(2, '0')
  return `${dd}/${mm}/${civil.year}`
}

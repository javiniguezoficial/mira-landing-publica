// Fechas de entrada de la importación de precios (034).
//
// Módulo PURO y CENTRAL.
//
// El formato OFICIAL de la plantilla sigue siendo `AAAA-MM-DD`. Lo que cambia es
// que ya no es el único que se acepta: los boletines reales llegan con
// `01/01/2024`, y rechazarlos obligaba a reformatear a mano miles de celdas.
//
// ── Lo que NO se acepta, y por qué ─────────────────────────────────────────
//
// `MM/DD/AAAA`. Con `01/02/2024` delante no hay forma de saber si es el 1 de
// febrero o el 2 de enero, y el importador tiene que elegir UNA lectura y
// mantenerla. Elige la europea —día primero—, que es la de los boletines con los
// que trabaja la plataforma, y lo dice en el mensaje de error.
//
// La consecuencia es deliberada: un fichero estadounidense con `01/13/2024`
// falla con «mes 13 no existe» en lugar de guardarse como 1 de enero. Falla
// ruidosamente, que es lo correcto.

import { MAX_IMPORT_YEAR, MIN_IMPORT_YEAR } from './period'

export interface ParsedImportDate {
  /** Fecha civil `YYYY-MM-DD`. */
  iso: string | null
  error?: string
}

/** Los formatos que se admiten, para los mensajes de error. */
export const ACCEPTED_DATE_FORMATS = 'AAAA-MM-DD, DD/MM/AAAA o D/M/AAAA'

function esFechaReal(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31) return false
  // Se construye en UTC para que el resultado no dependa de la zona horaria del
  // servidor. Con fechas locales, un contenedor en UTC+2 y otro en UTC-5 podrían
  // discrepar en el día para el mismo texto.
  const fecha = new Date(Date.UTC(y, m - 1, d))
  return (
    fecha.getUTCFullYear() === y &&
    fecha.getUTCMonth() === m - 1 &&
    fecha.getUTCDate() === d
  )
}

function formatoIso(y: number, m: number, d: number): string {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

// ── Fecha serial de Excel ───────────────────────────────────────────────────
//
// Excel cuenta días desde el 1 de enero de 1900 y arrastra un error histórico:
// cree que 1900 fue bisiesto, así que existe un 29 de febrero de 1900 que nunca
// ocurrió. Por eso la base real para cualquier fecha posterior al 1 de marzo de
// 1900 es el 30 de diciembre de 1899, y ese es el único caso que importa aquí:
// la plataforma solo admite años a partir de 2000.
//
// El cálculo va entero en UTC. Sumar días a una fecha local se rompe en los dos
// cambios de horario del año y desplaza el resultado un día.

const EPOCA_EXCEL_UTC = Date.UTC(1899, 11, 30)
const MS_POR_DIA = 86_400_000

export function excelSerialToIso(serial: number): string | null {
  if (!Number.isFinite(serial)) return null
  // Solo la parte entera: una celda de fecha-hora trae decimales con la hora, y
  // `recorded_at` es una fecha civil sin hora.
  const dias = Math.floor(serial)
  const fecha = new Date(EPOCA_EXCEL_UTC + dias * MS_POR_DIA)
  const y = fecha.getUTCFullYear()
  if (y < MIN_IMPORT_YEAR || y > MAX_IMPORT_YEAR) return null
  return formatoIso(y, fecha.getUTCMonth() + 1, fecha.getUTCDate())
}

// ── Entrada ─────────────────────────────────────────────────────────────────

const ISO_RE = /^(\d{4})-(\d{1,2})-(\d{1,2})$/
const EUROPEA_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/
const SERIAL_RE = /^\d{4,6}$/

/**
 * Convierte lo que venga en la columna `recorded_at` a `YYYY-MM-DD`.
 *
 * El orden de intentos importa: primero ISO, luego europea, y solo si el texto
 * es únicamente dígitos se prueba como serial de Excel. Un `20240101` sin
 * separadores NO se acepta: se parecería demasiado a un serial y las dos
 * lecturas darían fechas distintas.
 */
export function parseImportDate(raw: string | undefined | null): ParsedImportDate {
  const texto = (raw ?? '').normalize('NFKC').trim()
  if (texto === '') return { iso: null }

  const iso = ISO_RE.exec(texto)
  if (iso) {
    const [, ys, ms, ds] = iso
    const y = Number(ys), m = Number(ms), d = Number(ds)
    if (!esFechaReal(y, m, d)) {
      return { iso: null, error: `«${texto}» no es una fecha real` }
    }
    return { iso: formatoIso(y, m, d) }
  }

  const eur = EUROPEA_RE.exec(texto)
  if (eur) {
    const [, ds, ms, ys] = eur
    const d = Number(ds), m = Number(ms), y = Number(ys)
    if (m > 12 && d <= 12) {
      // Casi seguro un `MM/DD/AAAA`. Se dice explícitamente en vez de un genérico
      // «fecha no válida», que dejaría a quien lo lee sin saber qué corregir.
      return {
        iso: null,
        error: `«${texto}» parece estar en formato mes/día/año. Aquí el primer número es el DÍA`,
      }
    }
    if (!esFechaReal(y, m, d)) {
      return { iso: null, error: `«${texto}» no es una fecha real` }
    }
    return { iso: formatoIso(y, m, d) }
  }

  if (SERIAL_RE.test(texto)) {
    const convertida = excelSerialToIso(Number(texto))
    if (!convertida) {
      return {
        iso: null,
        error: `«${texto}» no corresponde a ninguna fecha entre ${MIN_IMPORT_YEAR} y ${MAX_IMPORT_YEAR}`,
      }
    }
    return { iso: convertida }
  }

  return { iso: null, error: `«${texto}» no es una fecha válida. Formatos admitidos: ${ACCEPTED_DATE_FORMATS}` }
}

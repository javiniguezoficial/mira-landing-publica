// Lectura de importes de la importación de precios (034).
//
// Módulo PURO y CENTRAL.
//
// ── Por qué no vale un `replace(',', '.')` ─────────────────────────────────
//
// Porque `1.285,50` son mil doscientos ochenta y cinco con cincuenta en España
// y `1,285.50` es lo mismo escrito en inglés. Un reemplazo ciego convierte el
// primero en `1.28550` y el segundo en `1.285.50`. El error no salta: se guarda
// un precio mil veces más pequeño y aparece como una caída del 99,9 % en el
// gráfico de alguien.
//
// La regla es determinista y se apoya en una sola idea: **cuando hay dos
// separadores distintos, el ÚLTIMO es el decimal**. Eso resuelve sin ambigüedad
// los dos formatos reales. Lo que queda genuinamente indecidible —un único
// separador seguido de exactamente tres cifras, como `1.285`— se RECHAZA con un
// mensaje que explica cómo escribirlo. Nunca se elige a cara o cruz.

import { extractCurrency, type ImportCurrency } from './currency'

export interface ParsedMoney {
  /** El número, ya sin símbolo ni separadores de miles. */
  value: number | null
  /** Moneda que venía escrita DENTRO del importe, si la había. */
  currency: ImportCurrency | null
  error?: string
}

const VACIO: ParsedMoney = { value: null, currency: null }

/** Espacios de todo tipo, incluido el fino y el duro que mete Excel. */
const ESPACIOS = /[\s   ]/g

/**
 * Lee un importe escrito por una persona.
 *
 * Acepta: `285`, `285.00`, `285,00`, `285,00 €`, `€ 285,00`, `1.285,50 €`,
 * `1,285.50 USD`, `1.285.500` (miles repetidos, sin decimales).
 *
 * Devuelve también la moneda que viniera dentro del texto. Quién gana entre esa
 * y la columna `currency` lo decide el validador, que ve las dos: aquí solo se
 * informa de lo que había escrito.
 */
export function parseMoney(raw: string | undefined | null): ParsedMoney {
  const original = (raw ?? '').normalize('NFKC').trim()
  if (original === '') return VACIO

  const { currency, rest, ambiguous } = extractCurrency(original)
  if (ambiguous) {
    return { value: null, currency: null, error: `«${original}» menciona más de una moneda` }
  }

  const s = rest.replace(ESPACIOS, '')
  if (s === '') {
    return { value: null, currency, error: `«${original}» no contiene ningún número` }
  }
  if (!/^[+-]?[\d.,]+$/.test(s)) {
    return { value: null, currency, error: `«${original}» contiene caracteres que no son un número` }
  }

  const cuerpo = s.replace(/^[+-]/, '')
  const negativo = s.startsWith('-')

  const puntos = (cuerpo.match(/\./g) ?? []).length
  const comas = (cuerpo.match(/,/g) ?? []).length

  let decimal: '.' | ',' | null = null
  let miles: '.' | ',' | null = null

  if (puntos > 0 && comas > 0) {
    // Dos separadores distintos: el último es el decimal, el otro los miles.
    decimal = cuerpo.lastIndexOf('.') > cuerpo.lastIndexOf(',') ? '.' : ','
    miles = decimal === '.' ? ',' : '.'
    if ((decimal === '.' ? puntos : comas) !== 1) {
      return { value: null, currency, error: `«${original}» tiene el separador decimal repetido` }
    }
  } else if (puntos + comas > 0) {
    const sep = puntos > 0 ? '.' : ','
    const veces = puntos > 0 ? puntos : comas

    if (veces > 1) {
      // `1.285.500`: repetido, solo puede ser separador de miles.
      miles = sep
    } else {
      const decimales = cuerpo.length - cuerpo.lastIndexOf(sep) - 1
      if (decimales === 3) {
        // `1.285` es mil doscientos ochenta y cinco o uno coma dos ocho cinco.
        // No hay forma de saberlo, así que no se adivina.
        return {
          value: null,
          currency,
          error:
            `«${original}» es ambiguo: «${sep}» seguido de tres cifras puede ser decimal o ` +
            `separador de miles. Escríbelo sin separador de miles (1285.5) o con los dos (1${sep === '.' ? '.' : ','}285${sep === '.' ? ',' : '.'}50)`,
        }
      }
      decimal = sep
    }
  }

  // ── Agrupación de miles ───────────────────────────────────────────────────
  //
  // Si se ha decidido que hay separador de miles, tiene que agrupar de tres en
  // tres. `1.2385,50` no es un número mal escrito: es un número que no se sabe
  // leer, y aceptarlo daría 12.385 o 1,2385 según cómo se limpie.
  if (miles) {
    const parteEntera = decimal ? cuerpo.slice(0, cuerpo.lastIndexOf(decimal)) : cuerpo
    const grupos = parteEntera.split(miles)
    const bienAgrupado =
      grupos.length > 1 &&
      grupos[0].length >= 1 && grupos[0].length <= 3 &&
      grupos.slice(1).every((g) => g.length === 3)

    if (!bienAgrupado) {
      return {
        value: null,
        currency,
        error: `«${original}» no agrupa los miles de tres en tres`,
      }
    }
  }

  let normalizado = cuerpo
  if (miles) normalizado = normalizado.split(miles).join('')
  if (decimal === ',') normalizado = normalizado.replace(',', '.')

  if (!/^\d+(\.\d+)?$/.test(normalizado)) {
    return { value: null, currency, error: `«${original}» no es un número válido` }
  }

  const n = Number(normalizado)
  if (!Number.isFinite(n)) {
    return { value: null, currency, error: `«${original}» no es un número finito` }
  }

  return { value: negativo ? -n : n, currency }
}

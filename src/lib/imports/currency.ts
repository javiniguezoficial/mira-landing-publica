// Monedas de la importación de precios (034).
//
// Módulo PURO y CENTRAL. Antes la lista de monedas admitidas se derivaba de los
// valores que ya existían en `product_price_records`: como los 608 registros
// históricos son todos EUR, el importador rechazaba `USD` con «Moneda no
// reconocida: USD. Admitidas: EUR». Una allowlist que se calcula a partir de lo
// que ya hay no admite nada nuevo nunca — es un cerrojo, no una validación.
//
// Aquí la lista es EXPLÍCITA y vive en un solo sitio. Ampliarla es añadir un
// código a `IMPORT_CURRENCIES`, no tocar cinco `if` repartidos.
//
// ── Lo que este módulo NO hace ─────────────────────────────────────────────
//
// No convierte. No aplica tipos de cambio. No toca el valor numérico. Un precio
// en USD se guarda en USD y se enseña en USD. Convertir exigiría una fuente de
// cambios con fecha, y un histórico convertido con el cambio de hoy sería una
// serie inventada.

export const IMPORT_CURRENCIES = ['EUR', 'USD', 'GBP'] as const

export type ImportCurrency = (typeof IMPORT_CURRENCIES)[number]

export function isImportCurrency(value: unknown): value is ImportCurrency {
  return IMPORT_CURRENCIES.some((c) => c === value)
}

/** Código ISO → símbolo. El mismo mapa que usa `lib/utils.currencySymbol`. */
export const CURRENCY_SYMBOL: Record<ImportCurrency, string> = {
  EUR: '€',
  USD: '$',
  GBP: '£',
}

/**
 * Lo que se acepta ESCRITO en el fichero.
 *
 * ── Sobre el `$` ───────────────────────────────────────────────────────────
 *
 * `$` es ambiguo fuera de Estados Unidos: también es el peso, el dólar
 * canadiense y el australiano. Aquí se mapea a USD **de forma explícita y
 * documentada** porque es la única divisa con símbolo `$` que la plataforma
 * admite hoy, y porque el fichero real de referencia lo usa así.
 *
 * Si algún día entra CAD o AUD, este mapa deja de ser suficiente y `$` tendrá
 * que pasar a ser un error que obligue a escribir el código ISO. Por eso la
 * plantilla oficial pide SIEMPRE el código, no el símbolo.
 */
const ALIAS: ReadonlyMap<string, ImportCurrency> = new Map([
  ['eur', 'EUR'], ['€', 'EUR'], ['euro', 'EUR'], ['euros', 'EUR'],
  ['usd', 'USD'], ['$', 'USD'], ['us$', 'USD'], ['dolar', 'USD'], ['dólar', 'USD'],
  ['gbp', 'GBP'], ['£', 'GBP'], ['libra', 'GBP'], ['libras', 'GBP'],
])

/**
 * Convierte lo escrito en un código ISO. `null` si no se reconoce.
 *
 * Solo equivalencias EXACTAS de una tabla cerrada. Nada de «se parece a»: una
 * moneda mal adivinada no rompe nada visible, simplemente guarda una serie de
 * precios bajo la divisa equivocada y nadie lo nota hasta que alguien compara.
 */
export function parseCurrency(raw: string | undefined | null): ImportCurrency | null {
  const s = (raw ?? '').trim().toLowerCase()
  if (s === '') return null
  return ALIAS.get(s) ?? null
}

/** Todos los símbolos y códigos reconocibles, del más largo al más corto. */
const TOKENS: readonly string[] = [...ALIAS.keys()].sort((a, b) => b.length - a.length)

/**
 * Busca una moneda DENTRO de un texto con más cosas: «285,00 €», «USD 1.285,50».
 *
 * Devuelve la moneda y el texto ya sin ella, para que el parseo numérico reciba
 * solo dígitos y separadores.
 *
 * Si aparecen DOS monedas distintas —«285 € USD»— devuelve `ambiguous`: es un
 * dato contradictorio y elegir una de las dos en silencio es exactamente lo que
 * no se puede hacer.
 */
export interface CurrencyExtraction {
  currency: ImportCurrency | null
  rest: string
  ambiguous: boolean
}

export function extractCurrency(raw: string): CurrencyExtraction {
  let texto = raw.trim()
  const encontradas = new Set<ImportCurrency>()

  for (const token of TOKENS) {
    // Los códigos de tres letras se buscan como PALABRA para que «USDA» o una
    // referencia que contenga «eur» no se lean como moneda. Los símbolos no
    // llevan frontera de palabra porque `\b` no funciona junto a `€`, `$` o `£`.
    const esCodigo = /^[a-zá]+$/i.test(token) && token.length >= 3
    const patron = esCodigo
      ? new RegExp(`\\b${token}\\b`, 'gi')
      : new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')

    if (patron.test(texto)) {
      encontradas.add(ALIAS.get(token)!)
      texto = texto.replace(patron, ' ')
    }
  }

  return {
    currency: encontradas.size === 1 ? [...encontradas][0] : null,
    rest: texto.replace(/\s+/g, ' ').trim(),
    ambiguous: encontradas.size > 1,
  }
}

/** Lista legible para los mensajes de error: «EUR (€), USD ($), GBP (£)». */
export function currencyHelpText(): string {
  return IMPORT_CURRENCIES.map((c) => `${c} (${CURRENCY_SYMBOL[c]})`).join(', ')
}

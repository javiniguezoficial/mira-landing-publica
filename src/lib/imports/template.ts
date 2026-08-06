// Plantilla oficial de importación de precios (Fase 2.5).
//
// Módulo puro. Vive aquí, y no dentro de la Server Action, para que un test
// pueda comprobar que la plantilla que se descarga es EXACTAMENTE la que el
// parser y el validador aceptan.
//
// Esa comprobación no es teórica: la ruta anterior `price-template` servía una
// plantilla con `source_name` —columna que el validador nuevo no conoce— y sin
// `lonja`. Nadie se habría dado cuenta hasta que alguien rellenara la fuente y
// viera que no se guarda.

import { buildCsv, parseCsv } from './csv'
import { ALL_IMPORT_COLUMNS } from './types'

/**
 * Columnas de la plantilla, en el orden en que se descargan.
 *
 * Es literalmente `ALL_IMPORT_COLUMNS`: obligatorias primero, opcionales
 * después. Derivarla de la misma constante que valida el fichero es lo que
 * impide que las dos se separen.
 */
export const TEMPLATE_COLUMNS = [...ALL_IMPORT_COLUMNS]

/**
 * Fila de ejemplo.
 *
 * Datos INVENTADOS a propósito: `cereales-nacional` y `trigo-blando-panificable`
 * no existen en la plataforma. Una plantilla con identificadores reales invita a
 * importarla tal cual, y eso escribiría un precio falso sobre un producto real.
 * Al no existir, la fila de ejemplo se rechaza sola con un error claro si se
 * sube sin editar.
 */
export const TEMPLATE_EXAMPLE_ROW: Record<string, string> = {
  market_slug: 'cereales-nacional',
  product_slug: 'trigo-blando-panificable',
  recorded_at: '2026-07-27',
  price: '241.50',
  currency: 'EUR',
  unit: 'ton',
  lonja: 'Mercolleida',
  country: 'ES',
  region: 'Lleida',
  min_price: '238.00',
  max_price: '244.00',
  avg_price: '241.00',
  volume: '1200',
  source: 'Boletín semanal',
  notes: '',
}

/**
 * Segunda fila de ejemplo: un INDICADOR SIN MONEDA (037).
 *
 * Existe porque la columna `currency` vacía parece un olvido y no lo es. Con
 * `%` o `Unidades` —un IPC, un índice FAO— la moneda no se deja en blanco por
 * comodidad: es que no hay ninguna. Verlo escrito en la plantilla evita la
 * reacción natural de rellenar «EUR», que el validador rechaza.
 *
 * Los identificadores también son inventados, por la misma razón que la fila
 * anterior: una plantilla que se pueda subir tal cual escribiría datos falsos
 * sobre referencias reales.
 */
export const TEMPLATE_INDICATOR_ROW: Record<string, string> = {
  market_slug: 'indice-de-precios-ejemplo',
  product_slug: 'indice-general-ejemplo',
  recorded_at: '2026-07-27',
  price: '2,5',
  // Vacía A PROPÓSITO: un porcentaje no está en euros.
  currency: '',
  unit: '%',
  lonja: 'España',
  country: 'ES',
  region: '',
  min_price: '',
  max_price: '',
  avg_price: '',
  volume: '',
  source: 'INE',
  notes: 'Indicador sin moneda: deja «currency» vacía con unidad % o Unidades',
}

/** La plantilla oficial, lista para descargar. Lleva BOM: Excel lo necesita. */
export function buildImportTemplateCsv(): string {
  return buildCsv(TEMPLATE_COLUMNS, [
    TEMPLATE_COLUMNS.map((c) => TEMPLATE_EXAMPLE_ROW[c] ?? ''),
    TEMPLATE_COLUMNS.map((c) => TEMPLATE_INDICATOR_ROW[c] ?? ''),
  ])
}

/**
 * Lee la plantilla con el mismo parser que el importador.
 *
 * Existe para el test: comprobar que lo que se descarga se puede volver a subir.
 */
export function parseImportTemplateCsv() {
  return parseCsv(buildImportTemplateCsv())
}

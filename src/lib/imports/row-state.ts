// Estado mostrado de una fila de importación.
//
// ── El único sitio donde vive esta regla ────────────────────────────────────
//
// Desde la migración 049, `commit_market_import` ya no marca fila a fila con
// `status = 'imported'` e `imported_record_id`. Escribir eso costaba el 29 %
// de la confirmación —15.000 updates no-HOT sobre filas con dos jsonb dentro—
// para guardar por segunda vez un hecho que `product_price_records` ya tenía:
// cada precio importado apunta a su fila de origen por `import_row_id`.
//
// La regla de derivación es de una línea y por eso mismo es peligrosa:
// repetida en cinco componentes, cada uno acabaría con su propia variante. Se
// queda aquí, y quien la necesite la importa.
//
// ── Por qué `hay precio ⇒ importada` y no al revés ──────────────────────────
//
// Porque reproduce el comportamiento anterior EN LOS TRES CASOS que importan:
//
//   · fila válida que entró          → hay precio          → 'imported'
//   · fila válida que chocó con un
//     precio ya existente
//     (`on conflict do nothing`)     → no hay precio       → 'valid'
//   · fila inválida o duplicada      → no hay precio       → se respeta
//
// El segundo caso es el que había que decidir con cuidado, y la respuesta ya
// estaba en el código viejo: el INSERT no devolvía esa fila, el UPDATE no la
// tocaba y se quedaba en 'valid'. Aquí sale lo mismo.
//
// ── Y el histórico ──────────────────────────────────────────────────────────
//
// Las filas anteriores a la 049 llevan `status = 'imported'` guardado. Al
// devolver el valor almacenado cuando no hay precio, esas filas se siguen
// viendo exactamente igual que antes. Incluidas las 75.002 que en producción
// dicen 'imported' sin tener ya ningún precio detrás —la FK
// `on delete set null` limpió `imported_record_id` cuando se borraron esos
// precios, pero nadie tocó `status`—. No se corrige aquí: cambiar lo que ve el
// usuario sobre lotes cerrados hace meses no es asunto de esta migración.

import type { ImportRowStatus } from './types'

/**
 * Estado que se muestra de una fila.
 *
 * @param stored   `status` tal y como está en `market_import_rows`.
 * @param hasPrice si existe algún `product_price_records.import_row_id` que
 *                 apunte a esta fila.
 */
export function deriveImportRowStatus(
  stored: ImportRowStatus,
  hasPrice: boolean,
): ImportRowStatus {
  // Una fila inválida o duplicada no puede haber generado un precio: si lo
  // tiene, el dato almacenado manda, porque el problema entonces está en la
  // validación y no en la derivación.
  if (stored === 'invalid' || stored === 'duplicate') return stored
  return hasPrice ? 'imported' : stored
}

/**
 * Traduce el embed de PostgREST a un booleano.
 *
 * El embed inverso devuelve un array —`product_price_records` es hija de
 * `market_import_rows` por `import_row_id`—, aunque la relación sea 1:1 en la
 * práctica: 78.274 precios con lineage sobre 78.274 filas distintas, ninguna
 * con dos precios. Se acepta cualquiera de las dos formas que el cliente puede
 * entregar, objeto o array, para no depender de cómo colapse el SDK.
 */
export function hasImportedPrice(embed: unknown): boolean {
  if (Array.isArray(embed)) return embed.length > 0
  return embed != null
}

// Lectura completa de una tabla, por páginas (037).
//
// ── El techo invisible ─────────────────────────────────────────────────────
//
// PostgREST recorta TODA respuesta en `db-max-rows` —1.000 filas en este
// proyecto— y no avisa: no hay error, no hay cabecera que mire nadie, solo
// llegan menos filas de las que hay. Un `.limit(50000)` en el cliente no lo
// levanta; como mucho lo baja.
//
// Eso convirtió varias consultas de catálogo en bombas de relojería silenciosas:
//
//   · el mapa de lonjas por producto → solo veía las 8 primeras plazas
//     (resuelto con agregados en SQL, ver `queries/lonjas.ts`);
//   · el catálogo de productos del importador → 973 activos de un techo de
//     1.000. Al llegar a 1.001, el producto 1.001 empezaría a rechazarse con
//     «el producto no existe o no está activo» sin que nada apunte a la causa.
//
// ── Cuándo usar esto y cuándo no ───────────────────────────────────────────
//
// Esto es para CATÁLOGOS: conjuntos de unos pocos miles de filas que hay que
// tener enteros para resolver nombres. Para tablas de hechos —precios,
// proveedores— la respuesta correcta no es paginar hasta el final sino agregar
// en SQL o paginar de cara al usuario. Un `fetchAllRows` sobre 73.000 precios
// sería el mismo error con más viajes de red.
//
// Por eso hay un tope explícito: si se alcanza, algo se está usando mal.

/** Filas por viaje. Por debajo del techo de PostgREST, con margen. */
export const FETCH_ALL_PAGE_SIZE = 1_000

/**
 * Tope de seguridad. Un catálogo que lo supere ya no es un catálogo.
 *
 * Se avisa por consola y se devuelve lo leído: es preferible una pantalla
 * incompleta con un aviso en los registros a un proceso que se queda dando
 * vueltas contra una tabla que crece.
 */
export const FETCH_ALL_MAX_ROWS = 50_000

/**
 * Lo mínimo que se necesita de un query builder de Supabase para paginarlo.
 *
 * No se tipa contra `PostgrestFilterBuilder` a propósito: esa clase es genérica
 * en cinco parámetros que cambian entre versiones del SDK, y atarse a ella
 * obligaría a tocar este archivo en cada actualización.
 */
export interface RangeableQuery<T> {
  range(from: number, to: number): PromiseLike<{ data: T[] | null; error: { message: string; code?: string } | null }>
}

/**
 * Lee todas las filas de una consulta, en páginas.
 *
 * `build` se llama UNA VEZ POR PÁGINA porque un query builder de Supabase no se
 * puede reutilizar: en cuanto se le hace `await` queda consumido, y volver a
 * pedirle un `range` sobre el mismo objeto devuelve la primera página otra vez.
 *
 * Devuelve `{ rows, complete }`. `complete: false` significa que se ha topado
 * con el tope o con un error, y quien llama decide si eso es aceptable.
 */
export async function fetchAllRows<T>(
  build: () => RangeableQuery<T>,
  opts: { pageSize?: number; maxRows?: number; label?: string } = {},
): Promise<{ rows: T[]; complete: boolean }> {
  const pageSize = opts.pageSize ?? FETCH_ALL_PAGE_SIZE
  const maxRows = opts.maxRows ?? FETCH_ALL_MAX_ROWS
  const label = opts.label ?? 'fetchAllRows'

  const rows: T[] = []
  let desde = 0

  for (;;) {
    const { data, error } = await build().range(desde, desde + pageSize - 1)

    if (error) {
      console.error(`[${label}] lectura paginada falló: ${error.code ?? '?'} ${error.message}`)
      return { rows, complete: false }
    }
    if (!data || data.length === 0) return { rows, complete: true }

    rows.push(...data)

    // Página incompleta = última página. Es la única señal fiable: `count`
    // exacto costaría un segundo escaneo en cada viaje.
    if (data.length < pageSize) return { rows, complete: true }

    if (rows.length >= maxRows) {
      console.warn(
        `[${label}] se ha alcanzado el tope de ${maxRows} filas: el resultado está incompleto.`,
      )
      return { rows, complete: false }
    }

    desde += pageSize
  }
}

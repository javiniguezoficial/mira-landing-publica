-- 044 — Índices de las FK que hacían inviable el borrado de precios
--
-- ═════════════════════════════════════════════════════════════════════════════
-- EL FALLO
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Borrar más de ~40 precios terminaba en
-- «canceling statement due to statement timeout», tanto por selección como en
-- borrado masivo. No era la copia de seguridad ni el volumen de datos: era una
-- clave foránea SIN ÍNDICE.
--
--   market_import_rows.imported_record_id  →  product_price_records(id)
--   ON DELETE SET NULL
--
-- PostgreSQL, para cada precio borrado, tiene que localizar las filas de
-- importación que lo referencian y ponerles la columna a NULL. Sin índice sobre
-- `imported_record_id`, esa búsqueda es un Seq Scan COMPLETO de
-- `market_import_rows` — 127.605 filas, 73 MB — POR CADA PRECIO.
--
-- Medido en la base real con EXPLAIN ANALYZE antes de esta migración:
--
--   Seq Scan on market_import_rows  (actual time=2225.222..2225.222 rows=0)
--     Rows Removed by Filter: 127605
--     Buffers: shared hit=4781 read=4525
--
-- Y con DELETE reales dentro de una transacción revertida:
--
--   n=1   → 220 ms      n=10  → 2.068 ms      n=40  → 3.453 ms
--
-- El rol `authenticated`, que es con el que entra la RPC por PostgREST, tiene
-- `statement_timeout = 8s`. A ~200 ms por fila el techo está en unas 40 filas:
-- exactamente el umbral que reportó el cliente. Con 682 precios no había forma
-- de terminar.
--
-- ═════════════════════════════════════════════════════════════════════════════
-- POR QUÉ ESTO Y NO SUBIR EL TIMEOUT
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Porque el coste es O(precios_borrados × filas_de_importación) y las dos
-- magnitudes crecen. Subir el límite solo mueve el punto de ruptura: hoy son
-- 682 precios, con el doble de importaciones serían 340. Con índice, la
-- búsqueda pasa de recorrer la tabla entera a un acceso directo.
--
-- ═════════════════════════════════════════════════════════════════════════════
-- LA SEGUNDA, QUE NO HABÍA SALTADO TODAVÍA
-- ═════════════════════════════════════════════════════════════════════════════
--
--   product_price_records.import_row_id  →  market_import_rows(id)
--   ON DELETE SET NULL
--
-- Es la misma patología en sentido contrario, y se dispara en el modo `import`
-- del borrado, donde `apply_price_deletion` borra las filas técnicas del lote:
-- cada fila de importación borrada recorre las 74.478 filas de precios. No se
-- había manifestado porque las importaciones que se han borrado hasta ahora
-- eran pequeñas. Se corrige aquí porque es el MISMO flujo.
--
-- ═════════════════════════════════════════════════════════════════════════════
-- QUÉ NO HACE ESTA MIGRACIÓN
-- ═════════════════════════════════════════════════════════════════════════════
--
-- No toca ni un dato. No borra precios, no cambia claves naturales, no altera
-- referencias ni mercados, no modifica ninguna definición de tabla ni de FK y
-- no cambia la auditoría, que sigue guardando la copia íntegra de cada precio
-- en `market_price_deletion_rows.original_data`.
--
-- Son dos índices. El mecanismo cambia; los datos no.
--
-- `create index` sin `concurrently` a propósito: `concurrently` no puede vivir
-- dentro de una transacción, y el procedimiento de despliegue de este proyecto
-- aplica cada migración en una. Sobre 127.605 filas la construcción tarda ~1 s,
-- durante el cual se bloquean las ESCRITURAS de esa tabla —no las lecturas—. Es
-- un coste asumible y acotado frente a dejar el borrado inutilizable.

create index if not exists idx_mir_imported_record
  on public.market_import_rows (imported_record_id)
  where imported_record_id is not null;

comment on index public.idx_mir_imported_record is
  '044 — Sostiene el ON DELETE SET NULL de la FK hacia product_price_records. '
  'Sin él, borrar un precio recorre la tabla entera de filas de importación. '
  'Parcial: las filas sin precio asociado no participan en esa comprobación.';

create index if not exists idx_ppr_import_row
  on public.product_price_records (import_row_id)
  where import_row_id is not null;

comment on index public.idx_ppr_import_row is
  '044 — Sostiene el ON DELETE SET NULL de la FK hacia market_import_rows, que '
  'se dispara al borrar una importación entera (modo `import`).';

analyze public.market_import_rows;
analyze public.product_price_records;

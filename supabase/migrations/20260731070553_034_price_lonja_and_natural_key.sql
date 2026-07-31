-- 034 — La lonja pasa a ser del PRECIO, no del producto
--
-- ═════════════════════════════════════════════════════════════════════════════
-- EL FALLO QUE SE CORRIGE
-- ═════════════════════════════════════════════════════════════════════════════
--
-- El boletín real de un cliente publica, para UNA misma referencia, el mismo
-- día, en la misma moneda y en la misma unidad, el precio en España, Alemania,
-- Bélgica, Italia y Europa. El modelo de 2.5 no lo admitía por dos motivos
-- independientes, y los dos se arreglan aquí:
--
--   1. la lonja colgaba del PRODUCTO (`products.lonja`), así que el importador
--      rechazaba cualquier fila cuya lonja no fuera la del producto:
--      «La lonja no coincide: el producto es de España y el archivo dice Ebro»;
--
--   2. la clave natural era (product_id, recorded_at, currency, unit). Aunque se
--      hubiera saltado el punto 1, la segunda de las cinco filas habría entrado
--      como DUPLICADA y se habría descartado en silencio.
--
-- ── Cómo se ha estado esquivando hasta ahora ────────────────────────────────
--
-- Creando un producto por lonja: «Col Repollo La Coruña», «Col Repollo León»,
-- «Col Repollo Lugo»… 12 productos para una sola referencia dentro del mismo
-- mercado. Funciona, pero multiplica el catálogo y hace imposible comparar la
-- misma referencia entre plazas, que es justo para lo que sirve el módulo.
--
-- ═════════════════════════════════════════════════════════════════════════════
-- 1. La columna
-- ═════════════════════════════════════════════════════════════════════════════
--
-- ── Por qué nullable y no NOT NULL ──────────────────────────────────────────
--
-- El backfill cubre el 100 % de los 608 registros —los 7 productos con
-- histórico tienen los 7 su lonja informada—, así que NOT NULL sería posible
-- HOY. No se pone, por dos razones concretas:
--
--   · quedan 3 productos del catálogo (de 931) sin lonja configurada, y el alta
--     manual de un precio para uno de ellos dejaría de funcionar de golpe;
--   · una columna NOT NULL convierte cualquier ruta de inserción futura que se
--     olvide de la lonja en un error 500 en producción, en lugar de en una fila
--     que el filtro no muestra.
--
-- La garantía que de verdad hace falta —que no haya dos precios indistinguibles—
-- la da el índice único de abajo con `coalesce`, que trata NULL y cadena vacía
-- como el mismo valor. Y el importador EXIGE lonja: si no viene en el fichero ni
-- está en el producto, la fila se rechaza.

alter table public.product_price_records
  add column if not exists lonja text;

comment on column public.product_price_records.lonja is
  'Fase 2.5 (034) — plaza o mercado de referencia de ESTE precio. Prioridad: la '
  'del fichero importado; si no viene, la de products.lonja. Una misma '
  'referencia puede tener precios de varias lonjas el mismo día.';

-- ═════════════════════════════════════════════════════════════════════════════
-- 2. Backfill
-- ═════════════════════════════════════════════════════════════════════════════
--
-- MIGRACIÓN DE DATOS INTENCIONAL. Escribe en los 608 registros existentes.
--
-- ── Qué escribe exactamente ─────────────────────────────────────────────────
--
-- Copia `products.lonja` del producto de cada precio. Medido antes de aplicar:
--
--   Ebro              2 productos   180 precios
--   Europa            2 productos   180 precios
--   España            1 producto     90 precios
--   Valencia          1 producto     90 precios
--   Naciones Unidas   1 producto     68 precios
--                                   ───
--                                   608
--
-- Cobertura del 100 %: ningún precio se queda sin lonja.
--
-- ── Por qué es seguro ───────────────────────────────────────────────────────
--
-- Es la lonja que la aplicación YA les atribuía: el filtro de 2.4 agrupaba los
-- precios por `products.lonja` vía embed. El backfill no cambia cómo se ven,
-- solo deja de deducirlo en cada consulta.
--
-- `products.lonja` NO se toca. Ni se borra ni se reescribe.
--
-- El `where lonja is null` hace la sentencia repetible: aplicarla dos veces no
-- pisa nada.

update public.product_price_records r
   set lonja = nullif(btrim(p.lonja), '')
  from public.products p
 where p.id = r.product_id
   and r.lonja is null
   and nullif(btrim(p.lonja), '') is not null;

-- ═════════════════════════════════════════════════════════════════════════════
-- 3. La nueva clave natural
-- ═════════════════════════════════════════════════════════════════════════════
--
-- ── Comprobado ANTES de crear el índice ─────────────────────────────────────
--
--   608 filas → 608 claves distintas sobre
--               (product_id, recorded_at, currency, unit, lonja)
--   0 grupos duplicados. 0 filas sobrantes.
--
-- El índice se crea sin borrar, fusionar ni tocar un solo registro.
--
-- ── El `coalesce`, y por qué no basta con listar la columna ─────────────────
--
-- En un índice único de PostgreSQL, NULL nunca es igual a NULL. Una columna
-- `lonja` nullable a secas permitiría insertar infinitas filas del mismo
-- producto, día, moneda y unidad mientras la lonja fuera NULL — exactamente el
-- agujero que la clave natural existe para tapar.
--
-- `coalesce(btrim(lonja), '')` colapsa NULL y cadena vacía en el mismo valor, y
-- de paso evita que «España» y «España » cuenten como dos lonjas distintas.
--
-- ── El índice anterior se ELIMINA ───────────────────────────────────────────
--
-- No se deja «por si acaso»: sin lonja en la clave, seguiría rechazando como
-- duplicada la segunda plaza de cada referencia, que es el fallo que se está
-- corrigiendo. Los dos índices juntos no son compatibles.

drop index if exists public.product_price_records_natural_key;

create unique index if not exists product_price_records_natural_key
  on public.product_price_records (
    product_id, recorded_at, currency, unit, (coalesce(btrim(lonja), ''))
  );

comment on index public.product_price_records_natural_key is
  'Fase 2.5 (034) — clave natural de un precio, ahora con la lonja. Es lo que '
  'permite que la misma referencia cotice el mismo día en España, Alemania y '
  'Europa sin que dos de las tres se descarten como duplicadas.';

-- Filtrado por lonja en Market Intelligence: «los precios de esta plaza para
-- este producto, más recientes primero». Sin él, filtrar por lonja recorre toda
-- la tabla.
create index if not exists idx_ppr_product_lonja_recorded
  on public.product_price_records (product_id, lonja, recorded_at desc);

-- Y el selector de lonjas disponibles, que solo necesita los valores distintos.
create index if not exists idx_ppr_lonja
  on public.product_price_records (lonja)
  where lonja is not null;

-- ═════════════════════════════════════════════════════════════════════════════
-- 4. La lonja resuelta, en las filas del batch
-- ═════════════════════════════════════════════════════════════════════════════
--
-- El resto de columnas `resolved_*` ya guardan lo que el servidor decidió al
-- validar. La lonja tenía que ser una más: sin ella, la confirmación no sabría
-- qué plaza escribir y habría que volver a deducirla —o, peor, pedírsela al
-- navegador.

alter table public.market_import_rows
  add column if not exists resolved_lonja text;

comment on column public.market_import_rows.resolved_lonja is
  'Fase 2.5 (034) — lonja que el servidor resolvió al validar: la del fichero, '
  'o la del producto si el fichero no la traía.';

-- ═════════════════════════════════════════════════════════════════════════════
-- 5. `commit_market_import` escribe la lonja
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Cambia SOLO lo imprescindible respecto a la 030:
--
--   · el INSERT añade la columna `lonja`, tomada de `r.resolved_lonja`;
--   · el `on conflict` apunta a la nueva clave natural, con el mismo `coalesce`
--     que el índice — si no coincidiera exactamente, PostgreSQL no sabría a qué
--     índice se refiere y la función fallaría en tiempo de ejecución.
--
-- Todo lo demás es idéntico: misma comprobación de `platform_admin` en la
-- primera línea, mismo `for update` sobre el batch, mismo bloqueo de la segunda
-- confirmación, mismos estados y mismo resumen.

create or replace function public.commit_market_import(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch      public.market_import_batches%rowtype;
  v_insertadas integer := 0;
  v_estado     text;
begin
  -- 1. Autorización. Antes que nada y sin excepciones.
  if not public.is_platform_admin() then
    raise exception 'Solo un administrador de plataforma puede importar precios.'
      using errcode = '42501';
  end if;

  -- 2. Bloqueo del batch. Serializa las confirmaciones concurrentes.
  select * into v_batch
    from public.market_import_batches
   where id = p_batch_id
   for update;

  if not found then
    raise exception 'No se ha encontrado la importación indicada.' using errcode = 'P0002';
  end if;

  -- 3. Solo se importa desde `ready`. Un batch ya cerrado no se reabre.
  if v_batch.status <> 'ready' then
    raise exception 'Esta importación ya no se puede confirmar (estado actual: %).', v_batch.status
      using errcode = '22023';
  end if;

  -- 4. Insertar SOLO las filas válidas.
  with insertadas as (
    insert into public.product_price_records (
      product_id, price, unit, currency, country, region, recorded_at, lonja,
      min_price, max_price, avg_price, volume, metadata,
      import_batch_id, import_row_id
    )
    select r.resolved_product_id,
           r.resolved_price,
           r.resolved_unit,
           r.resolved_currency,
           coalesce(r.resolved_country, 'ES'),
           r.resolved_region,
           r.resolved_recorded_at,
           r.resolved_lonja,
           r.resolved_min_price,
           r.resolved_max_price,
           r.resolved_avg_price,
           r.resolved_volume,
           jsonb_strip_nulls(jsonb_build_object(
             'source', r.resolved_source,
             'notes',  r.resolved_notes,
             'import_batch_id', p_batch_id::text
           )),
           p_batch_id,
           r.id
      from public.market_import_rows r
     where r.batch_id = p_batch_id
       and r.status   = 'valid'
     order by r.row_number
    on conflict (product_id, recorded_at, currency, unit, (coalesce(btrim(lonja), '')))
      do nothing
    returning id, import_row_id
  )
  update public.market_import_rows r
     set status = 'imported',
         imported_record_id = i.id
    from insertadas i
   where r.id = i.import_row_id;

  get diagnostics v_insertadas = row_count;

  -- 5. Cerrar el batch.
  v_estado := case
    when v_batch.invalid_rows > 0 or v_batch.duplicate_rows > 0 or v_insertadas < v_batch.valid_rows
      then 'completed_with_errors'
    else 'completed'
  end;

  update public.market_import_batches
     set status        = v_estado,
         imported_rows = v_insertadas,
         imported_at   = now()
   where id = p_batch_id;

  return jsonb_build_object(
    'batch_id',       p_batch_id,
    'status',         v_estado,
    'imported_rows',  v_insertadas,
    'valid_rows',     v_batch.valid_rows,
    'invalid_rows',   v_batch.invalid_rows,
    'duplicate_rows', v_batch.duplicate_rows
  );
end;
$$;

comment on function public.commit_market_import(uuid) is
  'Fase 2.5 (034) — importa las filas válidas de un batch en una sola '
  'transacción, incluida la lonja de cada precio. Comprueba platform_admin '
  'internamente y bloquea el batch para que un doble clic no importe dos veces.';

-- ═════════════════════════════════════════════════════════════════════════════
-- 6. Grants
-- ═════════════════════════════════════════════════════════════════════════════
--
-- `create or replace function` CONSERVA los privilegios existentes, así que en
-- teoría no haría falta repetirlos. Se repiten igualmente: es barato, es
-- idempotente, y deja el estado deseado escrito en la migración en lugar de
-- depender de que nadie los haya tocado desde la 030.
--
-- El revoke de `anon` es EXPRESO, no solo de PUBLIC: el esquema tiene un
-- `alter default privileges … to anon`, y revocar de PUBLIC no lo alcanza (029).

revoke all on function public.commit_market_import(uuid) from public;
revoke all on function public.commit_market_import(uuid) from anon;
grant execute on function public.commit_market_import(uuid) to authenticated, service_role;

-- ═════════════════════════════════════════════════════════════════════════════
-- 7. Lo que esta migración NO hace
-- ═════════════════════════════════════════════════════════════════════════════
--
-- · No toca `products.lonja`. Sigue existiendo y pasa a ser el valor POR DEFECTO
--   de la lonja de un precio nuevo, no la autoridad de la serie histórica.
-- · No normaliza las unidades del histórico. `product_price_records.unit` tiene
--   «Unidades», «unidad» y «unidades» para el mismo producto desde antes de este
--   bloque; unificarlas es una decisión de negocio y se deja documentada. El
--   importador SÍ las trata como la misma unidad al detectar duplicados.
-- · No convierte precios entre monedas ni aplica tipos de cambio.
-- · No crea una tabla de lonjas. Sigue siendo texto libre: agrupar 102 grafías
--   distintas exige decidir cuáles son la misma plaza, y eso no lo puede decidir
--   una migración.
-- · No toca proveedores, ni la actualización masiva 3.2, ni las policies. El
--   recuento sigue siendo 62.

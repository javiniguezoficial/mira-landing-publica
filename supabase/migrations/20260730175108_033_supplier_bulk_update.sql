-- 033 — Actualización masiva de proveedores (Fase 3.2)
--
-- ═════════════════════════════════════════════════════════════════════════════
-- QUÉ RESUELVE Y QUÉ NO
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Permite a un `platform_admin` partir de la exportación administrativa XLSX,
-- editar celdas y devolver el fichero para ACTUALIZAR proveedores existentes.
--
-- NUNCA crea proveedores. No es un importador. El alta masiva sigue viviendo en
-- `/admin/proveedores/importar` y las dos operaciones no comparten ni tablas ni
-- función de escritura: mezclarlas es exactamente cómo se acaba creando 12.000
-- duplicados por un identificador mal escrito.
--
-- ── El identificador, y por qué solo puede ser `id` ─────────────────────────
--
-- Medido sobre los 12.288 proveedores reales:
--
--   tax_id                 cobertura 0 %      → inservible
--   email                  cobertura 0 %      → inservible
--   name                   391 nombres repetidos (uno 42 veces)
--   name + city + country  ~250 combinaciones repetidas
--
-- No hay ninguna clave natural. El único identificador estable es el UUID
-- interno, que la exportación administrativa ya publica en la columna
-- «ID interno». Es OBLIGATORIO en cada fila, no admite fallback, no admite
-- coincidencia aproximada y no se puede modificar.
--
-- ═════════════════════════════════════════════════════════════════════════════
-- 1. Batches
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Un batch es UNA operación: un fichero, una persona, un momento.
--
-- Igual que en 030, lo validado vive en la BASE DE DATOS y la confirmación solo
-- manda un identificador. El navegador nunca devuelve las filas validadas: si
-- pudiera, bastaría con cambiar un UUID entre la vista previa y el botón de
-- confirmar para escribir sobre otro proveedor.

create table if not exists public.supplier_update_batches (
  id            uuid        primary key default gen_random_uuid(),

  filename      text        not null,
  -- sha256 del contenido. Es lo que detecta la reaplicación del MISMO fichero.
  -- Se usa el hash y NO el nombre: «proveedores.xlsx» es el nombre de todos los
  -- ficheros de todo el mundo.
  file_hash     text        not null,
  file_size     integer     not null,

  -- ── Estados ───────────────────────────────────────────────────────────────
  --
  --   ready                  validado, hay al menos una fila que aplicar
  --   no_changes             validado, todas las filas coinciden ya con la BD
  --   invalid                validado, ninguna fila aplicable y hay errores
  --   completed              aplicado sin incidencias
  --   completed_with_errors  aplicado, algo se quedó fuera
  --   cancelled              descartado antes de aplicar
  --
  -- `validating` y `applying` NO existen: las dos operaciones son síncronas
  -- dentro de una petición y nadie podría observar ese estado. La serialización
  -- de confirmaciones concurrentes la da el `for update`, no un estado.
  status        text        not null default 'ready'
                            check (status in ('ready', 'no_changes', 'invalid',
                                              'completed', 'completed_with_errors',
                                              'cancelled')),

  total_rows      integer   not null default 0,
  valid_rows      integer   not null default 0,
  unchanged_rows  integer   not null default 0,
  invalid_rows    integer   not null default 0,
  duplicate_rows  integer   not null default 0,
  updated_rows    integer   not null default 0,
  skipped_rows    integer   not null default 0,
  failed_rows     integer   not null default 0,

  -- `set null`: si la persona se da de baja, el batch se conserva. Se pierde la
  -- autoría, no la trazabilidad de qué se cambió.
  created_by    uuid        references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now(),
  validated_at  timestamptz,
  applied_at    timestamptz,

  -- Columnas del fichero que se ignoraron, avisos de cabecera, etc.
  metadata      jsonb       not null default '{}'::jsonb,
  error_summary text,

  constraint supplier_update_batches_counts_positive check (
    total_rows >= 0 and valid_rows >= 0 and unchanged_rows >= 0
    and invalid_rows >= 0 and duplicate_rows >= 0 and updated_rows >= 0
    and skipped_rows >= 0 and failed_rows >= 0
  ),
  -- Un batch aplicado tiene fecha; uno sin aplicar, no. Impide que un `update`
  -- suelto deje el registro diciendo dos cosas a la vez.
  constraint supplier_update_batches_applied_coherent check (
    (status in ('completed', 'completed_with_errors')) = (applied_at is not null)
  )
);

comment on table public.supplier_update_batches is
  'Fase 3.2 — una operación de actualización masiva de proveedores: un fichero, '
  'una persona. NUNCA crea proveedores. Solo platform_admin.';

create index if not exists idx_sub_created_at on public.supplier_update_batches (created_at desc);
create index if not exists idx_sub_file_hash  on public.supplier_update_batches (file_hash);

-- ═════════════════════════════════════════════════════════════════════════════
-- 2. Filas
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Se guardan TODAS: válidas, sin cambios, inválidas y con ID repetido. Las que
-- no se aplican son justo las que hay que poder revisar y descargar.
--
-- ── Las tres columnas jsonb, y por qué son tres ─────────────────────────────
--
--   raw_data           la fila tal cual venía del fichero. Permite reconstruir
--                      el informe sin volver a pedir el XLSX.
--   current_values     lo que había en `suppliers` en el momento de validar.
--                      Es la mitad izquierda del «valor actual → valor nuevo».
--   normalized_changes SOLO los campos que cambian, ya convertidos al tipo
--                      real. Un `null` aquí significa borrar (`__CLEAR__`);
--                      una clave AUSENTE significa no tocar. Son cosas
--                      distintas y por eso no se puede usar un único objeto con
--                      todos los campos.

create table if not exists public.supplier_update_rows (
  id            uuid        primary key default gen_random_uuid(),
  batch_id      uuid        not null references public.supplier_update_batches(id) on delete cascade,

  -- Número de línea en Excel, contando la cabecera como 1. Es lo que la persona
  -- ve en su hoja, así que es lo que hay que enseñarle.
  row_number    integer     not null,

  -- `set null`, no `cascade`: si alguien borra un proveedor después, el registro
  -- de que aquella fila lo modificó no puede desaparecer.
  supplier_id   uuid        references public.suppliers(id) on delete set null,

  -- ── Estados ───────────────────────────────────────────────────────────────
  --
  --   valid        hay cambios y son aplicables
  --   unchanged    el fichero dice lo mismo que ya hay en la base
  --   invalid      error de formato, de tipo, de taxonomía o ID inexistente
  --   duplicate_id el mismo UUID aparece más de una vez en el fichero
  --   updated      aplicada
  --   skipped      era válida pero el proveedor ya no existía al aplicar
  --   failed       la escritura falló (restricción de la base)
  status        text        not null
                            check (status in ('valid', 'unchanged', 'invalid',
                                              'duplicate_id', 'updated',
                                              'skipped', 'failed')),

  raw_data           jsonb  not null default '{}'::jsonb,
  current_values     jsonb  not null default '{}'::jsonb,
  normalized_changes jsonb  not null default '{}'::jsonb,
  validation_errors  jsonb  not null default '[]'::jsonb,

  updated_fields text[]     not null default '{}',

  applied_at    timestamptz,
  created_at    timestamptz not null default now(),

  constraint supplier_update_rows_unique_line unique (batch_id, row_number),

  constraint supplier_update_rows_changes_object check (
    jsonb_typeof(normalized_changes) = 'object'
    and jsonb_typeof(current_values) = 'object'
    and jsonb_typeof(raw_data) = 'object'
  ),

  -- ── La allowlist, dentro de PostgreSQL ────────────────────────────────────
  --
  -- Restar del objeto todas las claves permitidas debe dejarlo vacío. Si queda
  -- algo, es un campo que nadie autorizó a tocar y la fila ni siquiera se puede
  -- guardar.
  --
  -- No es decorativo: es la última barrera antes de un UPDATE. La validación en
  -- TypeScript ya filtra, pero una allowlist que solo vive en la aplicación se
  -- salta escribiendo directamente en PostgREST con una sesión de administrador.
  --
  -- Se declara como expresión pura porque un CHECK no admite subconsultas:
  -- `jsonb - text[]` borra esas claves y devuelve el resto.
  constraint supplier_update_rows_allowed_fields check (
    (normalized_changes - array[
      'name', 'email', 'phone', 'website', 'tax_id',
      'country', 'region', 'city', 'postal_code', 'address',
      'latitude', 'longitude',
      'produccion_value', 'produccion_unit', 'medida',
      'notes', 'is_active',
      'supplier_market_id', 'supplier_category_id',
      'supplier_family_id', 'supplier_subfamily_id'
    ]) = '{}'::jsonb
  ),

  -- Una fila aplicada tiene fecha de aplicación; una que no, no la tiene.
  constraint supplier_update_rows_applied_coherent check (
    (status = 'updated') = (applied_at is not null)
  )
);

comment on table public.supplier_update_rows is
  'Fase 3.2 — cada fila del fichero, con su estado, el valor actual y el valor '
  'nuevo. Es la ÚNICA fuente de verdad de qué se escribe: la confirmación no '
  'acepta datos del navegador, solo el identificador del batch.';

comment on column public.supplier_update_rows.normalized_changes is
  'Solo los campos que cambian. Clave ausente = no tocar. Clave con null = '
  'borrar (__CLEAR__). Las claves están limitadas por CHECK a la allowlist.';

-- El acceso real es «las filas de este batch», paginadas por línea…
create index if not exists idx_sur_batch_line   on public.supplier_update_rows (batch_id, row_number);
-- …y filtradas por estado en la vista previa.
create index if not exists idx_sur_batch_status on public.supplier_update_rows (batch_id, status);
-- Trazabilidad inversa: «qué actualizaciones ha recibido este proveedor».
create index if not exists idx_sur_supplier     on public.supplier_update_rows (supplier_id)
  where supplier_id is not null;

-- ═════════════════════════════════════════════════════════════════════════════
-- 3. RLS — solo plataforma
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Una sola policy `ALL` por tabla, igual que en 030. Ningún perfil de cliente
-- —owner, client_admin, buyer, seller— tiene nada que hacer aquí: un batch
-- contiene notas internas en `current_values` y en `normalized_changes`, que es
-- justo lo que 032 cerró.
--
-- Sin policy para el resto de `authenticated`, RLS deniega por defecto. No hace
-- falta escribir una policy para conseguir eso, y escribirla solo añadiría una
-- superficie más que revisar.

alter table public.supplier_update_batches enable row level security;
alter table public.supplier_update_rows    enable row level security;

drop policy if exists admin_all_supplier_update_batches on public.supplier_update_batches;
create policy admin_all_supplier_update_batches on public.supplier_update_batches
  for all using (is_platform_admin()) with check (is_platform_admin());

drop policy if exists admin_all_supplier_update_rows on public.supplier_update_rows;
create policy admin_all_supplier_update_rows on public.supplier_update_rows
  for all using (is_platform_admin()) with check (is_platform_admin());

-- ═════════════════════════════════════════════════════════════════════════════
-- 4. `apply_supplier_update(uuid)` — la escritura, en UNA transacción
-- ═════════════════════════════════════════════════════════════════════════════
--
-- ── Por qué una función y no UPDATEs desde la Server Action ────────────────
--
-- Porque escribir los proveedores, marcar las filas como aplicadas y cerrar el
-- batch tienen que ocurrir juntos. Desde la aplicación serían N+2 viajes: si el
-- proceso muere a la mitad quedan proveedores modificados que el batch dice no
-- haber tocado, y la siguiente confirmación los volvería a intentar.
--
-- ── Nada de SQL dinámico ───────────────────────────────────────────────────
--
-- Los nombres de columna del fichero NO construyen SQL. Cada campo tiene su
-- asignación ESCRITA A MANO aquí abajo, y el `case … ? 'campo'` decide si se
-- toca o se deja como estaba. No hay `execute`, no hay `format()`, no hay
-- concatenación. Una columna inventada en el XLSX no puede llegar a ninguna
-- parte: la allowlist de TypeScript la descarta, el CHECK de la tabla la
-- rechazaría, y aquí sencillamente no existe.
--
-- ── Idempotencia ───────────────────────────────────────────────────────────
--
-- El `select … for update` bloquea el batch. Dos peticiones simultáneas —doble
-- clic, dos pestañas— se serializan: la primera aplica y deja `completed`; la
-- segunda despierta, ve que ya no es `ready` y sale con un error claro sin
-- escribir nada.
--
-- ── SECURITY DEFINER, y por qué es seguro ──────────────────────────────────
--
-- Lo es porque la PRIMERA línea comprueba `is_platform_admin()` y lanza si no lo
-- es: la función NO delega esa comprobación en quien la llama. Sin esa línea,
-- `security definer` la convertiría en una puerta trasera para escribir en
-- `suppliers` desde cualquier sesión autenticada.
--
-- Es necesario además porque la función escribe `notes`, cuya lectura está
-- revocada a nivel de columna desde 032.

create or replace function public.apply_supplier_update(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_batch        public.supplier_update_batches%rowtype;
  v_fila         record;
  v_c            jsonb;
  v_actualizadas integer := 0;
  v_omitidas     integer := 0;
  v_fallidas     integer := 0;
  v_estado       text;
  v_msg          text;
  v_incoherente  boolean;
begin
  -- 1. Autorización. Antes que nada y sin excepciones.
  if not public.is_platform_admin() then
    raise exception 'Solo un administrador de plataforma puede actualizar proveedores en masa.'
      using errcode = '42501';
  end if;

  -- 2. Bloqueo del batch. Serializa las confirmaciones concurrentes.
  select * into v_batch
    from public.supplier_update_batches
   where id = p_batch_id
   for update;

  if not found then
    raise exception 'No se ha encontrado la actualización indicada.' using errcode = 'P0002';
  end if;

  -- 3. Solo se aplica desde `ready`. Un batch cerrado no se reabre NUNCA.
  if v_batch.status <> 'ready' then
    raise exception 'Esta actualización ya no se puede confirmar (estado actual: %).', v_batch.status
      using errcode = '22023';
  end if;

  -- 4. Fila a fila, y SOLO las válidas.
  --
  --    Se recorren de una en una en lugar de con un único UPDATE masivo porque
  --    cada fila debe poder fallar por su cuenta sin llevarse por delante las
  --    demás: el bloque `begin … exception` abre una subtransacción por fila.
  --    El batch entero sigue siendo una sola transacción; lo que se acota es el
  --    daño de una restricción incumplida en una fila concreta.
  for v_fila in
    select r.id, r.supplier_id, r.normalized_changes
      from public.supplier_update_rows r
     where r.batch_id = p_batch_id
       and r.status   = 'valid'
     order by r.row_number
     for update
  loop
    v_c := v_fila.normalized_changes;

    begin
      -- Asignación explícita, campo a campo. `? 'campo'` distingue «no viene»
      -- de «viene vacío»: lo primero deja el valor actual, lo segundo lo borra.
      update public.suppliers s set
        name        = case when v_c ? 'name'        then v_c->>'name'        else s.name        end,
        email       = case when v_c ? 'email'       then v_c->>'email'       else s.email       end,
        phone       = case when v_c ? 'phone'       then v_c->>'phone'       else s.phone       end,
        website     = case when v_c ? 'website'     then v_c->>'website'     else s.website     end,
        tax_id      = case when v_c ? 'tax_id'      then v_c->>'tax_id'      else s.tax_id      end,
        country     = case when v_c ? 'country'     then v_c->>'country'     else s.country     end,
        region      = case when v_c ? 'region'      then v_c->>'region'      else s.region      end,
        city        = case when v_c ? 'city'        then v_c->>'city'        else s.city        end,
        postal_code = case when v_c ? 'postal_code' then v_c->>'postal_code' else s.postal_code end,
        address     = case when v_c ? 'address'     then v_c->>'address'     else s.address     end,
        medida      = case when v_c ? 'medida'      then v_c->>'medida'      else s.medida      end,
        notes       = case when v_c ? 'notes'       then v_c->>'notes'       else s.notes       end,
        produccion_unit = case when v_c ? 'produccion_unit'
                               then v_c->>'produccion_unit' else s.produccion_unit end,

        latitude  = case when v_c ? 'latitude'  then (v_c->>'latitude')::numeric  else s.latitude  end,
        longitude = case when v_c ? 'longitude' then (v_c->>'longitude')::numeric else s.longitude end,
        produccion_value = case when v_c ? 'produccion_value'
                                then (v_c->>'produccion_value')::numeric else s.produccion_value end,

        is_active = case when v_c ? 'is_active' then (v_c->>'is_active')::boolean else s.is_active end,

        supplier_market_id = case when v_c ? 'supplier_market_id'
                                  then (v_c->>'supplier_market_id')::uuid else s.supplier_market_id end,
        supplier_category_id = case when v_c ? 'supplier_category_id'
                                    then (v_c->>'supplier_category_id')::uuid else s.supplier_category_id end,
        supplier_family_id = case when v_c ? 'supplier_family_id'
                                  then (v_c->>'supplier_family_id')::uuid else s.supplier_family_id end,
        supplier_subfamily_id = case when v_c ? 'supplier_subfamily_id'
                                     then (v_c->>'supplier_subfamily_id')::uuid else s.supplier_subfamily_id end
      where s.id = v_fila.supplier_id;

      if not found then
        -- El proveedor existía al validar y ya no está. No se recrea: se omite.
        update public.supplier_update_rows
           set status = 'skipped',
               validation_errors = validation_errors || jsonb_build_array(
                 jsonb_build_object('column', null,
                                    'message', 'El proveedor ya no existe. No se ha creado ninguno nuevo.'))
         where id = v_fila.id;
        v_omitidas := v_omitidas + 1;
      else
        -- Coherencia de la taxonomía sobre el estado FINAL de la fila.
        --
        -- Las claves foráneas garantizan que cada id EXISTE, pero no que la
        -- categoría pertenezca al mercado. La validación en servidor ya lo
        -- comprobó; esto vuelve a comprobarlo aquí porque entre validar y
        -- confirmar pueden pasar minutos y la taxonomía puede haberse
        -- reorganizado. Si no cuadra, la fila se deshace y queda `failed`.
        select exists (
          select 1
            from public.suppliers s
            left join public.supplier_categories  sc on sc.id = s.supplier_category_id
            left join public.supplier_families    sf on sf.id = s.supplier_family_id
            left join public.supplier_subfamilies ss on ss.id = s.supplier_subfamily_id
           where s.id = v_fila.supplier_id
             and (
               (s.supplier_market_id is null and (
                  s.supplier_category_id is not null or s.supplier_family_id is not null
                  or s.supplier_subfamily_id is not null))
               or (s.supplier_category_id is not null and (
                  s.supplier_market_id is null or sc.supplier_market_id is distinct from s.supplier_market_id))
               or (s.supplier_family_id is not null and (
                  s.supplier_category_id is null or sf.supplier_category_id is distinct from s.supplier_category_id))
               or (s.supplier_subfamily_id is not null and (
                  s.supplier_family_id is null or ss.supplier_family_id is distinct from s.supplier_family_id))
             )
        ) into v_incoherente;

        if v_incoherente then
          raise exception 'La taxonomía resultante no es coherente: mercado, categoría, familia y subfamilia deben encadenar.'
            using errcode = '23514';
        end if;

        update public.supplier_update_rows
           set status = 'updated', applied_at = now()
         where id = v_fila.id;
        v_actualizadas := v_actualizadas + 1;
      end if;

    exception when others then
      -- La subtransacción de ESTA fila se deshace; el proveedor queda como
      -- estaba. Las demás siguen.
      v_msg := left(coalesce(sqlerrm, 'Error desconocido'), 300);
      update public.supplier_update_rows
         set status = 'failed',
             validation_errors = validation_errors || jsonb_build_array(
               jsonb_build_object('column', null, 'message', v_msg))
       where id = v_fila.id;
      v_fallidas := v_fallidas + 1;
    end;
  end loop;

  -- 5. Cerrar el batch. `completed_with_errors` cuando algo se quedó fuera:
  --    quien actualiza debe verlo de un vistazo, no descubrirlo en el informe.
  v_estado := case
    when v_fallidas > 0 or v_omitidas > 0
      or v_batch.invalid_rows > 0 or v_batch.duplicate_rows > 0
      then 'completed_with_errors'
    else 'completed'
  end;

  update public.supplier_update_batches
     set status       = v_estado,
         updated_rows = v_actualizadas,
         skipped_rows = v_omitidas,
         failed_rows  = v_fallidas,
         applied_at   = now()
   where id = p_batch_id;

  return jsonb_build_object(
    'batch_id',       p_batch_id,
    'status',         v_estado,
    'updated_rows',   v_actualizadas,
    'skipped_rows',   v_omitidas,
    'failed_rows',    v_fallidas,
    'unchanged_rows', v_batch.unchanged_rows,
    'invalid_rows',   v_batch.invalid_rows,
    'duplicate_rows', v_batch.duplicate_rows
  );
end;
$$;

comment on function public.apply_supplier_update(uuid) is
  'Fase 3.2 — aplica las filas válidas de un batch de actualización en una sola '
  'transacción. Comprueba platform_admin internamente, bloquea el batch para que '
  'un doble clic no aplique dos veces, y NUNCA inserta proveedores.';

-- ═════════════════════════════════════════════════════════════════════════════
-- 5. Grants
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Se revoca de `anon` EXPRESAMENTE, no solo de `PUBLIC`.
--
-- Es la lección de 029: el esquema tiene un `alter default privileges … grant
-- execute on functions to anon, authenticated, service_role`, y ese grant a
-- `anon` es DIRECTO. Revocar de `PUBLIC` no lo toca, así que las funciones de
-- 027 y 028 nacieron ejecutables por usuarios anónimos y hubo que corregirlo
-- después. Aquí importa todavía más: esta función ESCRIBE sobre `suppliers`.

revoke all on function public.apply_supplier_update(uuid) from public;
revoke all on function public.apply_supplier_update(uuid) from anon;
grant execute on function public.apply_supplier_update(uuid) to authenticated, service_role;

-- ═════════════════════════════════════════════════════════════════════════════
-- 6. Lo que esta migración NO hace
-- ═════════════════════════════════════════════════════════════════════════════
--
-- · No modifica ni una fila de `suppliers`. Cero DML sobre datos reales.
-- · No toca `search_suppliers` ni `admin_supplier_notes`: la privacidad de
--   `notes` establecida en 032 queda exactamente igual.
-- · No toca las policies de `suppliers` (`admin_all_suppliers` y
--   `client_select_active_suppliers` siguen intactas). Añade 2 policies nuevas,
--   las de las dos tablas nuevas: 60 → 62.
-- · No toca el importador de altas (`/admin/proveedores/importar`) ni sus
--   tablas.
-- · No introduce planes, membresías ni restricciones por organización: eso es
--   3.5 y no se adelanta aquí.

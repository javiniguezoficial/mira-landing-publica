-- 028 — Mercados favoritos por usuario y mercados deshabilitados por organización
--
-- Fase 2.1 y 2.2.
--
-- ═════════════════════════════════════════════════════════════════════════════
-- TRES CONCEPTOS QUE NO SE MEZCLAN
-- ═════════════════════════════════════════════════════════════════════════════
--
--   1. MÓDULO `markets`   (1.4, migración 027) — ¿tiene la ORGANIZACIÓN
--      contratado Market Intelligence? Vive en `organizations.modules`.
--   2. MERCADO DESHABILITADO (2.2, aquí)       — teniendo el módulo, ¿puede esa
--      organización ver ESTE mercado? Vive en `organization_disabled_markets`.
--   3. MERCADO FAVORITO   (2.1, aquí)          — ¿lo ha marcado ESTA PERSONA?
--      Vive en `user_market_favorites`. NO concede acceso a nada.
--
-- Un favorito nunca levanta una restricción. Es una preferencia de
-- presentación, y por eso se guarda aparte y su policy no mira organizaciones.
--
-- ═════════════════════════════════════════════════════════════════════════════
-- ALCANCE
-- ═════════════════════════════════════════════════════════════════════════════
--
-- SE AÑADE:
--   · tabla `user_market_favorites` + 3 policies;
--   · tabla `organization_disabled_markets` + 2 policies;
--   · función `market_enabled_for_user(uuid)`;
--   · índice `idx_products_market_lonja`.
--
-- SE REEMPLAZAN (drop + create, mismo nombre, misma intención, condición
-- AÑADIDA — nunca se retira una condición previa):
--   · markets.client_read_markets                    [SELECT]
--   · products.client_read_products                  [SELECT]
--   · product_price_records.client_read_price_records [SELECT]
--
-- NO SE TOCA:
--   · `organizations.modules` ni nada de 027;
--   · las policies `admin_all_*` de catálogo (bypass administrativo);
--   · `market_categories` ni `strategic_markets` — ver más abajo;
--   · cotizaciones, proveedores, planes, roles ni ningún dato productivo.
--
-- Policies: 53 antes → 58 después (5 nuevas; las 3 reemplazadas no cuentan).
--
-- ── Por qué el mercado deshabilitado SÍ llega a RLS ─────────────────────────
--
-- En 027 se dejó constancia de que Market Intelligence se apagaba solo en la
-- capa de aplicación, porque el catálogo es global y no tenía dónde colgar la
-- organización. 2.2 sí introduce esa relación, así que ahora existe el
-- `organization_id` que faltaba y la restricción puede vivir en SQL.
--
-- Es lo que hace que «una URL directa a un mercado deshabilitado no expone sus
-- datos» sea verdad y no una promesa de la interfaz: un `GET` a PostgREST
-- pidiendo `product_price_records` de ese mercado devuelve cero filas.
--
-- ── Por qué NO se tocan `market_categories` ni `strategic_markets` ──────────
--
-- Son agrupadores: nombre, icono y orden. No contienen ni un precio. Si todos
-- los mercados de una categoría quedan deshabilitados, la categoría se queda
-- vacía y la interfaz no la pinta, que es el comportamiento correcto. Añadirles
-- la comprobación agrandaría la superficie del cambio sin cerrar ninguna fuga.
--
-- ── Semántica con varias organizaciones (decisión explícita) ────────────────
--
-- `market_enabled_for_user` deniega si el mercado está deshabilitado en
-- CUALQUIERA de las organizaciones activas de la persona. Hoy nadie pertenece a
-- más de una, así que es exacto. Cuando exista multiempresa real habrá que
-- revisarlo: la alternativa —permitir si alguna organización lo habilita—
-- es más laxa, y entre las dos se elige la restrictiva. RLS es la red de
-- seguridad; ser más estricto que la aplicación no abre ninguna puerta.

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. Mercados favoritos por usuario (2.1)
-- ═════════════════════════════════════════════════════════════════════════════
--
-- FK a `profiles`, no a `auth.users`: es el patrón de todo el esquema
-- (`organization_members.user_id`, `support_tickets.user_id`, `rfqs.created_by`
-- apuntan a `profiles`). `profiles.id` ya referencia `auth.users` en cascada.
--
-- `on delete cascade` en las dos FKs: si se borra la persona o el mercado, el
-- favorito deja de tener sentido. No hay nada que conservar.

create table if not exists public.user_market_favorites (
  id          uuid        primary key default gen_random_uuid(),
  user_id     uuid        not null references public.profiles(id) on delete cascade,
  market_id   uuid        not null references public.markets(id)  on delete cascade,
  created_at  timestamptz not null default now(),

  -- Idempotencia en la BASE DE DATOS, no en la interfaz. Dos clics rápidos en
  -- la estrella, o dos pestañas abiertas, no pueden crear dos filas.
  constraint user_market_favorites_unique unique (user_id, market_id)
);

comment on table public.user_market_favorites is
  'Fase 2.1 — mercados marcados como favoritos por CADA PERSONA. No es de la '
  'organización y no concede acceso a nada: si el mercado se deshabilita para '
  'la organización, el favorito se conserva y deja de mostrarse.';

-- El acceso real es siempre «los favoritos de este usuario», así que el índice
-- por `user_id` es el que sirve a la consulta. El unique ya crea un índice
-- (user_id, market_id) que la cubre por prefijo, pero se declara explícito el
-- de `market_id` para el borrado en cascada al eliminar un mercado.
create index if not exists idx_umf_user on public.user_market_favorites (user_id);
create index if not exists idx_umf_market on public.user_market_favorites (market_id);

alter table public.user_market_favorites enable row level security;

-- Tres policies separadas por comando, no una `ALL`. Cada una dice
-- exactamente lo mismo —`user_id = auth.uid()`— y deja legible que aquí no hay
-- UPDATE: un favorito se crea o se borra, no se edita.
--
-- NO hay bypass de `platform_admin`, y es deliberado. En el resto del esquema
-- lo hay porque la plataforma administra datos de negocio; un favorito es una
-- preferencia personal, no un dato administrable. Nadie tiene por qué ver ni
-- tocar los favoritos de otra persona.

drop policy if exists user_manage_own_favorites_select on public.user_market_favorites;
create policy user_manage_own_favorites_select on public.user_market_favorites
  for select using (user_id = auth.uid());

drop policy if exists user_manage_own_favorites_insert on public.user_market_favorites;
create policy user_manage_own_favorites_insert on public.user_market_favorites
  for insert with check (user_id = auth.uid());

drop policy if exists user_manage_own_favorites_delete on public.user_market_favorites;
create policy user_manage_own_favorites_delete on public.user_market_favorites
  for delete using (user_id = auth.uid());

-- ═════════════════════════════════════════════════════════════════════════════
-- 2. Mercados deshabilitados por organización (2.2)
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Tabla normalizada, NO una lista dentro de `organizations.modules`. El jsonb de
-- 027 tiene un CHECK que solo admite dos claves booleanas, y meter ahí un array
-- de identificadores obligaría a relajarlo; además no habría FK a `markets`, así
-- que borrar un mercado dejaría identificadores muertos dentro del JSON.
--
-- Se guardan los DESHABILITADOS, no los habilitados. Es lo que hace que el
-- comportamiento por defecto sea «todo visible»: una organización sin filas
-- aquí ve todos los mercados, así que aplicar esta migración no le quita el
-- acceso a nadie. Con la lista inversa habría que rellenar 127 filas por cliente
-- solo para dejar las cosas como estaban.
--
-- La clave primaria es (organization_id, market_id): la pareja ES la identidad
-- del registro, no hace falta un `id` sintético.

create table if not exists public.organization_disabled_markets (
  organization_id uuid        not null references public.organizations(id) on delete cascade,
  market_id       uuid        not null references public.markets(id)       on delete cascade,
  disabled_at     timestamptz not null default now(),
  -- Quién lo deshabilitó. `set null` y no `cascade`: si esa persona se da de
  -- baja, el mercado debe seguir deshabilitado; lo que se pierde es la autoría.
  disabled_by     uuid        references public.profiles(id) on delete set null,

  primary key (organization_id, market_id)
);

comment on table public.organization_disabled_markets is
  'Fase 2.2 — mercados que una organización NO puede ver, teniendo el módulo '
  'markets activo. Se almacenan los deshabilitados: sin filas, la organización '
  've todos los mercados.';

-- La consulta caliente es «qué mercados tiene deshabilitados esta
-- organización», que la PK cubre por prefijo. Este índice sirve al camino
-- inverso —«qué organizaciones tienen deshabilitado este mercado»— que usa
-- `market_enabled_for_user` al evaluarse por fila.
create index if not exists idx_odm_market on public.organization_disabled_markets (market_id);

alter table public.organization_disabled_markets enable row level security;

-- Lectura: los miembros ACTIVOS de la organización pueden saber qué mercados
-- tiene deshabilitados su empresa. No es información sensible —ya lo notan al
-- no verlos— y permite explicarlo en la interfaz.
drop policy if exists org_member_select_disabled_markets on public.organization_disabled_markets;
create policy org_member_select_disabled_markets on public.organization_disabled_markets
  for select using (is_org_member(organization_id));

-- Escritura: SOLO plataforma. Una sola policy `ALL` para insert/update/delete.
--
-- Esto es lo que impide que la persona propietaria se rehabilite mercados por
-- su cuenta. En 027 hizo falta un trigger para lo mismo, porque `organizations`
-- ya tenía una policy de UPDATE para el owner; aquí la tabla es nueva y no
-- existe ninguna policy que le dé escritura, así que basta con no dársela.
drop policy if exists admin_all_disabled_markets on public.organization_disabled_markets;
create policy admin_all_disabled_markets on public.organization_disabled_markets
  for all using (is_platform_admin()) with check (is_platform_admin());

-- ═════════════════════════════════════════════════════════════════════════════
-- 3. `market_enabled_for_user(market_id)`
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Misma forma que el resto de funciones de autorización: `stable`,
-- `security definer`, `search_path` explícito. `security definer` es
-- imprescindible porque se invoca DENTRO de las policies de catálogo: sin él,
-- leer `organization_disabled_markets` volvería a pasar por RLS.
--
-- Devuelve TRUE cuando no hay ninguna razón para ocultar el mercado:
--
--   · sin sesión            -> las policies de catálogo ya exigen `auth.uid()`
--                              antes de llamar aquí;
--   · sin pertenencias      -> true. Un `platform_admin` sin organización, o
--                              una cuenta recién creada, no tienen ninguna
--                              organización que restrinja nada;
--   · con pertenencias      -> false si ALGUNA activa lo tiene deshabilitado.
--
-- OJO con el matiz: esta función NO comprueba el módulo `markets` de 1.4. Son
-- ejes distintos y mezclarlos aquí volvería a fundir los dos conceptos que 027
-- separó. El módulo se aplica en la capa de aplicación, como quedó documentado.

create or replace function public.market_enabled_for_user(market_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1
    from public.organization_disabled_markets odm
    join public.organization_members om
      on om.organization_id = odm.organization_id
    join public.organizations o
      on o.id = odm.organization_id
    where odm.market_id = market_enabled_for_user.market_id
      and om.user_id    = auth.uid()
      and om.status     = 'active'
      and o.status      = 'active'
  );
$$;

comment on function public.market_enabled_for_user(uuid) is
  'Fase 2.2 — ¿puede quien hace la petición ver este mercado? False si alguna '
  'de sus organizaciones activas lo tiene deshabilitado. No evalúa el módulo '
  'markets de 1.4: son ejes distintos.';

-- OJO — ESTE REVOKE NO DEJA A `anon` SIN EXECUTE.
--
-- Comprobado tras aplicar la migración: la ACL resultante es
-- `postgres=X | anon=X | authenticated=X | service_role=X`, es decir, `anon`
-- CONSERVA el privilegio. La causa es que Supabase tiene un
-- `alter default privileges ... grant execute on functions to anon,
-- authenticated, service_role`, y ese grant es EXPLÍCITO para `anon`, no
-- heredado de `PUBLIC`. Revocar de `PUBLIC` no lo toca.
--
-- Las funciones anteriores (`is_org_member`, `can_buy_in_org`,
-- `is_platform_admin`) sí tienen `anon=false`, porque se crearon antes de que
-- ese default estuviera activo. `org_module_enabled` (027) arrastra el mismo
-- problema que esta.
--
-- Impacto real de ESTA función: nulo. Es `security definer` y decide con
-- `auth.uid()`, que para `anon` es NULL, así que el join nunca casa y devuelve
-- `true` — «visible»— sin leer ni filtrar ningún dato. Además las tres policies
-- de catálogo exigen `auth.uid() is not null` ANTES de llamarla.
--
-- Se deja como está y se corrige aparte, en su propio cambio consciente, con
-- `revoke all ... from public, anon;` para las dos funciones a la vez.
revoke all on function public.market_enabled_for_user(uuid) from public;
grant execute on function public.market_enabled_for_user(uuid) to authenticated, service_role;

-- ═════════════════════════════════════════════════════════════════════════════
-- 4. Las policies de catálogo pasan a respetar los mercados deshabilitados
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Cada una conserva LITERALMENTE su condición anterior y suma la comprobación.
-- Se recrean con el mismo nombre. Las `admin_all_*` no se tocan: la plataforma
-- conserva acceso global, igual que en 027 y por la misma razón —quien
-- deshabilita el mercado tiene que poder seguir administrándolo.

-- 4.1 markets
drop policy if exists client_read_markets on public.markets;
create policy client_read_markets on public.markets
  for select
  using (
    auth.uid() is not null
    and is_active = true
    and exists (
      select 1 from public.market_categories mc
      where mc.id = markets.category_id and mc.is_active = true
    )
    and market_enabled_for_user(markets.id)
  );

-- 4.2 products — se comprueba sobre el mercado al que pertenece el producto.
--
-- La comprobación va DENTRO del EXISTS que ya existía, no en uno aparte. Se
-- probó primero con dos EXISTS separados y el plan lo delató: el segundo
-- volvía a evaluar entera la policy de `markets` —que a su vez llama a
-- `market_enabled_for_user`—, duplicando el trabajo. Medido sobre las 608 filas
-- reales, con `explain (analyze, buffers)` de un listado de 50 registros:
--
--   dos EXISTS separados  →  51,8 ms · 9054 buffers
--   un solo EXISTS        →  38,2 ms · 6456 buffers   (−26 % tiempo, −29 % E/S)
drop policy if exists client_read_products on public.products;
create policy client_read_products on public.products
  for select
  using (
    auth.uid() is not null
    and is_active = true
    and exists (
      select 1
      from public.markets m
      join public.market_categories mc on mc.id = m.category_id
      where m.id = products.market_id
        and m.is_active = true
        and mc.is_active = true
        and market_enabled_for_user(m.id)
    )
  );

-- 4.3 product_price_records — aquí están los precios, así que es la que de
--     verdad cierra la fuga. Sin esto, una consulta directa a PostgREST por
--     `product_id` seguiría devolviendo la serie histórica completa de un
--     mercado deshabilitado.
drop policy if exists client_read_price_records on public.product_price_records;
create policy client_read_price_records on public.product_price_records
  for select
  using (
    auth.uid() is not null
    and exists (
      select 1
      from public.products p
      join public.markets m            on m.id = p.market_id
      join public.market_categories mc on mc.id = m.category_id
      where p.id = product_price_records.product_id
        and p.is_active = true
        and m.is_active = true
        and mc.is_active = true
        and market_enabled_for_user(m.id)
    )
  );

-- ═════════════════════════════════════════════════════════════════════════════
-- 5. Índice para el filtro por lonja (2.4)
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Un único índice nuevo, y se justifica:
--
-- El filtro por lonja siempre llega acompañado del mercado o del producto —el
-- selector solo ofrece las lonjas del mercado que se está mirando—, así que el
-- acceso real es `market_id = ? and lonja = ?`. Ese es el orden de las columnas.
--
-- `where lonja is not null` lo deja como índice PARCIAL: el único producto sin
-- lonja de los 931 no ocupa espacio y nunca se busca por ese valor.
--
-- NO se añade ningún índice para el filtro temporal: `recorded_at` ya tiene
-- `idx_ppr_recorded_at (recorded_at DESC)` e `idx_ppr_product_recorded
-- (product_id, recorded_at DESC)`, que cubren tanto el listado global por fecha
-- como la serie de un producto. Añadir más sería coste de escritura sin lectura
-- que lo aproveche.

create index if not exists idx_products_market_lonja
  on public.products (market_id, lonja)
  where lonja is not null;

-- ═════════════════════════════════════════════════════════════════════════════
-- 6. Coste conocido de esta migración (medido, no estimado)
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Llevar el mercado deshabilitado a RLS no sale gratis. Con los datos reales
-- (608 registros de precio, 127 mercados, 931 productos) y un listado de 50
-- filas ordenado por fecha:
--
--   · `market_enabled_for_user` se evalúa ~495 veces por consulta, porque la
--     policy de `products` consulta `markets`, cuya policy la invoca de nuevo;
--   · tiempo de ejecución: 38 ms, con 6456 buffers en caché.
--
-- Es asumible a este volumen y la corrección lo justifica: sin esto, una
-- petición directa a PostgREST devolvería la serie histórica completa de un
-- mercado deshabilitado. Pero NO escala linealmente, y conviene dejarlo escrito
-- antes de que alguien lo descubra con 100.000 filas.
--
-- Si el histórico crece un orden de magnitud, la vía es sustituir la llamada
-- por fila por un `not in (subconsulta de mercados deshabilitados del usuario)`
-- evaluado UNA vez por consulta —InitPlan en lugar de SubPlan—, o materializar
-- esos identificadores en una vista. No se hace ahora porque optimizar sobre
-- 608 filas sería optimizar a ciegas.

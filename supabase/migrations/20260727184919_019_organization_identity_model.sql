-- ═══════════════════════════════════════════════════════════════════════════
-- 019_organization_identity_model  ·  BLOQUE 6A
--
-- ⚠️ ESTADO: NO APLICADA. Timestamp del nombre PROVISIONAL.
--    Última versión remota al redactarla: 20260727172133 / 018_supplier_filter_options.
--    Tras aplicarla con `apply_migration`, RENOMBRAR este archivo al timestamp
--    real que registre el historial remoto, igual que se hizo con la 018.
--    Ver `docs/DATABASE_OVERVIEW.md` → "Historial de migraciones y reconciliación".
--
-- Propósito
--   Base del modelo de identidad: separa tres ejes que hoy están mezclados o
--   ausentes — rol global, rol dentro de la organización y capacidades
--   comerciales — y añade estados a usuario, organización y pertenencia.
--
--   Resuelve además un defecto en producción: la única organización existente
--   NO TIENE PROPIETARIO (0 filas con role='client_owner'), lo que deja muertas
--   cuatro policies: org_owner_update, members_owner_insert, members_owner_delete
--   y subscriptions_owner_select. Hoy ninguna empresa puede autogestionarse.
--
-- ADITIVA y NO destructiva:
--   · No borra columnas ni datos.
--   · No estrecha ningún CHECK existente (solo amplía profiles.role).
--   · Conserva organization_members.role como columna legacy.
--   · No toca policies de catálogo, RFQs, módulos ni Auth.
--   · Única función redefinida: is_org_owner(), por compatibilidad (ver §5).
--
-- Escritura dual deliberada (§4): al elegir propietario se escribe TANTO
--   org_role='owner' (modelo nuevo) COMO role='client_owner' (modelo antiguo).
--   Es lo que permite que la interfaz actual —que lee `role`— muestre y
--   permita gestionar al propietario desde el primer momento, sin esperar al
--   Bloque 6B. Sin esa escritura dual el defecto seguiría visible para el
--   usuario aunque el dato nuevo fuese correcto.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1. profiles: estado global y rol simplificado ─────────────────────────

-- DEFAULT 'active' de forma TEMPORAL durante esta fase (ver nota al final del
-- bloque): todavía no existe ningún mecanismo para aprobar un perfil pendiente.
alter table public.profiles
  add column if not exists status text not null default 'active';

alter table public.profiles
  add constraint profiles_status_check
    check (status in ('pending', 'active', 'suspended', 'rejected'));

-- El CHECK de `role` se AMPLÍA para admitir 'user' conviviendo con los valores
-- antiguos. No se estrecha: hay 12 archivos de la aplicación que todavía
-- escriben o leen client_owner/client_member. El estrechamiento va en un
-- bloque posterior, cuando el código ya no los use.
alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
    check (role in ('platform_admin', 'user', 'client_owner', 'client_member'));

-- Backfill. Los 3 platform_admin NO se tocan.
update public.profiles
   set role = 'user'
 where role in ('client_owner', 'client_member');

-- Backfill explícito de los perfiles existentes (redundante con el DEFAULT,
-- pero deja la intención escrita y protege si el DEFAULT cambiara).
update public.profiles
   set status = 'active'
 where status is distinct from 'active';

-- ⚠️ DEFAULT TEMPORAL — 'active', no 'pending'.
--
-- El destino del modelo es que un registro nuevo nazca en 'pending' y solo pase
-- a 'active' cuando MIRA lo apruebe. Pero ese cambio NO puede hacerse aquí:
-- en el Bloque 6A todavía no existen `signup_requests`, ni el panel de revisión,
-- ni la actualización de `handle_new_user()`, ni los emails de activación.
--
-- Poner 'pending' ahora crearía perfiles bloqueados sin ninguna forma de
-- aprobarlos: cada persona que se registrase quedaría en un limbo del que solo
-- se saldría con un UPDATE manual en base de datos.
--
-- El cambio a DEFAULT 'pending' se hará en el Bloque 6C, junto con el flujo
-- completo de alta. `handle_new_user()` NO se modifica en este bloque.


-- ── 2. organizations: estado y perfil comercial ───────────────────────────

-- `status` con DEFAULT 'active' TEMPORAL, por el mismo motivo que en profiles:
-- todavía no hay flujo de aprobación de organizaciones (Bloque 6C).
alter table public.organizations
  add column if not exists status text not null default 'active',
  add column if not exists commercial_profile text not null default 'buyer';

alter table public.organizations
  add constraint organizations_status_check
    check (status in ('pending', 'active', 'suspended', 'rejected'));

alter table public.organizations
  add constraint organizations_commercial_profile_check
    check (commercial_profile in ('buyer', 'seller', 'buyer_seller'));

-- Backfill: la organización existente queda activa y como COMPRADORA.
-- Justificación de 'buyer': su única actividad registrada son 3 RFQs de tipo
-- 'product' en estado 'open', que es la acción propia del comprador. No existe
-- ninguna funcionalidad de vendedor en la plataforma (las respuestas a RFQ las
-- introduce el administrador y la organización no está vinculada a ningún
-- proveedor). Conceder 'seller' otorgaría una capacidad que nadie ha usado ni
-- verificado; 'buyer' es el mínimo privilegio coherente con los datos.
update public.organizations
   set status = 'active'
 where status is distinct from 'active';


-- ── 3. organization_members: rol organizativo, capacidades y estado ───────

-- Capacidades comerciales con DEFAULT false por MÍNIMO PRIVILEGIO: poder
-- comprar o vender no debe derivarse de crear una pertenencia. Un miembro nuevo
-- puede ser comprador, vendedor, ambos o ninguno, y esa decisión la toman
-- explícitamente los flujos de alta (6C) e invitación (6D) o la administración.
alter table public.organization_members
  add column if not exists org_role text    not null default 'member',
  add column if not exists can_buy  boolean not null default false,
  add column if not exists can_sell boolean not null default false,
  add column if not exists status   text    not null default 'active';

alter table public.organization_members
  add constraint organization_members_org_role_check
    check (org_role in ('owner', 'admin', 'member'));

alter table public.organization_members
  add constraint organization_members_status_check
    check (status in ('invited', 'active', 'suspended'));

-- `org_role` es NOT NULL con default, así que la restricción "ningún miembro
-- activo sin rol organizativo" queda garantizada por el propio esquema.
--
-- `status` conserva DEFAULT 'active' también más allá de esta fase: una fila de
-- pertenencia creada directamente (por admin o backfill) describe a alguien que
-- ya forma parte de la organización. El estado 'invited' lo escribirá de forma
-- explícita el flujo de invitaciones del Bloque 6D, no un valor por defecto.

-- Backfill de los miembros existentes: activos y con capacidad de compra,
-- coherente con el commercial_profile='buyer' de su organización y con lo que
-- ya podían hacer antes de esta migración (crear RFQs). No se les concede venta.
--
-- El UPDATE es INCONDICIONAL a propósito. No puede filtrarse por `status`: al
-- añadirse la columna con DEFAULT 'active', TODAS las filas existentes ya nacen
-- con ese valor, así que un `where status is distinct from 'active'` no casaría
-- ninguna fila y los miembros actuales se quedarían con el DEFAULT false de
-- can_buy — perdiendo la capacidad de crear RFQs que hoy tienen.
--
-- Al aplicarse esta migración solo existen los miembros actuales, de modo que
-- el alcance del UPDATE está acotado por construcción.
update public.organization_members
   set status   = 'active',
       can_buy  = true,
       can_sell = false;


-- ── 4. Elección determinista de propietario ───────────────────────────────
--
-- Criterio, en este orden de prioridad:
--   1. PREFERIR a un miembro cuyo perfil NO sea platform_admin. La propiedad de
--      una empresa cliente es una responsabilidad del cliente; asignarla a un
--      administrador de MIRA mezclaría la identidad del proveedor de servicio
--      con la del cliente y dejaría a la empresa dependiendo de una cuenta
--      interna nuestra.
--   2. Entre los candidatos, el de `joined_at` más antiguo.
--   3. Desempate estable por `user_id` (orden de uuid), para que el resultado
--      sea idéntico ejecutando la migración cuantas veces sea.
--   4. FALLBACK: si la organización solo tiene miembros platform_admin, se
--      elige al más antiguo de ellos. Una organización sin propietario es peor
--      que una con un propietario interno provisional.
--
-- El ordenamiento por `(role = 'platform_admin') asc` coloca primero a los NO
-- administradores (false ordena antes que true), aplicando la preferencia sin
-- necesidad de una segunda consulta.
--
-- Los platform_admin que sean miembros NO se eliminan de organization_members:
-- conservan su pertenencia con org_role='member' y su rol global intacto.
--
-- Solo se aplica a organizaciones que NO tengan ya un propietario, de modo que
-- la sentencia es reejecutable sin efectos secundarios.
--
-- Escritura dual: org_role='owner' (modelo nuevo) + role='client_owner'
-- (modelo antiguo) — ver cabecera.

with sin_propietario as (
  select o.id as organization_id
    from public.organizations o
   where not exists (
     select 1 from public.organization_members m
      where m.organization_id = o.id
        and (m.org_role = 'owner' or m.role = 'client_owner')
   )
),
elegido as (
  select distinct on (m.organization_id)
         m.organization_id, m.user_id
    from public.organization_members m
    join sin_propietario s on s.organization_id = m.organization_id
    left join public.profiles p on p.id = m.user_id
   order by m.organization_id,
            (coalesce(p.role, '') = 'platform_admin') asc,  -- no-admin primero
            m.joined_at asc,
            m.user_id asc
)
update public.organization_members m
   set org_role = 'owner',
       role     = 'client_owner'
  from elegido e
 where m.organization_id = e.organization_id
   and m.user_id         = e.user_id;

-- El resto de miembros conserva org_role='member' (valor por defecto).


-- ── 5. is_org_owner(): compatibilidad de transición ───────────────────────
--
-- ÚNICA función redefinida en este bloque. Reconoce el modelo nuevo y, durante
-- la transición, también el antiguo. Se mantiene SECURITY DEFINER (necesario:
-- las policies la invocan sobre una tabla con RLS activa y sin ello habría
-- recursión), `stable`, y `search_path` fijado. No cambia su firma, así que
-- ninguna policy existente necesita reescribirse.
--
-- No se concede ningún permiso nuevo. Las policies de catálogo, RFQs y
-- módulos NO se tocan: corresponden al Bloque 6B.

create or replace function public.is_org_owner(org_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.organization_members
     where organization_id = org_id
       and user_id         = auth.uid()
       and (org_role = 'owner' or role = 'client_owner')
  );
$$;

comment on function public.is_org_owner(uuid) is
  'True si el usuario actual es propietario de la organización indicada. '
  'Durante la transición del Bloque 6A reconoce tanto org_role=''owner'' (modelo '
  'nuevo) como role=''client_owner'' (modelo legacy). Retirar la segunda '
  'condición cuando la columna legacy `role` se elimine.';


-- ── 6. Índices de apoyo ───────────────────────────────────────────────────

create index if not exists idx_org_members_org_role
  on public.organization_members (organization_id, org_role);

create index if not exists idx_profiles_status
  on public.profiles (status);

create index if not exists idx_organizations_status
  on public.organizations (status);


-- ── 7. Restricciones deliberadamente NO añadidas ──────────────────────────
--
-- · Índice único parcial "un solo owner por organización".
--   Descartado a propósito. Un índice único parcial no puede ser DEFERRABLE en
--   Postgres, así que una transferencia de propiedad transaccional (degradar al
--   antiguo y promover al nuevo en la misma transacción) fallaría a mitad si el
--   orden de las sentencias no fuese el correcto. Además bloquearía el caso
--   legítimo de copropiedad. La regla "al menos un propietario" y la semántica
--   de transferencia se implementarán en la capa de aplicación (Bloque 6D).
--
-- · Coherencia entre capacidades del miembro y perfil comercial de su
--   organización (can_sell solo si la organización puede vender).
--   Un CHECK no puede consultar otra tabla, así que exigiría un trigger.
--   Añadir un trigger de validación aquí introduciría riesgo en una migración
--   cuyo objetivo es ser puramente aditiva. Se valida en Server Actions y RLS
--   en el Bloque 6B.
--
-- · Estrechamiento de CHECKs (retirar client_owner/client_member) y eliminación
--   de organization_members.role. Van al final del plan, cuando ningún código
--   escriba esos valores.

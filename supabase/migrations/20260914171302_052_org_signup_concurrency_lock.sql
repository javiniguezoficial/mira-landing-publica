-- ═════════════════════════════════════════════════════════════════════════════
-- 052 · `create_organization_with_owner` gana un candado de concurrencia
-- ═════════════════════════════════════════════════════════════════════════════
--
-- ── El hueco ────────────────────────────────────────────────────────────────
--
-- El registro público completa el alta de la empresa en dos momentos posibles:
-- el callback de confirmación del correo y —desde este bloque— el primer login
-- si aquel callback falló (el caso real del 14-09: `flow_state_expired` al
-- confirmar el correo 5 minutos tarde). Dos caminos que pueden coincidir en el
-- tiempo: la pestaña del callback y un login en otra pestaña, o un doble clic.
--
-- La RPC ya era idempotente en el caso secuencial: si el usuario ya pertenece
-- a una organización, devuelve la existente. Pero esa comprobación es
-- read-then-write sin serializar: dos transacciones simultáneas pueden pasar
-- las dos por el `select` antes de que ninguna inserte, y crear DOS empresas
-- para la misma persona. No hay UNIQUE que lo pare —pertenecer a varias
-- organizaciones es legal en el modelo—, así que la guarda tiene que ser un
-- candado, no una constraint.
--
-- ── El arreglo ──────────────────────────────────────────────────────────────
--
-- `pg_advisory_xact_lock` sobre una clave derivada del propietario, tomado
-- ANTES de la comprobación de pertenencia. Dos llamadas concurrentes para el
-- mismo usuario se serializan: la primera crea, la segunda espera y al
-- despertar ve la membership y devuelve la organización existente. El candado
-- se libera solo al terminar la transacción, y es por-usuario: altas de
-- usuarios distintos no se estorban.
--
-- El resto del cuerpo es IDÉNTICO al que estaba en producción (026): mismas
-- comprobaciones de autorización, mismas validaciones, mismos estados, mismos
-- inserts, mismos permisos.

create or replace function public.create_organization_with_owner(
  p_name              text,
  p_plan_slug         text,
  p_commercial_profile text  default 'buyer',
  p_cif_nif           text   default null,
  p_country           text   default 'ES',
  p_phone             text   default null,
  p_owner_user_id     uuid   default null,
  p_status            text   default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid    := auth.uid();
  v_es_admin  boolean := public.is_platform_admin();
  v_owner     uuid;
  v_plan_id   uuid;
  v_status    text;
  v_source    text;
  v_org       uuid;
  v_existente uuid;
  v_can_buy   boolean;
  v_can_sell  boolean;
begin
  if v_uid is null then
    raise exception 'Debes iniciar sesión para crear una organización.'
      using errcode = '42501';
  end if;

  if v_es_admin then
    v_owner := coalesce(p_owner_user_id, v_uid);
  else
    if p_owner_user_id is not null and p_owner_user_id <> v_uid then
      raise exception 'No puedes crear una organización para otra persona.'
        using errcode = '42501';
    end if;
    v_owner := v_uid;
  end if;

  if not exists (select 1 from public.profiles where id = v_owner) then
    raise exception 'El usuario indicado no existe.' using errcode = '23503';
  end if;

  -- 052 — serializa las altas CONCURRENTES del mismo propietario. Sin esto,
  -- dos llamadas simultáneas (callback + primer login, o un doble clic) pueden
  -- pasar ambas la comprobación de abajo antes de que ninguna inserte, y crear
  -- dos empresas. El candado es por-usuario y muere con la transacción.
  perform pg_advisory_xact_lock(hashtextextended('org_signup:' || v_owner::text, 0));

  select om.organization_id into v_existente
    from public.organization_members om
   where om.user_id = v_owner
   limit 1;

  if v_existente is not null then
    return v_existente;
  end if;

  if p_name is null or length(btrim(p_name)) = 0 then
    raise exception 'El nombre de la empresa es obligatorio.' using errcode = '23514';
  end if;

  if coalesce(p_commercial_profile,'') not in ('buyer', 'seller', 'buyer_seller') then
    raise exception 'El tipo comercial no es válido.' using errcode = '23514';
  end if;

  select id into v_plan_id
    from public.plans
   where slug = p_plan_slug
     and is_active = true;

  if v_plan_id is null then
    raise exception 'El plan seleccionado no está disponible.' using errcode = '23514';
  end if;

  if v_es_admin then
    v_status := coalesce(p_status, 'pending');
    if v_status not in ('pending', 'active') then
      raise exception 'El estado indicado no es válido.' using errcode = '23514';
    end if;
    v_source := 'admin';
  else
    v_status := 'pending';
    v_source := 'landing';
  end if;

  v_can_buy  := p_commercial_profile in ('buyer', 'buyer_seller');
  v_can_sell := p_commercial_profile = 'seller';

  insert into public.organizations (
    name, cif_nif, country, phone,
    plan_id, requested_plan_id, plan_approved_by, plan_approved_at,
    status, commercial_profile, signup_source, subscription_status
  ) values (
    btrim(p_name), nullif(btrim(coalesce(p_cif_nif,'')),''), coalesce(nullif(btrim(coalesce(p_country,'')),''),'ES'),
    nullif(btrim(coalesce(p_phone,'')),''),
    case when v_es_admin then v_plan_id else null end,
    v_plan_id,
    case when v_es_admin then v_uid else null end,
    case when v_es_admin then now() else null end,
    v_status, p_commercial_profile, v_source, 'trial'
  )
  returning id into v_org;

  insert into public.organization_members (
    organization_id, user_id, org_role, role, status, can_buy, can_sell, invited_by
  ) values (
    v_org, v_owner, 'owner', 'client_owner', 'active', v_can_buy, v_can_sell,
    case when v_owner = v_uid then null else v_uid end
  );

  return v_org;
end;
$$;

comment on function public.create_organization_with_owner(text, text, text, text, text, text, uuid, text) is
  '052 — alta de organización con propietario único, idempotente Y serializada: '
  'devuelve la organización existente si el usuario ya pertenece a una, y un '
  'advisory lock por propietario impide que dos llamadas concurrentes '
  '(callback de email + primer login) creen dos empresas.';

-- Los permisos se vuelven a declarar, como siempre: la lección de la 029.
revoke execute on function public.create_organization_with_owner(text, text, text, text, text, text, uuid, text) from public, anon;
grant  execute on function public.create_organization_with_owner(text, text, text, text, text, text, uuid, text) to authenticated, service_role;

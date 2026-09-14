-- ═════════════════════════════════════════════════════════════════════════════
-- 053 · Un perfil «Compro y vendo» también puede VENDER
-- ═════════════════════════════════════════════════════════════════════════════
--
-- ── El bug ──────────────────────────────────────────────────────────────────
--
-- Desde la 026, el owner que nacía con el alta de una organización recibía sus
-- capacidades así:
--
--   v_can_buy  := p_commercial_profile in ('buyer', 'buyer_seller');   ← bien
--   v_can_sell := p_commercial_profile = 'seller';                     ← MAL
--
-- Un registro «Compro y vendo» (`buyer_seller`) quedaba con Comprar ✓ y
-- Vender ✗: la mitad de lo que pidió. `can_buy` siempre estuvo bien; el fallo
-- era solo la segunda línea, que olvidó `buyer_seller`.
--
-- Detectado al auditar la 052 y confirmado contra la función desplegada. La
-- regla de producto correcta, fijada también en tests:
--
--   buyer        → comprar ✓ · vender ✗
--   seller       → comprar ✗ · vender ✓
--   buyer_seller → comprar ✓ · vender ✓
--
-- ── Alcance ─────────────────────────────────────────────────────────────────
--
-- UNA línea funcional. El resto del cuerpo es idéntico al de la 052 —candado
-- de concurrencia incluido—, y los permisos se re-declaran como siempre. Las
-- memberships ya creadas con el valor erróneo no se retocan aquí: corregir
-- datos históricos es una decisión aparte y el panel de administración ya
-- permite ajustarlas una a una.

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

  -- 052 — serializa las altas CONCURRENTES del mismo propietario.
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

  -- 053 — la única línea que cambia: `buyer_seller` también vende.
  v_can_buy  := p_commercial_profile in ('buyer', 'buyer_seller');
  v_can_sell := p_commercial_profile in ('seller', 'buyer_seller');

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
  '053 — alta de organización con propietario único, idempotente y serializada '
  '(advisory lock por propietario, 052). Capacidades del owner según el perfil '
  'comercial: buyer compra, seller vende, buyer_seller compra Y vende — la 026 '
  'dejaba a buyer_seller sin can_sell.';

-- Los permisos se vuelven a declarar, como siempre: la lección de la 029.
revoke execute on function public.create_organization_with_owner(text, text, text, text, text, text, uuid, text) from public, anon;
grant  execute on function public.create_organization_with_owner(text, text, text, text, text, text, uuid, text) to authenticated, service_role;

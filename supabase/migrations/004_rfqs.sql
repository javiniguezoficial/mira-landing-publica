-- ─────────────────────────────────────────────────────────────────────────────
-- 004_rfqs
-- Solicitudes de cotización (RFQ) — fase 1
-- Sin proveedores, sin respuestas, sin emails, sin IA, sin Stripe
-- ─────────────────────────────────────────────────────────────────────────────

create table public.rfqs (
  id               uuid        primary key default gen_random_uuid(),
  organization_id  uuid        not null references public.organizations(id) on delete cascade,
  created_by       uuid        not null references public.profiles(id),
  product_id       uuid        not null references public.products(id),

  quantity         numeric     not null check (quantity > 0),
  unit             text        not null,
  deadline         date        not null,
  country          text        not null default 'ES',
  region           text,
  notes            text,
  conditions       text,

  status           text        not null default 'draft'
                   check (status in ('draft','open','closed','awarded','cancelled')),

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ── Índices ───────────────────────────────────────────────────────────────────
create index rfqs_organization_id_idx on public.rfqs(organization_id);
create index rfqs_status_idx          on public.rfqs(status);
create index rfqs_created_by_idx      on public.rfqs(created_by);
create index rfqs_product_id_idx      on public.rfqs(product_id);
create index rfqs_deadline_idx        on public.rfqs(deadline);
create index rfqs_org_status_idx      on public.rfqs(organization_id, status);
create index rfqs_org_created_idx     on public.rfqs(organization_id, created_at desc);

-- ── Trigger updated_at ────────────────────────────────────────────────────────
create trigger rfqs_updated_at
  before update on public.rfqs
  for each row execute function public.set_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────────
alter table public.rfqs enable row level security;

-- Admin: acceso total usando función existente
create policy "admin_select_rfqs" on public.rfqs
  for select
  using (is_platform_admin());

create policy "admin_insert_rfqs" on public.rfqs
  for insert
  with check (is_platform_admin());

create policy "admin_update_rfqs" on public.rfqs
  for update
  using  (is_platform_admin())
  with check (is_platform_admin());

-- Cliente — SELECT: usa is_org_member()
create policy "org_member_select_rfqs" on public.rfqs
  for select
  using (is_org_member(rfqs.organization_id));

-- Cliente — INSERT: debe ser el creador, pertenecer a la org,
--   y el producto/mercado/categoría deben estar activos
create policy "org_member_insert_rfqs" on public.rfqs
  for insert
  with check (
    created_by = auth.uid()
    and is_org_member(rfqs.organization_id)
    and exists (
      select 1
        from public.products      p
        join public.markets       m  on m.id  = p.market_id
        join public.market_categories mc on mc.id = m.category_id
       where p.id        = rfqs.product_id
         and p.is_active = true
         and m.is_active = true
         and mc.is_active = true
    )
  );

-- Cliente — UPDATE: solo el creador, solo si está en draft
--   Transición draft→open la controla publishRfq() en Server Action
create policy "org_member_update_draft_rfqs" on public.rfqs
  for update
  using (
    created_by = auth.uid()
    and status = 'draft'
    and is_org_member(rfqs.organization_id)
  )
  with check (
    created_by = auth.uid()
    and status in ('draft', 'open', 'cancelled')
    and is_org_member(rfqs.organization_id)
  );

-- Sin policy DELETE para clientes

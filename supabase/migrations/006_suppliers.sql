-- ─────────────────────────────────────────────────────────────────────────────
-- 006_suppliers
-- Catálogo de proveedores — fase MVP (sin portal, sin emails, sin mapa)
-- ─────────────────────────────────────────────────────────────────────────────

create table public.suppliers (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null,
  email       text,
  phone       text,
  website     text,
  tax_id      text,
  country     text        not null default 'ES',
  region      text,
  city        text,
  address     text,
  latitude    numeric,
  longitude   numeric,
  category    text,
  notes       text,
  is_active   boolean     not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ── Índices ───────────────────────────────────────────────────────────────────
create index suppliers_name_idx      on public.suppliers(name);
create index suppliers_country_idx   on public.suppliers(country);
create index suppliers_is_active_idx on public.suppliers(is_active);
create index suppliers_category_idx  on public.suppliers(category);
-- Preparación geolocalización futura
create index suppliers_region_idx    on public.suppliers(region);
create index suppliers_city_idx      on public.suppliers(city);

-- ── Trigger updated_at ────────────────────────────────────────────────────────
create trigger suppliers_updated_at
  before update on public.suppliers
  for each row execute function public.set_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────────
alter table public.suppliers enable row level security;

-- Admin: acceso total
create policy "admin_all_suppliers" on public.suppliers
  for all
  using (is_platform_admin())
  with check (is_platform_admin());

-- Cliente: solo lectura de proveedores activos (requiere sesión autenticada)
create policy "client_select_active_suppliers" on public.suppliers
  for select
  using (auth.uid() is not null and is_active = true);

-- ── Enlace opcional desde rfq_responses ──────────────────────────────────────
-- El snapshot (supplier_name/email/phone) se sigue guardando siempre.
-- supplier_id es solo un enlace al catálogo en el momento de crear la respuesta.
alter table public.rfq_responses
  add column supplier_id uuid references public.suppliers(id) on delete set null;

create index rfq_responses_supplier_id_idx on public.rfq_responses(supplier_id);

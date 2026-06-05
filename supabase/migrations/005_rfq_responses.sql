-- ─────────────────────────────────────────────────────────────────────────────
-- 005_rfq_responses
-- Respuestas manuales a RFQs — fase MVP (sin portal proveedor, sin emails, sin IA)
-- ─────────────────────────────────────────────────────────────────────────────

create table public.rfq_responses (
  id               uuid        primary key default gen_random_uuid(),
  rfq_id           uuid        not null references public.rfqs(id) on delete cascade,

  supplier_name    text        not null,
  supplier_email   text,
  supplier_phone   text,

  price            numeric     not null check (price > 0),
  unit             text        not null,
  currency         text        not null default 'EUR',

  delivery_date    date,
  payment_terms    text,
  notes            text,

  status           text        not null default 'received'
                   check (status in ('received','shortlisted','rejected','accepted')),

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ── Índices ───────────────────────────────────────────────────────────────────
create index rfq_responses_rfq_id_idx     on public.rfq_responses(rfq_id);
create index rfq_responses_status_idx     on public.rfq_responses(status);
-- Para ordenar/comparar respuestas por precio dentro de una RFQ
create index rfq_responses_rfq_price_idx  on public.rfq_responses(rfq_id, price);
-- Solo puede haber una respuesta 'accepted' por RFQ
create unique index rfq_responses_one_accepted_per_rfq_idx
  on public.rfq_responses(rfq_id)
  where status = 'accepted';

-- ── Trigger updated_at ────────────────────────────────────────────────────────
create trigger rfq_responses_updated_at
  before update on public.rfq_responses
  for each row execute function public.set_updated_at();

-- ── RLS ───────────────────────────────────────────────────────────────────────
alter table public.rfq_responses enable row level security;

-- Admin: acceso total
create policy "admin_all_rfq_responses" on public.rfq_responses
  for all
  using (is_platform_admin())
  with check (is_platform_admin());

-- Cliente: solo lectura de respuestas de sus propias RFQs
create policy "org_member_select_rfq_responses" on public.rfq_responses
  for select
  using (
    exists (
      select 1 from public.rfqs r
       where r.id = rfq_responses.rfq_id
         and is_org_member(r.organization_id)
    )
  );

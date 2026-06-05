-- 007_news.sql
-- Tabla de noticias: admin crea/edita, clientes leen solo publicadas

create table public.news (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  slug          text unique not null,
  excerpt       text,
  content       text not null,
  status        text not null default 'draft'
                  check (status in ('draft', 'published', 'archived')),
  category      text,
  market_id     uuid references public.markets(id) on delete set null,
  product_id    uuid references public.products(id) on delete set null,
  image_url     text,
  published_at  timestamptz,
  created_by    uuid references public.profiles(id) on delete set null,
  created_at    timestamptz default now() not null,
  updated_at    timestamptz default now() not null
);

-- Índices
create index news_status_idx        on public.news (status);
create index news_published_at_idx  on public.news (published_at desc);
create index news_slug_idx          on public.news (slug);
create index news_market_id_idx     on public.news (market_id);
create index news_product_id_idx    on public.news (product_id);
create index news_category_idx      on public.news (category);

-- updated_at automático (reutiliza la función ya existente)
create trigger set_news_updated_at
  before update on public.news
  for each row execute function public.set_updated_at();

-- RLS
alter table public.news enable row level security;

-- Admins: control total
create policy "admin_all_news" on public.news
  for all
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

-- Clientes autenticados: solo noticias explícitamente publicadas con fecha
create policy "client_read_published_news" on public.news
  for select
  using (
    auth.uid() is not null
    and status = 'published'
    and published_at is not null
    and published_at <= now()
  );

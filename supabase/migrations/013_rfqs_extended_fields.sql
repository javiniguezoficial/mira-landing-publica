-- ─────────────────────────────────────────────────────────────────────────────
-- 013_rfqs_extended_fields
-- FASE B1 — RFQ ampliada dentro del modelo actual.
--
-- Migración ADITIVA. Añade campos extendidos a public.rfqs, habilita RFQs de
-- tipo SERVICIO (product_id pasa a nullable) y condiciones personalizadas
-- (JSONB). Las filas existentes quedan como rfq_kind='product' con product_id
-- informado, por lo que siguen siendo válidas sin cambios.
--
-- TOCA UNA ÚNICA POLICY: `org_member_insert_rfqs` (INSERT de cliente). Es
-- estrictamente necesaria porque la versión actual exige SIEMPRE un producto
-- activo y bloquearía las RFQs de servicio (product_id NULL). No se modifica
-- NINGUNA otra policy (SELECT, UPDATE, ni las de admin), ni roles, ni auth,
-- ni visibilidad cross-org, ni comprador/vendedor.
--
-- Campos NO obligatorios a nivel BD (se validan como obligatorios en la Server
-- Action porque ya existen filas y no admiten DEFAULT con sentido):
--   opening_date, award_date, supply_start_date, unit_format, lead_time.
-- `sale_currency` sí es NOT NULL con DEFAULT 'EUR' (las filas existentes se
-- rellenan con 'EUR' de forma segura).
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Campos legacy a nullable.
--    · product_id  → necesario para rfq_kind='service'.
--    · quantity/unit → ya no son obligatorios (el cliente usa estimated_volume
--      como "volumen estimado" opcional y unit_format como "formato unitario"
--      obligatorio). Se conservan como legacy/compatibilidad y NO deben bloquear
--      nuevas RFQs. Las filas existentes mantienen sus valores.
alter table public.rfqs
  alter column product_id drop not null,
  alter column quantity   drop not null,
  alter column unit       drop not null;

-- 2. Columnas nuevas
alter table public.rfqs
  add column rfq_kind              text  not null default 'product'
                                    check (rfq_kind in ('product','service')),
  add column service_name          text,
  add column service_description   text,
  add column opening_date          date,
  add column award_date            date,
  add column supply_start_date     date,
  add column estimated_volume      numeric,
  add column purchase_frequency    text,
  add column delivery_location     text,
  add column incoterm              text,
  add column target_price          numeric,
  add column certifications        text[],
  add column sustainability_policy text,
  add column unit_format           text,
  add column criticality           text
                                    check (criticality is null or criticality in ('alto','medio','bajo')),
  add column lead_time             text,
  add column min_order             numeric,
  add column sale_currency         text  not null default 'EUR',
  add column internal_code         text,
  add column payment_method        text,
  add column technical_sheet_url   text,
  add column technical_sheet_notes text,
  add column custom_conditions     jsonb not null default '[]'::jsonb;

-- 3. Integridad producto/servicio a nivel de datos (defensa en profundidad).
--    product → product_id obligatorio · service → service_name obligatorio.
alter table public.rfqs
  add constraint rfqs_kind_target_check check (
    (rfq_kind = 'product' and product_id is not null)
    or (rfq_kind = 'service' and service_name is not null)
  );

-- 4. Ajuste MÍNIMO de la policy de INSERT de cliente.
--    Antes: exigía SIEMPRE un producto activo vía EXISTS → bloqueaba servicios.
--    Ahora: ramifica por tipo de RFQ.
--      · product → mismo check de producto activo que antes.
--      · service → product_id NULL + service_name no vacío.
--    No cambia SELECT/UPDATE de cliente ni ninguna policy de admin.
drop policy if exists "org_member_insert_rfqs" on public.rfqs;

create policy "org_member_insert_rfqs" on public.rfqs
  for insert
  with check (
    created_by = auth.uid()
    and is_org_member(rfqs.organization_id)
    and (
      (
        rfq_kind = 'product'
        and product_id is not null
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
      )
      or
      (
        rfq_kind = 'service'
        and product_id is null
        and service_name is not null
        and length(btrim(service_name)) > 0
      )
    )
  );

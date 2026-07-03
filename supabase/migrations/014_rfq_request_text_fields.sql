-- ─────────────────────────────────────────────────────────────────────────────
-- 014_rfq_request_text_fields
-- FASE B1.1 — RFQ producto/servicio como texto libre, no vinculado a Pricing.
--
-- Migración ADITIVA. Añade `request_name`/`request_description`, genéricos para
-- producto y servicio, y los convierte en el único requisito real de la RFQ.
-- `product_id` y `service_name`/`service_description` quedan como
-- legacy/compatibilidad: siguen existiendo y pueden informarse, pero NUNCA son
-- obligatorios ni se validan contra el catálogo de Pricing.
--
-- Pasos:
--   1. Añadir columnas request_name / request_description.
--   2. Backfill de filas existentes: request_name se rellena desde
--      service_name, o desde el nombre del producto enlazado (si lo hay), o
--      con un valor de reserva — nunca se deja NULL una fila ya existente.
--   3. Sustituir el constraint `rfqs_kind_target_check` (que exigía
--      product_id/service_name según rfq_kind) por `rfqs_request_name_check`,
--      que solo exige rfq_kind válido + request_name no vacío.
--   4. Simplificar la policy `org_member_insert_rfqs`: ya no valida producto
--      activo contra Pricing ni exige service_name — solo exige request_name.
--      Es la ÚNICA policy que se toca. No se modifica ninguna otra.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Columnas nuevas
alter table public.rfqs
  add column request_name        text,
  add column request_description text;

-- 2. Backfill — ninguna fila existente debe quedar con request_name NULL.
update public.rfqs r
set request_name = coalesce(
      nullif(btrim(r.service_name), ''),
      (select p.name from public.products p where p.id = r.product_id),
      'RFQ sin nombre'
    ),
    request_description = nullif(btrim(r.service_description), '')
where r.request_name is null;

-- 3. Sustituir el constraint de integridad producto/servicio.
alter table public.rfqs
  drop constraint if exists rfqs_kind_target_check;

alter table public.rfqs
  add constraint rfqs_request_name_check check (
    rfq_kind in ('product', 'service')
    and request_name is not null
    and length(btrim(request_name)) > 0
  );

-- 4. Policy de INSERT de cliente — simplificada.
--    Antes: exigía product_id + producto activo (product) o service_name (service).
--    Ahora: exige únicamente rfq_kind válido + request_name no vacío.
--    product_id/service_name, si vienen informados por compatibilidad, no se
--    validan y no bloquean el insert.
drop policy if exists "org_member_insert_rfqs" on public.rfqs;

create policy "org_member_insert_rfqs" on public.rfqs
  for insert
  with check (
    created_by = auth.uid()
    and is_org_member(rfqs.organization_id)
    and rfq_kind in ('product', 'service')
    and request_name is not null
    and length(btrim(request_name)) > 0
  );

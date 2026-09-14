-- ═════════════════════════════════════════════════════════════════════════════
-- 051 · Eliminar una cuenta deja de destruir o bloquear el histórico
-- ═════════════════════════════════════════════════════════════════════════════
--
-- ── La regla de producto que implementa ─────────────────────────────────────
--
-- Cuando un administrador de plataforma elimina un usuario, la IDENTIDAD debe
-- desaparecer de verdad —`auth.users`, `auth.identities`, `profiles`— y su
-- correo debe quedar libre para un alta futura. El HISTÓRICO de negocio no
-- debe ni destruirse ni impedir el borrado: se conserva desvinculado.
--
-- Hasta ahora el esquema resolvía esto en nueve tablas históricas con
-- `on delete set null` (noticias, importaciones, borrados de precios, lotes de
-- proveedores, suscripciones, aprobaciones de plan, mercados deshabilitados,
-- invitaciones y mensajes de soporte). Quedaban DOS excepciones, y las dos
-- estaban mal para la regla nueva:
--
--   support_tickets.user_id   CASCADE    → borrar la cuenta DESTRUÍA la
--                                          conversación entera de soporte
--   rfqs.created_by           NO ACTION  → la base RECHAZABA el borrado
--              + NOT NULL                  con un error de clave ajena
--
-- La aplicación tapaba ambas con bloqueos («tiene tickets», «tiene
-- cotizaciones») que impedían liberar el correo. Esta migración las alinea con
-- el resto del esquema y esos bloqueos desaparecen del código en este mismo
-- bloque.
--
-- ── Por qué SET NULL y no otra estrategia ───────────────────────────────────
--
--   · Es el patrón que ya usan las otras NUEVE columnas históricas: una sola
--     semántica en todo el esquema («NULL = la cuenta ya no existe»).
--   · La RLS degrada sola: `auth.uid() = user_id` y `created_by = auth.uid()`
--     jamás igualan NULL, así que nadie hereda acceso a filas huérfanas; los
--     miembros de la organización y los administradores las siguen viendo por
--     sus propias condiciones, que no dependen del autor.
--   · La interfaz ya tolera el caso: los embeds de perfil son LEFT y los
--     nombres se pintan con `?? null` (los mensajes de soporte llevan
--     `author_id SET NULL` desde la 043 y se muestran sin autor).
--   · La identidad de quién fue no se pierde: la entrada `user.deleted` de
--     `admin_audit_log` —tabla sin FK a propósito, 039— guarda desde este
--     bloque el correo, el nombre y el recuento de filas desvinculadas.
--
-- ── Qué sigue igual ─────────────────────────────────────────────────────────
--
-- `organization_members` y `user_market_favorites` siguen en CASCADE: son dato
-- de cuenta, no histórico. Los bloqueos legítimos (propietario de organización,
-- último administrador activo, uno mismo) siguen en la aplicación Y donde ya
-- estaban en la base. Ninguna policy cambia.

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. support_tickets.user_id · CASCADE → SET NULL
-- ═════════════════════════════════════════════════════════════════════════════

alter table public.support_tickets
  alter column user_id drop not null;

alter table public.support_tickets
  drop constraint support_tickets_user_id_fkey;

alter table public.support_tickets
  add constraint support_tickets_user_id_fkey
  foreign key (user_id) references public.profiles(id) on delete set null;

comment on column public.support_tickets.user_id is
  'Quien abrió el ticket. NULL desde la 051 cuando esa cuenta fue eliminada: '
  'la conversación se conserva como histórico, desvinculada. La identidad del '
  'solicitante eliminado queda en la entrada user.deleted de admin_audit_log.';

-- ═════════════════════════════════════════════════════════════════════════════
-- 2. rfqs.created_by · NO ACTION NOT NULL → SET NULL nullable
-- ═════════════════════════════════════════════════════════════════════════════

alter table public.rfqs
  alter column created_by drop not null;

alter table public.rfqs
  drop constraint rfqs_created_by_fkey;

alter table public.rfqs
  add constraint rfqs_created_by_fkey
  foreign key (created_by) references public.profiles(id) on delete set null;

comment on column public.rfqs.created_by is
  'Quien creó la cotización. NULL desde la 051 cuando esa cuenta fue '
  'eliminada: el RFQ es trazabilidad comercial y se conserva siempre; la '
  'organización sigue en organization_id y la policy de edición cae a '
  'is_org_admin cuando el creador ya no existe. La identidad del creador '
  'eliminado queda en la entrada user.deleted de admin_audit_log.';

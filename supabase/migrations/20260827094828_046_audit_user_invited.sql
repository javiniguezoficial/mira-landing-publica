-- 046 — La auditoría admite el alta administrativa de usuarios
--
-- ═════════════════════════════════════════════════════════════════════════════
-- POR QUÉ
-- ═════════════════════════════════════════════════════════════════════════════
--
-- `admin_audit_log.action` es una lista CERRADA (039). Es una buena decisión: un
-- registro de auditoría con la acción escrita a mano deja de ser consultable en
-- cuanto alguien pone un nombre distinto para lo mismo.
--
-- El alta administrativa de usuarios es un evento NUEVO y distinto de todos los
-- que había. `membership.created` describe «se asignó una cuenta existente a una
-- organización»; esto es «se creó una cuenta que no existía y se le envió una
-- invitación». Reutilizar el nombre antiguo haría imposible responder después a
-- «¿qué cuentas hemos dado de alta nosotros?».
--
-- ═════════════════════════════════════════════════════════════════════════════
-- QUÉ HACE, EXACTAMENTE
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Añade UN valor a la lista permitida. No borra ninguno, no toca ninguna fila,
-- no cambia el tipo de la columna y no altera ninguna policy.
--
-- La restricción se recrea entera porque PostgreSQL no permite ampliar un CHECK
-- existente. Al volver a crearla, valida las filas que ya hay: todas usan uno de
-- los ocho valores anteriores, así que la validación pasa sin tocar nada.
--
-- El evento se registra sin correo ni teléfono: solo quién lo hizo, sobre quién,
-- en qué organización y con qué permisos. La dirección ya está en `auth.users`
-- y repetirla aquí sería copiar un dato personal a una tabla que se conserva
-- indefinidamente.

alter table public.admin_audit_log
  drop constraint if exists admin_audit_log_action_check;

alter table public.admin_audit_log
  add constraint admin_audit_log_action_check check (action in (
    'membership.created',
    'membership.role_changed',
    'membership.status_changed',
    'membership.capabilities_changed',
    'membership.removed',
    'profile.updated',
    'profile.platform_role_changed',
    'profile.status_changed',
    -- 046 — alta administrativa: cuenta creada e invitada desde el panel.
    'user.invited'
  ));

comment on column public.admin_audit_log.action is
  'Qué se hizo. Lista cerrada; ampliada en 046 con `user.invited` para el alta '
  'administrativa de usuarios, que no es lo mismo que asignar una cuenta ya '
  'existente a una organización.';

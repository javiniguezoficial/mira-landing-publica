-- 047 — La auditoría admite la eliminación definitiva de una cuenta
--
-- ═════════════════════════════════════════════════════════════════════════════
-- POR QUÉ SOLO UNA ACCIÓN NUEVA, Y NO TRES
-- ═════════════════════════════════════════════════════════════════════════════
--
-- El ciclo de vida que se está completando tiene tres operaciones —suspender,
-- reactivar y eliminar— pero solo UNA necesita nombre nuevo.
--
-- Suspender y reactivar YA se registran, y bien: `setUserProfileStatus` escribe
-- `profile.status_changed` con `before` y `after`, así que el registro dice
-- exactamente de qué estado a cuál se pasó. Añadir `user.suspended` y
-- `user.reactivated` partiría en tres el rastro de una misma cosa —el estado
-- del perfil— y obligaría a consultar tres nombres para reconstruirla.
--
-- Eliminar sí es distinto: no es un cambio de estado, es la desaparición de la
-- cuenta. Y es la única de las tres que no se puede deshacer.
--
-- ═════════════════════════════════════════════════════════════════════════════
-- POR QUÉ EL REGISTRO SOBREVIVE A LA CUENTA
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Porque `admin_audit_log` NO tiene claves foráneas, y eso fue deliberado desde
-- la 039: con una FK a `profiles`, borrar una cuenta arrastraría en cascada
-- justo las filas que explican qué se hizo con ella. `actor_id` y
-- `target_user_id` son uuid sueltos.
--
-- Consecuencia buscada: después de eliminar a alguien, el registro sigue
-- diciendo quién lo hizo, cuándo y sobre qué identificador. Esta migración no
-- necesita tocar nada de eso — solo abrir la lista de acciones.
--
-- ═════════════════════════════════════════════════════════════════════════════
-- QUÉ HACE
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Añade UN valor a la lista permitida. No borra ninguno, no toca ninguna fila y
-- no cambia el tipo de la columna. La restricción se recrea entera porque
-- PostgreSQL no permite ampliar un CHECK existente; al recrearla valida lo que
-- ya hay, y todo usa uno de los nueve valores anteriores.

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
    -- Cubre suspender Y reactivar: lleva `before` y `after` con el estado.
    'profile.status_changed',
    'user.invited',
    -- 047 — la cuenta se ha eliminado definitivamente.
    'user.deleted'
  ));

comment on column public.admin_audit_log.action is
  'Qué se hizo. Lista cerrada; ampliada en 046 (`user.invited`) y en 047 '
  '(`user.deleted`). Suspender y reactivar NO tienen acción propia: los cubre '
  '`profile.status_changed`, que ya guarda el estado anterior y el nuevo.';

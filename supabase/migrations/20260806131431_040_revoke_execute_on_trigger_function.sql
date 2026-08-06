-- 040 — El trigger del último administrador no es una RPC
--
-- ═════════════════════════════════════════════════════════════════════════════
-- QUÉ SE CORRIGE
-- ═════════════════════════════════════════════════════════════════════════════
--
-- La 039 creó `protect_last_platform_admin()` y revocó su ejecución de `public`
-- y de `anon`, siguiendo la lección de 029. No bastaba: el esquema tiene un
-- `alter default privileges … grant execute on functions to authenticated`, así
-- que la función quedó expuesta en `/rest/v1/rpc/protect_last_platform_admin`
-- para cualquier sesión iniciada.
--
-- Medido después de aplicar 039:
--
--   enforce_membership_rules            authenticated = false
--   prevent_privileged_profile_change   authenticated = false
--   protect_organization_columns        authenticated = false
--   handle_ticket_resolved_at           authenticated = false
--   set_updated_at                      authenticated = false
--   protect_last_platform_admin         authenticated = TRUE   ← la única
--
-- ── Alcance real del problema ───────────────────────────────────────────────
--
-- No es explotable: una función de trigger llamada como RPC falla con
-- «trigger functions can only be called as triggers» (0A000) antes de ejecutar
-- nada, porque su cuerpo referencia `old` y `new`. No lee, no escribe y no
-- filtra nada.
--
-- Se corrige igualmente por dos razones:
--
--   1. una función marcada `security definer` y publicada en la API es
--      exactamente lo que un repaso de seguridad debe encontrar en cero, no en
--      «uno, pero inofensivo»;
--   2. las otras cinco funciones de trigger del esquema NO están expuestas, y
--      una excepción sin motivo es la clase de detalle que dentro de un año
--      nadie sabe si fue deliberada.
--
-- ── Por qué una migración nueva y no editar la 039 ─────────────────────────
--
-- La 039 ya está aplicada. La forma correcta de cambiar algo desplegado es una
-- migración nueva, igual que 036 hizo con 035 y 038 con 037.
--
-- Esta migración no toca datos, ni tablas, ni policies, ni el cuerpo de la
-- función: solo retira un permiso.

revoke all on function public.protect_last_platform_admin() from authenticated;

-- Se repiten los dos revokes de 039 por ser idempotentes y baratos, y para que
-- el estado deseado quede escrito entero en un solo sitio.
revoke all on function public.protect_last_platform_admin() from public;
revoke all on function public.protect_last_platform_admin() from anon;

comment on function public.protect_last_platform_admin() is
  'Fase 039/040 — invariante: siempre queda al menos un platform_admin activo. '
  'Es una función de TRIGGER: no se ejecuta por RPC y nadie tiene EXECUTE sobre '
  'ella. El trigger la invoca con los privilegios del propietario del esquema.';

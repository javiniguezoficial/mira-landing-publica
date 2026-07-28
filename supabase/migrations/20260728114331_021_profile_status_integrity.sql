-- 021 — Integridad de rol y estado en `profiles`
--
-- ─────────────────────────────────────────────────────────────────────────────
-- DEFECTO QUE CORRIGE (crítico, explotable en producción)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- La policy `profiles_own_update` permite a cualquier usuario actualizar SU
-- propia fila sin restricción de columnas:
--
--   USING (id = auth.uid())  WITH CHECK (id = auth.uid())
--
-- La única protección era el trigger `profiles_prevent_role_change`, que
-- ejecuta `prevent_role_change()`. Esa función contiene:
--
--   if current_role in ('postgres', 'service_role') then
--     return new;
--   end if;
--
-- `prevent_role_change()` es SECURITY DEFINER y su propietario es `postgres`.
-- Dentro de una función SECURITY DEFINER, `current_role` devuelve SIEMPRE el
-- propietario de la función — nunca el rol de quien ejecuta. Comprobado:
--
--   current_role = 'postgres'   (invocada por un usuario `authenticated`)
--
-- Es decir: la condición se cumplía siempre y el trigger devolvía `new` sin
-- comprobar nada. NO protegía el rol.
--
-- Verificado empíricamente (transacción revertida con ROLLBACK): una usuaria
-- con rol `user` ejecutó
--
--   update public.profiles set role = 'platform_admin' where id = auth.uid();
--
-- con éxito, y `is_platform_admin()` pasó a devolver `true`. El mismo vector
-- sirve para `status`, que además no estaba contemplado en el trigger.
--
-- Explotable desde el navegador con la clave anónima pública y una sesión
-- legítima, mediante `PATCH /rest/v1/profiles?id=eq.<uuid>`. Concede acceso de
-- administrador de plataforma sobre los datos de TODOS los clientes.
--
-- ─────────────────────────────────────────────────────────────────────────────
-- SOLUCIÓN
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Se sustituye el trigger por `prevent_privileged_profile_change()`, que:
--
--   · protege `role` Y `status`;
--   · deja libres los demás campos (nombre, teléfono, avatar, preferencias);
--   · NO usa `current_role`, que es inservible dentro de SECURITY DEFINER;
--   · decide con `auth.uid()` / `auth.role()`, que sí reflejan al usuario real;
--   · es fail-closed: ante la duda, deniega.
--
-- No se toca la policy `profiles_own_update` (las policies se abordan en 6B.3),
-- ni el CHECK de `role`, ni el default de `status`, ni `handle_new_user()`.
-- El default de `profiles.status` sigue siendo 'active' hasta 6C.

-- ── Función ─────────────────────────────────────────────────────────────────

create or replace function public.prevent_privileged_profile_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_jwt_role text := auth.role();
begin
  -- Sin cambio privilegiado no hay nada que comprobar. `is not distinct from`
  -- trata NULL como un valor más, así que un NULL no se cuela como "sin cambio".
  if old.role is not distinct from new.role
     and old.status is not distinct from new.status then
    return new;
  end if;

  -- Conexión SQL directa: migraciones, mantenimiento, psql. No hay contexto de
  -- PostgREST, así que no hay usuario al que responsabilizar. Quien tiene
  -- conexión directa es superusuario o dueño del esquema y puede alterar este
  -- mismo trigger; bloquear aquí no añadiría seguridad y rompería las
  -- migraciones futuras que necesiten normalizar roles o estados.
  if v_uid is null and coalesce(v_jwt_role, '') = '' then
    return new;
  end if;

  -- `service_role` ignora RLS por definición y solo vive en el servidor.
  -- Se comprueba por el claim del JWT, no por `current_role`.
  if v_jwt_role = 'service_role' then
    return new;
  end if;

  -- Queda un usuario real detrás de la petición: solo un administrador de
  -- plataforma puede tocar rol o estado. Tras la migración 022,
  -- `is_platform_admin()` exige además que el propio administrador esté
  -- `active`, de modo que un administrador suspendido no puede reactivarse.
  if public.is_platform_admin() then
    return new;
  end if;

  raise exception
    'Solo un administrador de plataforma puede cambiar el rol o el estado de un perfil.'
    using errcode = '42501';
end;
$$;

comment on function public.prevent_privileged_profile_change() is
  'Impide que un usuario modifique profiles.role o profiles.status. Sustituye a prevent_role_change(), que no protegía nada por usar current_role dentro de SECURITY DEFINER.';

-- No debe ser invocable por RPC: es una función de trigger. Los triggers se
-- disparan con los privilegios del propietario y NO requieren EXECUTE del
-- usuario que provoca la escritura, así que revocar aquí no los afecta.
revoke execute on function public.prevent_privileged_profile_change() from public;
revoke execute on function public.prevent_privileged_profile_change() from anon;
revoke execute on function public.prevent_privileged_profile_change() from authenticated;

-- ── Trigger ─────────────────────────────────────────────────────────────────

drop trigger if exists profiles_prevent_role_change on public.profiles;

create trigger profiles_prevent_privileged_change
  before update on public.profiles
  for each row
  execute function public.prevent_privileged_profile_change();

-- `prevent_role_change()` se conserva SIN trigger asociado para que el
-- rollback sea inmediato. Se eliminará en un bloque posterior, una vez esta
-- migración lleve tiempo estable en producción.

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Restaura exactamente el estado anterior a esta migración. NO se aplica aquí;
-- queda documentado para poder ejecutarlo si hiciera falta.
--
--   drop trigger if exists profiles_prevent_privileged_change on public.profiles;
--
--   create trigger profiles_prevent_role_change
--     before update on public.profiles
--     for each row
--     execute function public.prevent_role_change();
--
--   drop function if exists public.prevent_privileged_profile_change();
--
-- Definición exacta de `prevent_role_change()` tal y como está hoy, por si
-- hubiera que recrearla:
--
--   CREATE OR REPLACE FUNCTION public.prevent_role_change()
--    RETURNS trigger
--    LANGUAGE plpgsql
--    SECURITY DEFINER
--    SET search_path TO 'public'
--   AS $function$
--   begin
--     if old.role = new.role then
--       return new;
--     end if;
--     if current_role in ('postgres', 'service_role') then
--       return new;
--     end if;
--     if not public.is_platform_admin() then
--       raise exception 'Solo platform_admin puede cambiar el role de un usuario.';
--     end if;
--     return new;
--   end;
--   $function$
--
-- ADVERTENCIA: revertir reabre el agujero descrito arriba.

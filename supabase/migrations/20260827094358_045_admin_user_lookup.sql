-- 045 — Buscar UNA cuenta por correo, desde administración
--
-- ═════════════════════════════════════════════════════════════════════════════
-- POR QUÉ HACE FALTA
-- ═════════════════════════════════════════════════════════════════════════════
--
-- El alta administrativa de usuarios tiene que responder, ANTES de invitar a
-- nadie, a una pregunta que hoy no se puede hacer:
--
--   «¿existe ya una cuenta con este correo?»
--
-- El correo vive en `auth.users`. Ese esquema NO está expuesto por PostgREST, y
-- `profiles` no guarda la dirección. Sin esta función, la única alternativa
-- sería listar cuentas con el cliente privilegiado y buscar dentro — es decir,
-- ENUMERAR usuarios, que es justo lo que no se quiere hacer.
--
-- Invitar primero y leer el error tampoco vale: el orden que se pide es
-- comprobar la duplicidad ANTES de crear nada, y además el error de Supabase
-- no dice si esa persona ya pertenece a la organización elegida.
--
-- ═════════════════════════════════════════════════════════════════════════════
-- POR QUÉ ESTO NO ES UNA VÍA DE ENUMERACIÓN
-- ═════════════════════════════════════════════════════════════════════════════
--
--   · exige `is_platform_admin()` DENTRO de la función, con independencia del
--     parámetro. Para cualquier otro rol devuelve cero filas sin mirar nada;
--   · acepta UN correo COMPLETO y compara por igualdad. No admite patrones, ni
--     prefijos, ni comodines, ni listas: no se puede barrer el padrón;
--   · devuelve solo el identificador y el nombre. Ni el correo —que ya lo tenía
--     quien pregunta—, ni contraseñas, ni metadatos, ni tokens, ni fechas de
--     sesión;
--   · quien puede ejecutarla ya ve la lista completa de usuarios en el panel
--     (`listAdminUsers`). No concede ningún acceso que no tuviera.
--
-- El correo se compara en minúsculas y sin espacios: `Ana@Empresa.com` y
-- `ana@empresa.com ` son la misma cuenta, y crear una segunda sería un
-- duplicado que nadie podría distinguir después.

create or replace function public.admin_find_user_by_email(p_email text)
returns table (
  user_id      uuid,
  first_name   text,
  last_name    text,
  profile_role text,
  status       text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  -- Fail-closed y en este orden: primero el rol, después el dato.
  if not public.is_platform_admin() then
    return;
  end if;

  if v_email = '' then
    return;
  end if;

  return query
    select p.id, p.first_name, p.last_name, p.role, p.status
      from auth.users u
      join public.profiles p on p.id = u.id
     where lower(btrim(u.email)) = v_email
     limit 1;
end;
$$;

comment on function public.admin_find_user_by_email(text) is
  '045 — ¿existe una cuenta con este correo? Solo para platform_admin: la '
  'comprobación de rol es interna y no depende del parámetro. Igualdad exacta '
  'sobre el correo completo, en minúsculas; no admite patrones. Devuelve el '
  'identificador y el nombre, nunca credenciales ni metadatos.';

revoke all on function public.admin_find_user_by_email(text) from public, anon;
grant execute on function public.admin_find_user_by_email(text) to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- Lo que esta migración NO hace
-- ─────────────────────────────────────────────────────────────────────────────
--
-- NO crea ningún índice sobre `auth.users`, aunque la búsqueda use
-- `lower(btrim(email))` y un índice de expresión la aceleraría.
--
-- Dos motivos, y el segundo basta por sí solo:
--
--   · `auth.users` tiene hoy 7 filas. Recorrerlas cuesta menos que decidir si
--     usar un índice;
--   · es una tabla del esquema `auth`, que gestiona Supabase. Añadirle objetos
--     propios crea una dependencia con algo que ellos actualizan por su cuenta.
--     No se toca nada de ese esquema salvo para LEER.
--
-- Si algún día el padrón crece hasta que esto importe, el índice se añade
-- entonces y con la medición delante.

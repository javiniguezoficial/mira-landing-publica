-- ═══════════════════════════════════════════════════════════════════════════
-- 020_remove_platform_admin_membership  ·  AJUSTE 6A.1
--
-- ⚠️ ESTADO: NO APLICADA. Timestamp del nombre PROVISIONAL.
--    Última versión remota al redactarla: 20260727184919 / 019_organization_identity_model.
--    Tras aplicarla con `apply_migration`, RENOMBRAR este archivo al timestamp
--    real que registre el historial remoto, igual que con la 018 y la 019.
--
-- ⚠️ NO EDITAR LA MIGRACIÓN 019: ya está aplicada en producción. Esta migración
--    corrige el dato encima, sin tocarla.
--
-- Propósito
--   Retirar la pertenencia de un administrador de plataforma a una organización
--   CLIENTE. Un platform_admin gestiona clientes desde /admin y no necesita
--   pertenecer a sus organizaciones: la pertenencia le hacía aparecer como
--   "Miembro" en el equipo del cliente, mezclando la identidad del proveedor de
--   servicio con la del cliente.
--
--   Caso concreto detectado en QA: el perfil de un platform_admin figuraba como
--   miembro de la única organización cliente. Esa fila es un resto de las
--   pruebas iniciales — fue creada por otro platform_admin (`invited_by`
--   informado) el mismo día en que se montó la demo.
--
-- Verificación previa (consultas de solo lectura, antes de escribir esta
-- migración): NINGÚN recurso depende de esa pertenencia.
--     rfqs.created_by ................ 0 filas
--     rfq_responses (vía sus RFQs) ... 0 filas
--     support_tickets.user_id ........ 0 filas
--     subscriptions.created_by ....... 0 filas
--     news.created_by ................ 0 filas
--     organization_members.invited_by  0 filas (no invitó a nadie)
--   Por tanto, eliminar la fila no deja ningún dato huérfano ni inaccesible.
--
-- ALCANCE ESTRICTO — lo que esta migración NO hace:
--   · NO elimina ningún perfil. El platform_admin conserva su cuenta, su rol
--     global y su acceso completo a /admin (que no depende de pertenencias).
--   · NO elimina organizaciones, RFQs, proveedores ni ningún otro dato.
--   · NO toca a la propietaria de la organización.
--   · NO hace un DELETE genérico de todos los platform_admin de todas las
--     organizaciones: se acota a pertenencias que cumplen TODAS estas
--     condiciones a la vez (ver el WHERE).
--   · NO toca policies, RLS, funciones ni Auth.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── Eliminación acotada e idempotente ─────────────────────────────────────
--
-- Condiciones acumulativas, todas necesarias:
--   1. El perfil es platform_admin.
--   2. Su rol en la organización es 'member' — nunca se elimina a un owner ni
--      a un admin de organización, porque eso sí podría dejar a una empresa
--      sin quien la gestione.
--   3. La organización tiene OTRO propietario distinto de este usuario, de modo
--      que jamás puede quedar una organización sin propietario.
--   4. No consta como quien invitó a ningún miembro actual (`invited_by`),
--      para no romper la trazabilidad de altas existentes.
--
-- Idempotente: al reejecutarse no encuentra filas y no hace nada.

delete from public.organization_members m
 where exists (
         select 1 from public.profiles p
          where p.id = m.user_id
            and p.role = 'platform_admin'
       )
   and m.org_role = 'member'
   and exists (
         select 1 from public.organization_members owner_row
          where owner_row.organization_id = m.organization_id
            and owner_row.user_id <> m.user_id
            and (owner_row.org_role = 'owner' or owner_row.role = 'client_owner')
       )
   and not exists (
         select 1 from public.organization_members invitado
          where invitado.invited_by = m.user_id
       );


-- ── Nota de diseño para bloques posteriores ───────────────────────────────
--
-- Esta migración corrige el dato, no impide que vuelva a ocurrir. Impedirlo a
-- nivel de esquema (por ejemplo, un trigger que rechace pertenencias de
-- platform_admin) se ha descartado a propósito: podría existir el caso
-- excepcional y legítimo de que un administrador de MIRA sea también usuario
-- real de una organización cliente.
--
-- La vía correcta para que MIRA inspeccione una organización es un mecanismo
-- auditado de "Ver como organización" (impersonación con registro), no una
-- pertenencia silenciosa. Queda propuesto para el Bloque 6B.

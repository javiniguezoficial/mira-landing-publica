// Ciclo de vida de una cuenta: suspender, reactivar y eliminar.
//
// ═══════════════════════════════════════════════════════════════════════════
// LOS DOS HALLAZGOS DE LA AUDITORÍA
// ═══════════════════════════════════════════════════════════════════════════
//
// 1. SUSPENDER ERA SOLO UNA ETIQUETA para los usuarios normales.
//    `evaluateActiveProfile()` estaba escrita y probada, pero no la llamaba
//    NADIE en la aplicación. `requireSession` solo mira que haya sesión,
//    `requireMembership` miraba el estado de la pertenencia y el de la
//    organización —nunca el del perfil—, el middleware solo resolvía el rol y
//    solo para `/admin`, y las funciones SQL tampoco miran `profiles.status`.
//    Un administrador suspendido sí quedaba fuera; un usuario normal, no.
//
// 2. `support_tickets.user_id` es ON DELETE **CASCADE**. Eliminar una cuenta
//    con tickets borraría la conversación entera. Y `rfqs.created_by` es
//    NO ACTION NOT NULL: la base rechazaría el borrado con un error de clave
//    ajena. Los dos se comprueban ANTES para explicarlo en castellano.

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  DELETION_MESSAGES,
  deletionBlockMessage,
  deletionBlockMessages,
  evaluateUserDeletion,
  isDeletionConfirmed,
  type UserDeletionFacts,
} from './user-deletion'
import {
  SUSPENDED_ALLOWED_PATHS,
  SUSPENDED_REDIRECT_PATH,
  shouldBlockSuspended,
  suspendedMayVisit,
} from './suspension'
import { evaluateActiveProfile } from './policy'

function fuente(...ruta: string[]): string {
  return readFileSync(join(process.cwd(), 'src', ...ruta), 'utf8')
}
function sinComentarios(t: string): string {
  return t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

const LIMPIA: UserDeletionFacts = {
  actorId: 'admin-1',
  targetUserId: 'user-1',
  targetIsPlatformAdmin: false,
  activeAdminCount: 2,
  ownedOrganizations: [],
  rfqCount: 0,
  supportTicketCount: 0,
  authoredNewsCount: 0,
  importBatchCount: 0,
  deletionBatchCount: 0,
  supplierBatchCount: 0,
}

// ═══════════════════════════════════════════════════════════════════════════
// SUSPENSIÓN — que sea real, no una etiqueta
// ═══════════════════════════════════════════════════════════════════════════

describe('SUSPENDER · el estado se impone de verdad', () => {
  it('un perfil no activo queda denegado por la política', () => {
    const ctx = (status: string | null) =>
      ({ user: { id: 'u', email: null }, platformRole: 'user', profileStatus: status, memberships: [] }) as never
    expect(evaluateActiveProfile(ctx('active'))).toBeNull()
    for (const s of ['suspended', 'pending', 'rejected', null]) {
      expect(evaluateActiveProfile(ctx(s)), String(s)).toBe('FORBIDDEN')
    }
  })

  // ESTE es el arreglo: antes `requireMembership` no miraba el perfil.
  it('`requireMembership` exige ahora perfil ACTIVO', () => {
    const guards = sinComentarios(fuente('lib', 'auth', 'guards.ts'))
    const cuerpo = guards.slice(guards.indexOf('export async function requireMembership'))
    expect(cuerpo).toContain('evaluateActiveProfile(sesion.context)')
    // Y va PRIMERO: el estado del perfil manda sobre el de la pertenencia.
    expect(cuerpo.indexOf('evaluateActiveProfile')).toBeLessThan(
      cuerpo.indexOf('evaluateOrganizationAccess'),
    )
  })

  it('la navegación por /app también queda bloqueada', () => {
    const mw = sinComentarios(fuente('lib', 'supabase', 'middleware.ts'))
    expect(mw).toContain('shouldBlockSuspended')
    expect(mw).toContain("select('role, status')")
    expect(mw).toContain('SUSPENDED_REDIRECT_PATH')
  })

  it('una cuenta suspendida no pasa a las rutas normales', () => {
    for (const ruta of ['/app/dashboard', '/app/rfqs', '/app/proveedores', '/app/mi-organizacion']) {
      expect(shouldBlockSuspended('suspended', ruta), ruta).toBe(true)
    }
  })

  it('una cuenta ACTIVA no se bloquea en ningún sitio', () => {
    for (const ruta of ['/app/dashboard', '/app/ayuda', '/app/rfqs']) {
      expect(shouldBlockSuspended('active', ruta), ruta).toBe(false)
    }
  })

  it('fail-closed: un estado desconocido o ausente bloquea', () => {
    for (const s of ['pending', 'rejected', null, undefined, 'loquesea']) {
      expect(shouldBlockSuspended(s, '/app/dashboard'), String(s)).toBe(true)
    }
  })

  // ── LA EXCEPCIÓN DELIBERADA ────────────────────────────────────────────
  //
  // Es la vía por la que alguien suspendido puede preguntar por qué lo está.
  // Estaba decidido desde antes y NO se toca.
  it('pero SÍ puede entrar en Soporte a reclamar', () => {
    expect(shouldBlockSuspended('suspended', '/app/ayuda')).toBe(false)
    expect(suspendedMayVisit('/app/ayuda')).toBe(true)
    expect([...SUSPENDED_ALLOWED_PATHS]).toEqual(['/app/ayuda'])
    expect(SUSPENDED_REDIRECT_PATH).toBe('/app/ayuda')
  })

  it('la excepción no se cuela por parecido de nombre', () => {
    // `/app/ayudante` NO es `/app/ayuda`.
    expect(suspendedMayVisit('/app/ayudante')).toBe(false)
    expect(suspendedMayVisit('/app/ayuda-falsa')).toBe(false)
    expect(suspendedMayVisit('/app/ayuda/detalle')).toBe(true)
  })

  it('el canal de soporte sigue usando `requireSession`, no `requireMembership`', () => {
    // Si soporte pasara a exigir pertenencia activa, la excepción moriría.
    const soporte = sinComentarios(fuente('lib', 'actions', 'support.ts'))
    const crear = soporte.slice(soporte.indexOf('export async function submitSupportTicket'))
    expect(crear).toContain('requireSession')
    expect(crear).not.toContain('requireMembership(')
  })

  it('`requireSession` NO exige perfil activo: es lo que mantiene abierto Soporte', () => {
    const guards = sinComentarios(fuente('lib', 'auth', 'guards.ts'))
    const cuerpo = guards.slice(
      guards.indexOf('export async function requireSession'),
      guards.indexOf('export async function requirePlatformAdmin'),
    )
    expect(cuerpo).not.toContain('evaluateActiveProfile')
  })
})

describe('REACTIVAR · no toca nada más', () => {
  const acciones = sinComentarios(fuente('lib', 'actions', 'user-admin.ts'))
  const cuerpo = acciones.slice(
    acciones.indexOf('export async function setUserProfileStatus'),
    acciones.indexOf('export async function createAndInviteUser'),
  )

  it('solo escribe la columna `status` del perfil', () => {
    expect(cuerpo).toContain(".update({ status })")
    expect(cuerpo).not.toContain('organization_members')
    expect(cuerpo).not.toContain('can_buy')
    expect(cuerpo).not.toContain('org_role')
  })

  it('no crea cuentas ni manda invitaciones', () => {
    expect(cuerpo).not.toContain('inviteUserByEmail')
    expect(cuerpo).not.toContain('createSupabaseAdminClient')
  })

  it('queda registrado con el estado anterior y el nuevo', () => {
    expect(cuerpo).toContain("action: 'profile.status_changed'")
    expect(cuerpo).toContain('before: { status: perfil.status }')
    expect(cuerpo).toContain('after: { status }')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// ELIMINACIÓN — qué se puede y qué no
// ═══════════════════════════════════════════════════════════════════════════

describe('ELIMINAR · una cuenta limpia sí se puede', () => {
  it('sin dependencias, es eliminable', () => {
    const v = evaluateUserDeletion(LIMPIA)
    expect(v.deletable).toBe(true)
    expect(v.blocks).toEqual([])
    expect(v.warnings).toEqual([])
  })

  // Es el caso de QA: crear desde el panel, invitar, y poder borrarla.
  it('con pertenencia y favoritos —que cascadean— sigue siendo eliminable', () => {
    // Ni `organization_members` ni `user_market_favorites` aparecen en los
    // hechos porque su CASCADE es justo lo que se quiere.
    expect(evaluateUserDeletion(LIMPIA).deletable).toBe(true)
  })
})

describe('ELIMINAR · lo que lo bloquea', () => {
  it('uno mismo, nunca', () => {
    const v = evaluateUserDeletion({ ...LIMPIA, targetUserId: 'admin-1' })
    expect(v.deletable).toBe(false)
    expect(v.blocks).toContain('SELF')
  })

  it('el último administrador ACTIVO', () => {
    const v = evaluateUserDeletion({ ...LIMPIA, targetIsPlatformAdmin: true, activeAdminCount: 1 })
    expect(v.blocks).toContain('LAST_ADMIN')
  })

  it('pero un administrador cuando hay otros, sí', () => {
    const v = evaluateUserDeletion({ ...LIMPIA, targetIsPlatformAdmin: true, activeAdminCount: 3 })
    expect(v.deletable).toBe(true)
  })

  // La propiedad NO se reasigna sola: elegir sucesor es una decisión de
  // negocio, no un efecto secundario de pulsar «Eliminar».
  it('propietario de una organización', () => {
    const v = evaluateUserDeletion({ ...LIMPIA, ownedOrganizations: ['Acme Distribución S.L.'] })
    expect(v.blocks).toContain('ORGANIZATION_OWNER')
    expect(deletionBlockMessage('ORGANIZATION_OWNER', { ownedOrganizations: ['Acme Distribución S.L.'] }))
      .toContain('Acme Distribución S.L.')
  })

  // `rfqs.created_by` es NO ACTION NOT NULL: la base lo rechazaría igualmente.
  it('con cotizaciones creadas', () => {
    expect(evaluateUserDeletion({ ...LIMPIA, rfqCount: 1 }).blocks).toContain('HAS_RFQS')
  })

  // `support_tickets.user_id` es CASCADE: borraría la conversación entera.
  it('con histórico de soporte', () => {
    expect(evaluateUserDeletion({ ...LIMPIA, supportTicketCount: 1 }).blocks)
      .toContain('HAS_SUPPORT_HISTORY')
  })

  it('se devuelven TODOS los motivos, no solo el primero', () => {
    const v = evaluateUserDeletion({
      ...LIMPIA, targetUserId: 'admin-1', ownedOrganizations: ['X'], rfqCount: 2, supportTicketCount: 1,
    })
    expect(v.blocks).toEqual(['SELF', 'ORGANIZATION_OWNER', 'HAS_RFQS', 'HAS_SUPPORT_HISTORY'])
  })
})

describe('ELIMINAR · lo que solo se desvincula', () => {
  // SET NULL: el registro se conserva y pierde el autor. No bloquea, se avisa.
  it('noticias, importaciones y borrados avisan pero no impiden', () => {
    const v = evaluateUserDeletion({
      ...LIMPIA, authoredNewsCount: 6, importBatchCount: 764, deletionBatchCount: 2, supplierBatchCount: 1,
    })
    expect(v.deletable).toBe(true)
    expect(v.warnings).toHaveLength(4)
    expect(v.warnings.join(' ')).toContain('6 noticias')
    expect(v.warnings.join(' ')).toContain('764 importaciones')
  })

  it('el singular y el plural concuerdan', () => {
    const v = evaluateUserDeletion({ ...LIMPIA, authoredNewsCount: 1 })
    expect(v.warnings[0]).toContain('1 noticia ')
  })
})

describe('ELIMINAR · los mensajes', () => {
  it('cada bloqueo dice qué hacer en su lugar', () => {
    for (const r of ['HAS_RFQS', 'HAS_SUPPORT_HISTORY'] as const) {
      expect(deletionBlockMessage(r, { ownedOrganizations: [] }).toLowerCase()).toContain('suspénd')
    }
    expect(deletionBlockMessage('ORGANIZATION_OWNER', { ownedOrganizations: ['X'] }))
      .toContain('Transfiere')
    expect(deletionBlockMessage('LAST_ADMIN', { ownedOrganizations: [] })).toContain('Nombra a otro')
  })

  it('ningún mensaje filtra SQL', () => {
    const v = evaluateUserDeletion({ ...LIMPIA, rfqCount: 1, supportTicketCount: 1, ownedOrganizations: ['X'] })
    const textos = [...deletionBlockMessages(v, { ...LIMPIA, ownedOrganizations: ['X'] }), ...Object.values(DELETION_MESSAGES)]
    for (const t of textos) {
      for (const sql of ['constraint', 'foreign key', 'violates', 'relation', 'rfqs_', 'pg_', 'CASCADE']) {
        expect(t.toLowerCase(), `${sql} en «${t}»`).not.toContain(sql.toLowerCase())
      }
    }
  })
})

describe('ELIMINAR · la confirmación escrita', () => {
  it('solo el correo exacto habilita el borrado', () => {
    expect(isDeletionConfirmed('ana@empresa.com', 'ana@empresa.com')).toBe(true)
    expect(isDeletionConfirmed('  Ana@Empresa.COM ', 'ana@empresa.com')).toBe(true)
  })

  // Una palabra fija se teclea por inercia; el correo obliga a mirar a quién.
  it('«ELIMINAR» NO vale como confirmación', () => {
    expect(isDeletionConfirmed('ELIMINAR', 'ana@empresa.com')).toBe(false)
  })

  it('otro correo tampoco', () => {
    expect(isDeletionConfirmed('otra@empresa.com', 'ana@empresa.com')).toBe(false)
    expect(isDeletionConfirmed('ana@empresa.co', 'ana@empresa.com')).toBe(false)
  })

  it('vacío o ausente nunca confirma', () => {
    for (const v of ['', '   ', null, undefined]) {
      expect(isDeletionConfirmed(v, 'ana@empresa.com'), String(v)).toBe(false)
      expect(isDeletionConfirmed('ana@empresa.com', v), String(v)).toBe(false)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Contrato de la acción
// ═══════════════════════════════════════════════════════════════════════════

describe('deleteUserAccount · contrato', () => {
  const ACCIONES = sinComentarios(fuente('lib', 'actions', 'user-admin.ts'))
  const CUERPO = ACCIONES.slice(ACCIONES.indexOf('export async function deleteUserAccount'))

  it('exige platform_admin antes que nada', () => {
    expect(CUERPO).toContain("requirePlatformAdmin('throw')")
    // Contra la LLAMADA, no contra el nombre de la función, que empieza por
    // `deleteUserAccount` y aparece antes.
    expect(CUERPO.indexOf('requirePlatformAdmin'))
      .toBeLessThan(CUERPO.indexOf('admin.auth.admin.deleteUser'))
  })

  it('el objetivo se RELEE del servidor, no se cree al formulario', () => {
    expect(CUERPO).toContain("from('profiles')")
    expect(CUERPO).toContain('getUserById(targetUserId)')
  })

  it('la confirmación se compara con el correo REAL de Auth', () => {
    expect(CUERPO).toContain('isDeletionConfirmed(input.confirmation, cuenta.user.email)')
  })

  it('todas las comprobaciones van ANTES del borrado', () => {
    const borrado = CUERPO.indexOf('deleteUser(targetUserId)')
    for (const previo of [
      'requirePlatformAdmin', 'isDeletionConfirmed', 'evaluateUserDeletion', "from('rfqs')", "from('support_tickets')",
    ]) {
      expect(CUERPO.indexOf(previo), previo).toBeLessThan(borrado)
    }
  })

  it('si el veredicto bloquea, NO se llama a deleteUser', () => {
    expect(CUERPO).toMatch(/if \(!veredicto\.deletable\)[\s\S]{0,200}return \{ ok: false/)
  })

  // Una sola escritura: la cascada la hace PostgreSQL en su transacción.
  it('`deleteUser` se llama EXACTAMENTE una vez', () => {
    expect((CUERPO.match(/admin\.auth\.admin\.deleteUser/g) ?? []).length).toBe(1)
  })

  it('no se borra tabla por tabla: se confía en la cascada del esquema', () => {
    expect(CUERPO).not.toMatch(/from\('organization_members'\)[\s\S]{0,80}\.delete\(/)
    expect(CUERPO).not.toMatch(/from\('profiles'\)[\s\S]{0,80}\.delete\(/)
  })

  it('queda auditado, y el registro sobrevive a la cuenta', () => {
    expect(CUERPO).toContain("action: 'user.deleted'")
    expect(CUERPO).toContain('targetUserId')
    // `admin_audit_log` no tiene FK (039): por eso el registro no cascadea.
    const sql039 = readFileSync(
      join(process.cwd(), 'supabase', 'migrations', '20260806130745_039_admin_audit_and_last_admin_guard.sql'),
      'utf8',
    ).toLowerCase()
    expect(sql039).not.toContain('references public.profiles')
  })

  it('no guarda el correo en la auditoría', () => {
    const bloque = CUERPO.slice(CUERPO.indexOf('writeAuditEntry'))
    expect(bloque).not.toContain('email')
  })

  it('no filtra el mensaje del proveedor', () => {
    expect(CUERPO).not.toMatch(/error:\s*errorBorrado\.message/)
    expect(CUERPO).toContain('DELETION_MESSAGES')
  })
})

describe('SEGURIDAD del borrado', () => {
  const ACCIONES = sinComentarios(fuente('lib', 'actions', 'user-admin.ts'))
  const CUERPO = ACCIONES.slice(ACCIONES.indexOf('export async function deleteUserAccount'))
  const TARJETA = sinComentarios(fuente('components', 'admin', 'users', 'DangerZoneCard.tsx'))

  it('el cliente privilegiado se crea DESPUÉS de autorizar', () => {
    expect(CUERPO.indexOf('requirePlatformAdmin')).toBeLessThan(CUERPO.indexOf('createSupabaseAdminClient()'))
  })

  it('el privilegiado solo toca Auth, nunca tablas', () => {
    expect(CUERPO).toMatch(/admin\.auth\.admin\.(getUserById|deleteUser)/)
    expect(CUERPO).not.toMatch(/\badmin\s*\.\s*from\(/)
    expect(CUERPO).not.toContain('admin.rpc(')
  })

  it('no se enumeran cuentas para buscar el objetivo', () => {
    expect(CUERPO).not.toContain('listUsers')
  })

  it('la tarjeta es de cliente y no ve el service role', () => {
    expect(TARJETA.startsWith("'use client'")).toBe(true)
    expect(TARJETA).not.toContain('SERVICE_ROLE')
    expect(TARJETA).not.toContain('createSupabaseAdminClient')
  })

  it('no hay variante para administradores de organización', () => {
    expect(CUERPO).not.toContain('requireOrgAdmin')
    expect(CUERPO).not.toContain('canManageTeam')
  })

  it('el botón está deshabilitado hasta que la confirmación coincide', () => {
    expect(TARJETA).toContain('disabled={!coincide || pending}')
    expect(TARJETA).toMatch(/if \(!coincide \|\| pending \|\| bloqueado\) return/)
  })

  it('si está bloqueado, la interfaz explica por qué y no ofrece el botón', () => {
    expect(TARJETA).toContain('Esta cuenta no se puede eliminar')
    expect(TARJETA).toMatch(/bloqueado \?/)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// El hotfix Invite sigue intacto
// ═══════════════════════════════════════════════════════════════════════════

describe('HOTFIX INVITE · no se ha tocado', () => {
  const ACCIONES = sinComentarios(fuente('lib', 'actions', 'user-admin.ts'))
  const INVITE = ACCIONES.slice(
    ACCIONES.indexOf('export async function createAndInviteUser'),
    ACCIONES.indexOf('export async function deleteUserAccount'),
  )

  it('la invitación sigue apuntando a /auth/invitacion', () => {
    expect(INVITE).toContain('buildInviteRedirectUrl(process.env.NEXT_PUBLIC_APP_URL)')
    expect(INVITE).not.toContain('/auth/callback')
  })

  it('la pantalla de invitación sigue existiendo y limpiando el fragmento', () => {
    const pantalla = sinComentarios(fuente('components', 'landing', 'AcceptInvitePage.tsx'))
    expect(pantalla).toContain('supabase.auth.setSession')
    expect(pantalla).toContain('history.replaceState')
    expect(pantalla).toContain('?motivo=invitacion')
  })

  it('el callback sigue cortando el fragmento en el error', () => {
    const callback = sinComentarios(fuente('app', 'auth', 'callback', 'route.ts'))
    expect(callback).toContain('redirigirAErrorSinFragmento')
    expect(callback).toContain('exchangeCodeForSession(code)')
  })
})

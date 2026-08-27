// Contrato del alta administrativa de usuarios.
//
// En Next.js toda función exportada de un archivo `'use server'` es un ENDPOINT
// invocable desde el navegador. Estos tests leen el CÓDIGO FUENTE de la acción
// y del SQL versionado, y fijan las propiedades que una llamada suelta no puede
// comprobar: el ORDEN de las operaciones y qué no se hace nunca.
//
// ═══════════════════════════════════════════════════════════════════════════
// VERIFICADO CONTRA LA BASE REAL
// ═══════════════════════════════════════════════════════════════════════════
//
// La RPC `admin_find_user_by_email` (045) se probó contra producción, con
// impersonación y sin escribir nada:
//
//   · sin sesión              → 0 filas
//   · usuario normal          → 0 filas
//   · administrador           → 1 fila
//   · MAYÚSCULAS + espacios   → 1 fila (misma cuenta)
//   · inexistente/vacío/null  → 0 filas
//   · patrones `%@%` y `%`    → 0 filas (no hay enumeración)

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function fuente(...ruta: string[]): string {
  return readFileSync(join(process.cwd(), 'src', ...ruta), 'utf8')
}

function sinComentarios(texto: string): string {
  return texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

const ACCIONES = sinComentarios(fuente('lib', 'actions', 'user-admin.ts'))
const FORM = sinComentarios(fuente('components', 'admin', 'users', 'NewUserForm.tsx'))
const PAGINA = sinComentarios(fuente('app', 'admin', 'usuarios', 'nuevo', 'page.tsx'))
const LISTADO = sinComentarios(fuente('app', 'admin', 'usuarios', 'page.tsx'))

const CUERPO = (() => {
  const i = ACCIONES.indexOf('export async function createAndInviteUser')
  expect(i, 'no se encuentra createAndInviteUser').toBeGreaterThan(-1)
  const j = ACCIONES.indexOf('export async function ', i + 1)
  return ACCIONES.slice(i, j === -1 ? undefined : j)
})()

const MIGRATIONS = join(process.cwd(), 'supabase', 'migrations')
function migracion(prefijo: string): string {
  const nombre = readdirSync(MIGRATIONS).find((f) => f.includes(prefijo))
  if (!nombre) throw new Error(`Falta la migración ${prefijo}`)
  return readFileSync(join(MIGRATIONS, nombre), 'utf8')
    .split('\n').map((l) => l.replace(/--.*$/, '')).join('\n')
    .toLowerCase().replace(/\s+/g, ' ').trim()
}
const SQL_045 = migracion('_045_')
const SQL_046 = migracion('_046_')

// ═══════════════════════════════════════════════════════════════════════════
// Autorización
// ═══════════════════════════════════════════════════════════════════════════

describe('solo un platform admin puede ejecutar el alta', () => {
  it('la acción exige `requirePlatformAdmin` antes que nada', () => {
    expect(CUERPO).toContain("requirePlatformAdmin('throw')")
    const guard = CUERPO.indexOf('requirePlatformAdmin')
    // Antes del guard no puede haber ni lectura ni escritura.
    expect(CUERPO.indexOf('.from(')).toBeGreaterThan(guard)
    expect(CUERPO.indexOf('inviteUserByEmail')).toBeGreaterThan(guard)
  })

  it('la página también, en profundidad', () => {
    expect(PAGINA).toContain('requirePlatformAdmin')
  })

  it('una denegación se convierte en resultado, no en excepción sin capturar', () => {
    expect(CUERPO).toContain('isAuthorizationError')
    expect(CUERPO).toMatch(/catch/)
  })

  // Fase actual: el administrador de una organización NO crea cuentas. Cuando
  // se definan límites por plan será otro bloque.
  it('no existe ninguna variante para administradores de organización', () => {
    expect(ACCIONES).not.toContain('requireOrgAdmin')
    expect(ACCIONES).not.toContain('canManageTeam')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Nada se toma del navegador
// ═══════════════════════════════════════════════════════════════════════════

describe('el servidor no se fía de la entrada', () => {
  it('el rol de plataforma se normaliza contra una lista cerrada', () => {
    expect(CUERPO).toContain('normalizeNewUserPlatformRole(input.platformRole)')
    expect(CUERPO).toMatch(/if \(!platformRole\) return/)
  })

  it('el rol de organización también', () => {
    expect(CUERPO).toContain('normalizeNewUserOrgRole(input.orgRole)')
  })

  // El `organization_id` llega del formulario: por eso se RELEE la fila y se
  // comprueban estado y perfil comercial contra la base.
  it('la organización se relee de la BASE, no se cree al formulario', () => {
    expect(CUERPO).toContain("from('organizations')")
    expect(CUERPO).toContain("select('id, name, status, commercial_profile')")
    expect(CUERPO).toContain('organizationAcceptsNewMembers')
  })

  it('una organización inexistente o que no admite miembros se rechaza', () => {
    expect(CUERPO).toMatch(/if \(!org\) return[\s\S]{0,80}orgNoExiste/)
    expect(CUERPO).toMatch(/organizationAcceptsNewMembers[\s\S]{0,120}orgNoAdmite/)
  })

  it('las capacidades se comprueban contra el perfil comercial REAL', () => {
    expect(CUERPO).toContain('capabilitiesExceedOrganization(perfil, input)')
    expect(CUERPO).toContain('resolveCapabilities(perfil, input)')
  })

  // Recortar en silencio dejaría al administrador creyendo que concedió algo.
  it('pedir una capacidad incompatible FALLA, no se recorta calladamente', () => {
    expect(CUERPO).toMatch(/capabilitiesExceedOrganization[\s\S]{0,120}return \{ ok: false/)
  })

  it('sin organización no se crea ninguna pertenencia', () => {
    expect(CUERPO).toMatch(/if \(organizationId && orgRole\)[\s\S]{0,200}organization_members/)
  })

  it('reutiliza el helper ÚNICO de capacidades, no reimplementa la tabla', () => {
    // `resolveCapabilities` se apoya en `organizationAllows`, el mismo que usan
    // la ficha de usuario, el equipo y la edición administrativa.
    const puro = fuente('lib', 'auth', 'new-user.ts')
    expect(puro).toContain("import { organizationAllows } from './user-admin'")
    expect(puro).not.toMatch(/=== 'buyer_seller'[\s\S]{0,40}=== 'buyer'/)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Duplicados
// ═══════════════════════════════════════════════════════════════════════════

describe('email duplicado', () => {
  it('se comprueba ANTES de crear nada', () => {
    const busqueda = CUERPO.indexOf('admin_find_user_by_email')
    const invitacion = CUERPO.indexOf('inviteUserByEmail')
    expect(busqueda).toBeGreaterThan(-1)
    expect(busqueda).toBeLessThan(invitacion)
  })

  it('el correo se normaliza antes de buscar', () => {
    expect(CUERPO).toContain('normalizeEmail(input.email)')
    expect(CUERPO).toContain('{ p_email: email }')
  })

  // No se reutiliza una cuenta existente en silencio: se dice que ya existe y
  // cuál es el camino correcto.
  it('si existe, NO se crea nada y se explica qué hacer', () => {
    expect(CUERPO).toMatch(/existente\?\.user_id[\s\S]{0,900}return \{\s*ok: false/)
    expect(CUERPO).toContain('Asignar a organización')
  })

  it('distingue «ya existe» de «ya pertenece a esta organización»', () => {
    expect(CUERPO).toContain("from('organization_members')")
    expect(CUERPO).toMatch(/pertenencia\s*\?/)
  })

  it('un 422 de Supabase también se traduce a «ya existe»', () => {
    // Cubre la cuenta de Auth sin perfil, que la búsqueda no vería.
    expect(CUERPO).toMatch(/status === 422[\s\S]{0,60}yaExiste/)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Orden de escritura y estados parciales
// ═══════════════════════════════════════════════════════════════════════════

describe('consistencia: el orden minimiza y hace visible el estado parcial', () => {
  it('todo lo que puede fallar por datos ocurre ANTES de invitar', () => {
    const invitacion = CUERPO.indexOf('inviteUserByEmail')
    for (const previo of [
      'requirePlatformAdmin', 'validateNewUser', "from('organizations')",
      'capabilitiesExceedOrganization', 'admin_find_user_by_email',
    ]) {
      expect(CUERPO.indexOf(previo), previo).toBeLessThan(invitacion)
    }
  })

  it('el perfil y la pertenencia se escriben DESPUÉS de la invitación', () => {
    const invitacion = CUERPO.indexOf('inviteUserByEmail')
    expect(CUERPO.indexOf("from('profiles')")).toBeGreaterThan(invitacion)
    expect(CUERPO.indexOf("from('organization_members')", invitacion)).toBeGreaterThan(invitacion)
  })

  // Un fallo posterior a la invitación no puede saldarse con un éxito mudo:
  // llevaría a reintentar y a chocar contra el duplicado.
  it('un fallo posterior devuelve `ok: true` CON aviso, no un éxito mudo', () => {
    expect(CUERPO).toContain('avisos.push')
    expect(CUERPO).toMatch(/avisos\.length > 0[\s\S]{0,160}warning/)
  })

  it('el aviso llega a la pantalla, no solo al log', () => {
    expect(FORM).toContain('res.warning')
    expect(FORM).toContain('aviso=')
    expect(sinComentarios(fuente('app', 'admin', 'usuarios', '[id]', 'page.tsx')))
      .toContain('searchParams')
  })

  // El correo YA ha salido: borrar dejaría un enlace vivo hacia un usuario
  // inexistente, y un borrado automático es la clase de operación que acaba
  // borrando cuentas legítimas.
  it('NUNCA se borra la cuenta para compensar', () => {
    expect(CUERPO).not.toContain('deleteUser')
    expect(CUERPO).not.toContain('.delete()')
  })

  it('el fallo de pertenencia queda registrado con lo necesario para repararlo', () => {
    expect(CUERPO).toMatch(/creada SIN organización/)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Invitación
// ═══════════════════════════════════════════════════════════════════════════

describe('la invitación usa el mecanismo oficial, una sola vez', () => {
  it('se llama a `inviteUserByEmail` EXACTAMENTE una vez', () => {
    expect((CUERPO.match(/inviteUserByEmail/g) ?? []).length).toBe(1)
  })

  // Supabase ya envía el correo con la plantilla «Invite user». Un segundo
  // correo por Nodemailer sería un duplicado para la persona invitada.
  it('NO se manda ningún correo propio: nada de Nodemailer aquí', () => {
    expect(CUERPO).not.toContain('deliver(')
    expect(CUERPO).not.toContain('notify')
    expect(ACCIONES).not.toContain("from '@/lib/email/")
  })

  it('el destino sale del helper seguro corregido en el hotfix', () => {
    expect(CUERPO).toContain('buildRecoveryRedirectUrl(process.env.NEXT_PUBLIC_APP_URL)')
    expect(ACCIONES).toContain("from '@/lib/auth/redirect-urls'")
  })

  it('nunca se construye una URL a mano', () => {
    expect(CUERPO).not.toContain('0.0.0.0')
    expect(CUERPO).not.toContain('localhost')
    expect(CUERPO).not.toMatch(/redirectTo:\s*[`'"]http/)
  })

  // Si la base no es utilizable, `buildRecoveryRedirectUrl` devuelve null y se
  // OMITE el parámetro: Supabase usa su Site URL antes que un enlace roto.
  it('sin base válida se omite `redirectTo` en lugar de inventarlo', () => {
    expect(CUERPO).toMatch(/redirectTo \? \{ redirectTo \} : \{\}/)
  })

  it('el nombre viaja en `data` para que el trigger rellene el perfil', () => {
    expect(CUERPO).toContain('first_name: firstName')
    expect(CUERPO).toContain('last_name: lastName')
  })

  it('un fallo de invitación se maneja y no filtra el mensaje del proveedor', () => {
    expect(CUERPO).toMatch(/if \(errorInvitacion \|\| !invitado\?\.user\?\.id\)/)
    expect(CUERPO).not.toMatch(/error:\s*errorInvitacion\.message/)
  })

  it('en ningún momento se pide ni se genera una contraseña', () => {
    expect(CUERPO).not.toContain('password')
    expect(FORM).not.toContain('password')
    expect(FORM).not.toContain('type="password"')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Cliente privilegiado
// ═══════════════════════════════════════════════════════════════════════════

describe('service_role: solo en servidor y acotado', () => {
  it('el archivo es `use server`', () => {
    expect(fuente('lib', 'actions', 'user-admin.ts').startsWith("'use server'")).toBe(true)
  })

  it('el cliente privilegiado se crea DESPUÉS de autorizar y no se devuelve', () => {
    const guard = CUERPO.indexOf('requirePlatformAdmin')
    const admin = CUERPO.indexOf('createSupabaseAdminClient()')
    expect(admin).toBeGreaterThan(guard)
    expect(CUERPO).not.toMatch(/return[\s\S]{0,40}admin\b/)
  })

  it('solo se usa para dar de alta en Auth: perfil y pertenencia van con RLS', () => {
    expect(CUERPO).toMatch(/admin\.auth\.admin\.inviteUserByEmail/)
    expect(CUERPO).not.toMatch(/admin\s*\.\s*from\(/)
    // El perfil y la pertenencia usan `supabase`, el cliente de la sesión.
    expect(CUERPO).toContain("supabase\n      .from('profiles')")
    expect(CUERPO).toContain("supabase.from('organization_members')")
  })

  it('no se enumeran cuentas', () => {
    expect(CUERPO).not.toContain('listUsers')
  })

  it('el formulario es de cliente y NO importa el cliente privilegiado', () => {
    expect(FORM.startsWith("'use client'")).toBe(true)
    expect(FORM).not.toContain('SERVICE_ROLE')
    expect(FORM).not.toContain('createSupabaseAdminClient')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Auditoría
// ═══════════════════════════════════════════════════════════════════════════

describe('auditoría', () => {
  it('se registra el alta con su acción propia', () => {
    expect(CUERPO).toContain("action: 'user.invited'")
    expect(CUERPO).toContain('writeAuditEntry')
  })

  it('deja quién, sobre quién, dónde y con qué permisos', () => {
    expect(CUERPO).toContain('actorId')
    expect(CUERPO).toContain('targetUserId: nuevoUserId')
    expect(CUERPO).toContain('targetOrganizationId: organizationId')
    expect(CUERPO).toContain('platform_role: platformRole')
    expect(CUERPO).toContain('can_buy: capacidades.canBuy')
  })

  // Ya está en `auth.users`; repetirlo en una tabla que se conserva
  // indefinidamente sería copiar un dato personal sin necesidad.
  it('NO guarda el correo ni el teléfono', () => {
    const bloque = CUERPO.slice(CUERPO.indexOf('writeAuditEntry'))
    expect(bloque).not.toContain('email')
    expect(bloque).not.toContain('phone')
  })

  it('la migración 046 amplía la lista cerrada sin quitar nada', () => {
    expect(SQL_046).toContain("'user.invited'")
    for (const previo of [
      'membership.created', 'membership.role_changed', 'membership.status_changed',
      'membership.capabilities_changed', 'membership.removed', 'profile.updated',
      'profile.platform_role_changed', 'profile.status_changed',
    ]) {
      expect(SQL_046, previo).toContain(`'${previo}'`)
    }
    expect(SQL_046).not.toContain('delete from')
    expect(SQL_046).not.toContain('drop table')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// La RPC de búsqueda (045)
// ═══════════════════════════════════════════════════════════════════════════

describe('045 — buscar por correo sin abrir una vía de enumeración', () => {
  it('comprueba el rol DENTRO, antes de mirar el parámetro', () => {
    expect(SQL_045).toContain('if not public.is_platform_admin() then return; end if;')
    expect(SQL_045.indexOf('is_platform_admin')).toBeLessThan(SQL_045.indexOf('from auth.users'))
  })

  it('compara por IGUALDAD sobre el correo completo, no por patrón', () => {
    expect(SQL_045).toContain('where lower(btrim(u.email)) = v_email')
    expect(SQL_045).not.toContain('like')
    expect(SQL_045).not.toContain('ilike')
    expect(SQL_045).not.toContain('similar to')
  })

  it('normaliza igual que el TypeScript: minúsculas y sin espacios', () => {
    expect(SQL_045).toContain('lower(btrim(coalesce(p_email')
    expect(fuente('lib', 'auth', 'new-user.ts')).toContain('.trim().toLowerCase()')
  })

  it('devuelve como mucho UNA fila', () => {
    expect(SQL_045).toContain('limit 1')
  })

  it('no devuelve credenciales, metadatos ni el propio correo', () => {
    // Solo las columnas DEVUELTAS: el parámetro `p_email text` es la entrada y
    // ese dato ya lo tenía quien pregunta.
    const inicio = SQL_045.indexOf('returns table')
    const columnas = SQL_045.slice(inicio, SQL_045.indexOf(')', inicio))
    expect(columnas).toContain('user_id uuid')
    for (const prohibido of ['encrypted_password', 'raw_user_meta_data', 'token', 'email', 'phone']) {
      expect(columnas, prohibido).not.toContain(prohibido)
    }
    // Y el SELECT tampoco saca nada de `auth.users` salvo para el JOIN.
    expect(SQL_045).toContain('select p.id, p.first_name, p.last_name, p.role, p.status')
    expect(SQL_045).not.toContain('u.encrypted_password')
    expect(SQL_045).not.toContain('select u.')
  })

  it('`anon` no puede ejecutarla', () => {
    expect(SQL_045).toContain('revoke all on function public.admin_find_user_by_email(text) from public, anon')
    expect(SQL_045).toContain('grant execute on function public.admin_find_user_by_email(text) to authenticated')
  })

  it('es `security definer` con `search_path` fijado', () => {
    expect(SQL_045).toContain('security definer')
    expect(SQL_045).toContain('set search_path = public')
  })

  it('no toca el esquema `auth` más que para leer', () => {
    expect(SQL_045).not.toContain('alter table auth')
    expect(SQL_045).not.toContain('create index')
    expect(SQL_045).not.toContain('insert into auth')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Interfaz
// ═══════════════════════════════════════════════════════════════════════════

describe('la pantalla', () => {
  it('el listado ofrece el acceso al alta', () => {
    expect(LISTADO).toContain('/admin/usuarios/nuevo')
    expect(LISTADO).toContain('Nuevo usuario')
  })

  it('el botón bloquea el doble envío y muestra que está trabajando', () => {
    expect(FORM).toContain('disabled={!puedeEnviar}')
    expect(FORM).toMatch(/if \(!puedeEnviar\) return/)
    expect(FORM).toContain('Creando…')
    expect(FORM).toContain('animate-spin')
  })

  it('cambiar de organización RECALCULA las capacidades', () => {
    expect(FORM).toContain('function cambiarOrganizacion')
    expect(FORM).toMatch(/setCanBuy\(\(actual\) => actual && organizationAllows/)
    expect(FORM).toMatch(/setCanSell\(\(actual\) => actual && organizationAllows/)
  })

  it('solo lista organizaciones que admiten miembros', () => {
    expect(FORM).toContain('organizationAcceptsNewMembers')
  })

  it('el resumen sale de los MISMOS datos que se envían', () => {
    expect(FORM).toContain('buildNewUserSummary')
  })

  it('avisa antes de crear un administrador de MIRA', () => {
    expect(FORM).toMatch(/platformRole === 'platform_admin'/)
  })

  it('tras crear, lleva a la ficha del nuevo usuario', () => {
    expect(FORM).toContain('/admin/usuarios/${res.userId}')
  })
})

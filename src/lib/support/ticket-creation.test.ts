// Quién puede abrir un ticket, y de quién es (Bloque 2 · ajuste).
//
// ── El diagnóstico que motiva este archivo ────────────────────────────────
//
// Durante el QA se reportó que un `member` no podía crear una solicitud. La
// causa NO era de permisos: se comprobó contra la base real, impersonando al
// usuario y con rollback forzado, que RLS ACEPTA el INSERT tanto para un
// `member` puro como para la cuenta del QA.
//
// El bloqueo real era de NAVEGACIÓN: la cuenta usada en la prueba tiene
// `profiles.role = 'platform_admin'`, así que el middleware la lleva a /admin
// al iniciar sesión, y la barra lateral de administración no tiene ninguna
// entrada de «Ayuda» — /admin/soporte es la pantalla de GESTIÓN, sin formulario
// de alta. No había camino hasta el formulario.
//
// Estos tests congelan las reglas que sí deben cumplirse, para que un cambio
// futuro no las estreche por accidente.

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

function fuente(...ruta: string[]): string {
  return readFileSync(join(process.cwd(), 'src', ...ruta), 'utf8')
}

function sinComentarios(texto: string): string {
  return texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

const ACCIONES = sinComentarios(fuente('lib', 'actions', 'support.ts'))
const QUERIES = sinComentarios(fuente('lib', 'queries', 'support.ts'))

const CREAR = ACCIONES.slice(
  ACCIONES.indexOf('export async function submitSupportTicket'),
  ACCIONES.indexOf('export async function markMySupportResponsesSeen'),
)

/** Policies declaradas en la migración que las creó. */
const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations')
function migracion(prefijo: string): string {
  const nombre = readdirSync(MIGRATIONS_DIR).find((f) => f.includes(prefijo))
  if (!nombre) throw new Error(`Falta la migración ${prefijo}`)
  return readFileSync(join(MIGRATIONS_DIR, nombre), 'utf8')
    .split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n')
    .toLowerCase().replace(/\s+/g, ' ')
}
/** 011 creó la tabla y sus policies originales… */
const SQL_TICKETS = migracion('_011_support_tickets')
/** …y 023 reescribió las de cliente, que son las vigentes. */
const SQL_POLICIES = migracion('_023_org_membership_policies')

// ═══════════════════════════════════════════════════════════════════════════
// Quién puede crear
// ═══════════════════════════════════════════════════════════════════════════

describe('la creación NO depende del rol organizativo', () => {
  it('la acción no mira `org_role` en ningún momento', () => {
    // Owner, admin y member pasan por exactamente el mismo camino. Si alguien
    // añadiera aquí una comprobación de rol, este test lo detendría.
    expect(CREAR).not.toContain('org_role')
    expect(CREAR).not.toContain("'owner'")
    expect(CREAR).not.toContain("'admin'")
    expect(CREAR).not.toContain('isOrgAdmin')
    expect(CREAR).not.toContain('canManageTeam')
  })

  it('tampoco depende de capacidades comerciales', () => {
    expect(CREAR).not.toContain('can_buy')
    expect(CREAR).not.toContain('canBuy')
    expect(CREAR).not.toContain('requireCommercialCapability')
  })

  it('la policy de INSERT vigente tampoco menciona ningún rol', () => {
    const policy = SQL_POLICIES.slice(
      SQL_POLICIES.indexOf('client_insert_own_ticket'),
      SQL_POLICIES.indexOf('client_select_own_tickets'),
    )
    expect(policy).not.toContain('org_role')
    expect(policy).not.toContain('is_org_owner')
    expect(policy).not.toContain('is_org_admin')
  })
})

describe('la excepción DELIBERADA: una cuenta suspendida sigue pudiendo reclamar', () => {
  it('se usa `requireSession`, no `requireMembership`', () => {
    // Soporte es la vía por la que alguien pregunta POR QUÉ está suspendido.
    // Exigir pertenencia activa aquí sería una regresión, no un endurecimiento.
    expect(CREAR).toContain('requireSession')
    expect(CREAR).not.toContain('requireMembership(')
  })

  it('la policy vigente (023) admite la pertenencia en CUALQUIER estado', () => {
    // 011 usaba `is_org_member`, que exige pertenencia y organización ACTIVAS.
    // 023 lo relajó a propósito SOLO para el canal de soporte.
    expect(SQL_POLICIES).toContain('belongs_to_org_any_status')
    const policy = SQL_POLICIES.slice(
      SQL_POLICIES.indexOf('client_insert_own_ticket'),
      SQL_POLICIES.indexOf('client_select_own_tickets'),
    )
    expect(policy).toContain('belongs_to_org_any_status')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// De quién es el ticket
// ═══════════════════════════════════════════════════════════════════════════

describe('ownership: el ticket es SIEMPRE de quien lo crea', () => {
  it('`user_id` sale de la sesión, nunca del formulario', () => {
    expect(CREAR).toContain('user_id: userId')
    expect(CREAR).not.toMatch(/formData\.get\(\s*['"]user_id['"]\s*\)/)
  })

  it('no se puede crear en nombre de otra persona', () => {
    // La policy exige además `auth.uid() = user_id`, así que aunque la acción
    // se saltara, PostgREST rechazaría un `user_id` ajeno.
    expect(SQL_POLICIES).toContain('auth.uid() = user_id')
  })

  it('`organization_id` se calcula en servidor', () => {
    expect(CREAR).toContain('resolveMembership(context)')
    expect(CREAR).not.toMatch(/formData\.get\(\s*['"]organization_id['"]\s*\)/)
  })

  it('solo se aceptan del formulario los cuatro campos de contenido', () => {
    const leidos = [...CREAR.matchAll(/formData\.get\(\s*['"]([^'"]+)['"]\s*\)/g)].map((m) => m[1])
    expect(new Set(leidos)).toEqual(new Set(['subject', 'message', 'category', 'priority']))
  })

  it('categoría y prioridad se validan contra listas cerradas', () => {
    expect(CREAR).toContain('ALLOWED_CATEGORIES.includes')
    expect(CREAR).toContain('ALLOWED_PRIORITIES.includes')
  })
})

describe('cada usuario ve SOLO sus propias solicitudes', () => {
  it('la pantalla de Ayuda filtra por `user_id` de la sesión', () => {
    const misTickets = QUERIES.slice(
      QUERIES.indexOf('export async function getMyTickets'),
      QUERIES.indexOf('export async function getPendingTicketCount'),
    )
    expect(misTickets).toContain('auth.getUser()')
    expect(misTickets).toContain(".eq('user_id', user.id)")
    // No acepta ningún identificador: no hay nada que manipular.
    expect(misTickets).toContain('getMyTickets(): Promise<SupportTicket[]>')
  })

  it('la policy SELECT es la barrera real', () => {
    expect(SQL_POLICIES).toContain('auth.uid() = user_id')
    // `platform_admin` conserva acceso total por su propia policy.
    expect(SQL_TICKETS).toContain('is_platform_admin()')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// El correo nunca compromete el ticket
// ═══════════════════════════════════════════════════════════════════════════

describe('crear un ticket persiste aunque el correo falle', () => {
  it('la notificación va DESPUÉS del insert', () => {
    const insert = CREAR.indexOf('.insert(')
    const aviso = CREAR.indexOf('notifyTicketCreated')
    expect(insert).toBeGreaterThan(-1)
    expect(aviso).toBeGreaterThan(insert)
  })

  it('va envuelta en `notificar`, que absorbe cualquier fallo', () => {
    expect(CREAR).toContain('await notificar(')
  })

  it('el resultado del envío no entra en el return', () => {
    expect(CREAR).not.toMatch(/return\s*{[^}]*notify/)
  })

  it('esto vale igual para un member: no hay rama distinta por rol', () => {
    // Un solo camino de creación ⇒ una sola garantía que mantener.
    expect((CREAR.match(/\.insert\(/g) ?? []).length).toBe(1)
  })
})

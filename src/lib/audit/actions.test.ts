// Catálogo de acciones auditables y contrato de las acciones de escritura (039).

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ADMIN_AUDIT_ACTIONS, ADMIN_AUDIT_ACTION_LABELS, isAdminAuditAction } from './actions'

function fuente(...ruta: string[]): string {
  return readFileSync(join(process.cwd(), 'src', ...ruta), 'utf8')
}

const ACCIONES = fuente('lib', 'actions', 'user-admin.ts')
const LECTORES = fuente('lib', 'actions', 'users.ts')

function sinComentarios(texto: string): string {
  return texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

describe('catálogo de acciones', () => {
  it('cada acción tiene etiqueta visible', () => {
    for (const a of ADMIN_AUDIT_ACTIONS) {
      expect(ADMIN_AUDIT_ACTION_LABELS[a], a).toBeTruthy()
    }
  })

  it('reconoce las suyas y rechaza el resto', () => {
    expect(isAdminAuditAction('membership.created')).toBe(true)
    expect(isAdminAuditAction('membership.inventada')).toBe(false)
    expect(isAdminAuditAction(null)).toBe(false)
  })

  it('cubre las cinco operaciones sobre memberships y las tres sobre perfiles', () => {
    expect(ADMIN_AUDIT_ACTIONS.filter((a) => a.startsWith('membership.'))).toHaveLength(5)
    expect(ADMIN_AUDIT_ACTIONS.filter((a) => a.startsWith('profile.'))).toHaveLength(3)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Contrato de las acciones de escritura
// ═══════════════════════════════════════════════════════════════════════════
//
// Lo que se fija aquí no es cosmético: en Next.js toda función exportada de un
// archivo `'use server'` es un ENDPOINT invocable desde el navegador. Si una
// sola de ellas se olvidara del guard, sería una puerta abierta.

const ACCIONES_ESPERADAS = [
  'assignUserToOrganization',
  'updateMembershipRole',
  'updateMembershipStatus',
  'updateMembershipCapabilities',
  'removeMembership',
  'updateUserProfileFields',
  'setUserPlatformRole',
  'setUserProfileStatus',
] as const

describe('todas las acciones exigen platform_admin', () => {
  it('están las ocho', () => {
    for (const a of ACCIONES_ESPERADAS) {
      expect(ACCIONES, a).toContain(`export async function ${a}(`)
    }
  })

  it('ninguna function exportada se salta el guard', () => {
    const codigo = sinComentarios(ACCIONES)
    const exportadas = [...codigo.matchAll(/export async function (\w+)\(/g)].map((m) => m[1])

    expect(exportadas.sort()).toEqual([...ACCIONES_ESPERADAS].sort())

    for (const nombre of exportadas) {
      const desde = codigo.indexOf(`export async function ${nombre}(`)
      const siguiente = codigo.indexOf('export async function', desde + 10)
      const cuerpo = codigo.slice(desde, siguiente === -1 ? undefined : siguiente)
      expect(cuerpo, nombre).toContain("requirePlatformAdmin('throw')")
    }
  })

  it('cada acción registra su operación en la auditoría', () => {
    const codigo = sinComentarios(ACCIONES)
    const registros = [...codigo.matchAll(/action: '([\w.]+)'/g)].map((m) => m[1])
    expect(registros.length).toBeGreaterThanOrEqual(7)
    for (const r of registros) {
      expect(isAdminAuditAction(r), r).toBe(true)
    }
  })

  // El cliente privilegiado ignora RLS por completo. Su único uso admitido
  // sigue siendo leer los correos de `auth.users`, que no concede nada.
  it('ninguna escritura usa el cliente de service_role', () => {
    expect(sinComentarios(ACCIONES)).not.toContain('createSupabaseAdminClient')
  })

  it('el service_role solo se usa para leer correos, en el módulo de lectura', () => {
    const codigo = sinComentarios(LECTORES)
    const usos = (codigo.match(/createSupabaseAdminClient/g) ?? []).length
    expect(usos).toBe(2) // el import y la llamada dentro de `fetchEmailMap`
    expect(codigo).toContain('async function fetchEmailMap()')
  })
})

describe('las escrituras antiguas se han retirado, no solo dejado de usar', () => {
  // Una acción de escritura que ya nadie llama sigue aceptando peticiones y se
  // salta las reglas que se hayan añadido después en su sustituta.
  it('`users.ts` ya no exporta ninguna acción de escritura de memberships', () => {
    const codigo = sinComentarios(LECTORES)
    for (const vieja of [
      'addOrganizationMember',
      'removeOrganizationMember',
      'updateOrganizationMemberRole',
    ]) {
      expect(codigo, vieja).not.toContain(`export async function ${vieja}(`)
    }
  })

  it('`users.ts` no escribe en organization_members ni en profiles', () => {
    const codigo = sinComentarios(LECTORES)
    expect(codigo).not.toContain('.insert(')
    expect(codigo).not.toContain('.update(')
    expect(codigo).not.toContain('.delete(')
  })
})

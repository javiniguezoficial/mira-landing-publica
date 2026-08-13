// Roles legacy: por qué NO se normalizan (Bloque 1, punto 6).
//
// ── El estado real, medido en producción ───────────────────────────────────
//
//   profiles.role             platform_admin ×3 · client_member ×2 · user ×1
//   organization_members.role client_owner ×1 · client_member ×2
//   organization_members.org_role  owner ×1 · admin ×1 · member ×1
//
// ── Decisión: se dejan intactos. Tres motivos ──────────────────────────────
//
// 1. `organization_members.role` NO ES OPCIONAL. El trigger
//    `enforce_membership_rules()` (023) exige que cada escritura fije el valor
//    canónico y el legacy de forma coherente, y aborta con `23514` si no
//    coinciden. La columna no es un resto: es parte del contrato vigente.
//    Retirarla exige reescribir el trigger, es decir una migración.
//
// 2. `profiles.role` legacy NO PRODUCE NINGUNA DIFERENCIA DE COMPORTAMIENTO.
//    `normalizePlatformRole` colapsa `client_owner` y `client_member` en `user`,
//    y en SQL `is_platform_admin()` compara contra `'platform_admin'`, así que
//    los tres valores no administrativos deniegan /admin exactamente igual. No
//    hay ningún usuario que gane ni pierda acceso por normalizar.
//
// 3. NORMALIZAR AHORA SE DESHARÍA SOLO. `handle_new_user()` sigue insertando
//    `'client_member'` en cada alta de `auth.users`. Actualizar las dos filas
//    existentes sin tocar esa función significaría que el próximo registro
//    vuelve a crear un valor legacy: una migración cosmética que no converge.
//    Cambiar la función es, otra vez, una migración — y este bloque no la
//    necesita para nada más.
//
// Cuando llegue el bloque que toque `handle_new_user()` por otro motivo, ese
// será el momento de normalizar las dos cosas a la vez y en una sola migración.
//
// Mientras tanto, este archivo CONGELA la equivalencia. Si algún día alguien
// añade una rama que trate `client_member` distinto de `user`, estos tests
// fallan y la decisión vuelve a la mesa en lugar de convertirse en un bug.

import { describe, expect, it } from 'vitest'
import {
  isOrgAdmin,
  isOwner,
  isPlatformAdmin,
  normalizeOrganizationRole,
  normalizePlatformRole,
  organizationRoleLabel,
  resolveMemberRoles,
} from '@/lib/identity'
import { LEGACY_ROLE_FOR, canManageTeam, evaluateRolePairCoherence } from './team'
import { evaluatePlatformRole } from './policy'

/** Los tres valores que hoy conviven en `profiles.role` sin ser administrador. */
const NO_ADMIN = ['user', 'client_owner', 'client_member'] as const

describe('profiles.role — legacy y canónico son indistinguibles', () => {
  it('los tres valores no administrativos colapsan en `user`', () => {
    for (const v of NO_ADMIN) {
      expect(normalizePlatformRole(v)).toBe('user')
      expect(isPlatformAdmin(v)).toBe(false)
    }
  })

  it('ninguno de los tres abre /admin', () => {
    for (const v of NO_ADMIN) {
      expect(evaluatePlatformRole(normalizePlatformRole(v))).toBe('FORBIDDEN')
    }
  })

  it('`platform_admin` sí lo abre, y es el único', () => {
    expect(normalizePlatformRole('platform_admin')).toBe('platform_admin')
    expect(evaluatePlatformRole(normalizePlatformRole('platform_admin'))).toBeNull()
  })

  it('FAIL-CLOSED: un valor desconocido deniega y se distingue en los registros', () => {
    expect(normalizePlatformRole('org_admin')).toBeNull()
    expect(normalizePlatformRole(null)).toBeNull()
    expect(evaluatePlatformRole(null)).toBe('INVALID_ROLE')
  })
})

describe('organization_members — el legacy sigue siendo obligatorio', () => {
  it('cada rol canónico tiene exactamente un valor legacy', () => {
    expect(LEGACY_ROLE_FOR.owner).toBe('client_owner')
    expect(LEGACY_ROLE_FOR.admin).toBe('client_member')
    expect(LEGACY_ROLE_FOR.member).toBe('client_member')
  })

  it('una pareja coherente pasa; una incoherente se rechaza', () => {
    expect(evaluateRolePairCoherence('owner', 'client_owner')).toBeNull()
    expect(evaluateRolePairCoherence('admin', 'client_member')).toBeNull()
    expect(evaluateRolePairCoherence('member', 'client_member')).toBeNull()

    // `admin` y `member` comparten legacy: por eso `org_role` manda y el legacy
    // por sí solo NO distingue a un administrador de un miembro.
    expect(evaluateRolePairCoherence('admin', 'client_owner')).toBe('INVALID_ROLE')
    expect(evaluateRolePairCoherence('owner', 'client_member')).toBe('INVALID_ROLE')
  })

  it('el legacy por sí solo NO puede distinguir admin de member', () => {
    // Consecuencia directa del punto anterior, y la razón por la que la gestión
    // de equipo lee `org_role` con prioridad: una fila que solo tuviera el
    // legacy se leería como `member`, nunca como `admin`.
    expect(normalizeOrganizationRole('client_member')).toBe('member')
    expect(isOrgAdmin('client_member')).toBe(false)
  })

  it('`org_role` tiene prioridad y el legacy es la caída', () => {
    const filas = resolveMemberRoles([
      { org_role: 'admin', role: 'client_member' },
      { org_role: null, role: 'client_owner' },
      { org_role: 'member', role: 'client_member' },
    ])
    expect(filas.map((f) => f.orgRole)).toEqual(['admin', 'owner', 'member'])
  })

  it('el legacy sigue traduciéndose para la interfaz', () => {
    expect(isOwner('client_owner')).toBe(true)
    expect(organizationRoleLabel('client_owner')).toBe('Propietario')
    expect(organizationRoleLabel('client_member')).toBe('Miembro')
  })
})

describe('la gestión de equipo funciona con datos legacy sin migrar', () => {
  it('un propietario guardado como `client_owner` sigue gestionando', () => {
    const rol = normalizeOrganizationRole('client_owner')
    expect(canManageTeam({ userId: 'u-1', orgRole: rol })).toBe(true)
  })

  it('un miembro guardado como `client_member` sigue sin gestionar', () => {
    const rol = normalizeOrganizationRole('client_member')
    expect(canManageTeam({ userId: 'u-2', orgRole: rol })).toBe(false)
  })
})

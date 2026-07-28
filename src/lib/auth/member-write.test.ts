// Escritura canónica de pertenencias — Bloque 6B.3, fase 2.
//
// Comprueban que lo que la aplicación escribe cumple las invariantes que impone
// la migración 023, ANTES de aplicarla. Si estos tests pasan, la gestión de
// miembros desde /admin seguirá funcionando cuando el trigger esté activo.

import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  MANAGEABLE_ROLE_LABELS,
  buildMembershipInsert,
  buildMembershipRoleUpdate,
  membershipErrorDetail,
  normalizeManageableRole,
  translateMembershipError,
} from './member-write'
import { evaluateRolePairCoherence } from './team'

// ── Normalización del rol recibido del formulario ───────────────────────────

describe('normalizeManageableRole', () => {
  it('acepta los dos roles gestionables', () => {
    expect(normalizeManageableRole('admin')).toBe('admin')
    expect(normalizeManageableRole('member')).toBe('member')
  })

  it('RECHAZA owner: la propiedad no se crea desde esta acción', () => {
    expect(normalizeManageableRole('owner')).toBeNull()
  })

  it('RECHAZA los valores legacy que enviaba la interfaz anterior', () => {
    expect(normalizeManageableRole('client_owner')).toBeNull()
    expect(normalizeManageableRole('client_member')).toBeNull()
  })

  it('rechaza valores desconocidos y tipos que no son texto', () => {
    for (const raw of ['superadmin', 'ADMIN', 'Admin', '', ' member', null, undefined, 7, {}, ['admin']]) {
      expect(normalizeManageableRole(raw)).toBeNull()
    }
  })
})

// ── Construcción de la fila de alta ─────────────────────────────────────────

describe('buildMembershipInsert', () => {
  const base = { organizationId: 'org-a', userId: 'u-1', invitedBy: 'u-admin' }

  it('admin escribe org_role=admin y role=client_member', () => {
    const fila = buildMembershipInsert({ ...base, role: 'admin' })
    expect(fila.org_role).toBe('admin')
    expect(fila.role).toBe('client_member')
  })

  it('member escribe org_role=member y role=client_member', () => {
    const fila = buildMembershipInsert({ ...base, role: 'member' })
    expect(fila.org_role).toBe('member')
    expect(fila.role).toBe('client_member')
  })

  it('escribe TODOS los campos de autorización de forma explícita', () => {
    const fila = buildMembershipInsert({ ...base, role: 'member' })
    // Ningún campo de permisos puede quedar a merced de un default.
    for (const campo of [
      'organization_id', 'user_id', 'org_role', 'role', 'status', 'can_buy', 'can_sell', 'invited_by',
    ]) {
      expect(fila).toHaveProperty(campo)
    }
  })

  it('el alta arranca activa y SIN capacidades comerciales', () => {
    const fila = buildMembershipInsert({ ...base, role: 'admin' })
    expect(fila.status).toBe('active')
    expect(fila.can_buy).toBe(false)
    expect(fila.can_sell).toBe(false)
  })

  it('invited_by es null cuando no se indica', () => {
    const fila = buildMembershipInsert({ organizationId: 'org-a', userId: 'u-1', role: 'member' })
    expect(fila.invited_by).toBeNull()
  })

  it('nunca produce una fila de propietario', () => {
    for (const role of ['admin', 'member'] as const) {
      const fila = buildMembershipInsert({ ...base, role })
      expect(fila.org_role).not.toBe('owner')
      expect(fila.role).not.toBe('client_owner')
    }
  })
})

// ── Cambio de rol ───────────────────────────────────────────────────────────

describe('buildMembershipRoleUpdate', () => {
  it('actualiza org_role y role a la vez', () => {
    expect(buildMembershipRoleUpdate('admin')).toEqual({ org_role: 'admin', role: 'client_member' })
    expect(buildMembershipRoleUpdate('member')).toEqual({ org_role: 'member', role: 'client_member' })
  })

  it('nunca deja los dos modelos desalineados', () => {
    for (const role of ['admin', 'member'] as const) {
      const cambio = buildMembershipRoleUpdate(role)
      expect(evaluateRolePairCoherence(cambio.org_role, cambio.role)).toBeNull()
    }
  })

  it('no toca ninguna columna estructural', () => {
    const claves = Object.keys(buildMembershipRoleUpdate('admin'))
    for (const prohibida of ['id', 'organization_id', 'user_id', 'invited_by', 'status']) {
      expect(claves).not.toContain(prohibida)
    }
    expect(claves.sort()).toEqual(['org_role', 'role'])
  })
})

// ── Compatibilidad con las invariantes de la migración 023 ──────────────────

describe('compatibilidad con la migración 023', () => {
  it('toda alta generada satisface la coherencia canónico ↔ legacy', () => {
    for (const role of ['admin', 'member'] as const) {
      const fila = buildMembershipInsert({ organizationId: 'org-a', userId: 'u-1', role })
      expect(evaluateRolePairCoherence(fila.org_role, fila.role)).toBeNull()
    }
  })

  it('la escritura que hacía la versión anterior habría sido rechazada', () => {
    // Antes: insert({ role: 'client_owner' }) y `org_role` al default 'member'.
    expect(evaluateRolePairCoherence('member', 'client_owner')).toBe('INVALID_ROLE')
    // Y también el otro caso legacy: role sin org_role explícito.
    expect(evaluateRolePairCoherence('member', 'client_member')).toBeNull()
  })

  it('ninguna escritura puede producir un segundo propietario', () => {
    // `normalizeManageableRole` cierra la puerta antes de construir la fila.
    expect(normalizeManageableRole('owner')).toBeNull()
    expect(normalizeManageableRole('client_owner')).toBeNull()
  })
})

// ── Traducción de errores ───────────────────────────────────────────────────

describe('translateMembershipError', () => {
  it('unicidad de propietario (23505) → mensaje sobre propietario', () => {
    expect(
      translateMembershipError({
        code: '23505',
        message: 'duplicate key value violates unique constraint "organization_members_single_owner_idx": propietario',
      }),
    ).toBe('La organización ya tiene un propietario.')
  })

  it('unicidad de pertenencia (23505) → usuario ya es miembro', () => {
    expect(
      translateMembershipError({ code: '23505', message: 'duplicate key value violates unique constraint' }),
    ).toBe('El usuario ya es miembro de esta organización.')
  })

  it('intento de crear propietario → mensaje claro', () => {
    expect(
      translateMembershipError({
        code: '42501',
        message: 'No se puede crear ni ascender a propietario desde la gestión de equipo.',
      }),
    ).toBe('No se puede crear otro propietario.')
  })

  it('intento de modificar al propietario → mensaje claro', () => {
    for (const mensaje of [
      'No se puede degradar al propietario: la organización quedaría sin ninguno.',
      'No se puede eliminar al propietario de la organización.',
      'No se puede desactivar la pertenencia del propietario: la organización quedaría sin propietario activo.',
    ]) {
      expect(translateMembershipError({ code: '23514', message: mensaje })).toBe(
        'El propietario no puede modificarse desde esta acción.',
      )
    }
  })

  it('escritura incoherente (23514) → rol no válido', () => {
    expect(
      translateMembershipError({
        code: '23514',
        message: 'Escritura incoherente: org_role=member exige role=client_member, se recibió role=client_owner.',
      }),
    ).toBe('El rol seleccionado no es válido.')
  })

  it('autoedición → mensaje claro', () => {
    expect(
      translateMembershipError({
        code: '42501',
        message: 'No se puede modificar ni eliminar la propia pertenencia.',
      }),
    ).toBe('No puedes modificar tu propia pertenencia desde esta acción.')
  })

  it('identificadores estructurales → mensaje claro', () => {
    expect(
      translateMembershipError({
        code: '23514',
        message: 'Los identificadores estructurales de una pertenencia son inmutables (id, organization_id, user_id, invited_by).',
      }),
    ).toBe('No se pueden modificar los datos internos de una pertenencia.')
  })

  it('techo comercial → mensaje claro', () => {
    expect(
      translateMembershipError({
        code: '23514',
        message: 'La organización no tiene perfil vendedor: no se puede conceder can_sell.',
      }),
    ).toBe('La organización no admite esa capacidad comercial.')
  })

  it('un error desconocido cae en un mensaje genérico, nunca en el original', () => {
    const salida = translateMembershipError({
      code: 'XX000',
      message: 'PG::InternalError relation "organization_members" pg_catalog stack trace',
    })
    expect(salida).toBe('No se ha podido completar la operación.')
    expect(salida).not.toContain('pg_catalog')
    expect(salida).not.toContain('XX000')
  })

  it('nunca filtra SQLSTATE, nombres de constraint ni jerga de PostgreSQL', () => {
    const entradas = [
      { code: '23505', message: 'duplicate key value violates unique constraint "organization_members_single_owner_idx"' },
      { code: '23514', message: 'new row for relation "organization_members" violates check constraint' },
      { code: '42501', message: 'permission denied for table organization_members' },
      { code: 'P0001', message: 'RAISE EXCEPTION en public.enforce_membership_rules()' },
      null,
      undefined,
    ]
    for (const entrada of entradas) {
      const salida = translateMembershipError(entrada)
      for (const prohibido of [
        'constraint', 'relation', 'pg_', 'public.', 'SQLSTATE', '23505', '23514', '42501', 'P0001',
        'organization_members', 'enforce_membership_rules', 'duplicate key',
      ]) {
        expect(salida.toLowerCase()).not.toContain(prohibido.toLowerCase())
      }
    }
  })

  it('sin error devuelve el mensaje genérico', () => {
    expect(translateMembershipError(null)).toBe('No se ha podido completar la operación.')
    expect(translateMembershipError(undefined)).toBe('No se ha podido completar la operación.')
  })
})

describe('membershipErrorDetail (registro de servidor)', () => {
  it('conserva el detalle técnico para diagnosticar', () => {
    const detalle = membershipErrorDetail('alta de miembro', { code: '23514', message: 'Escritura incoherente' })
    expect(detalle).toContain('23514')
    expect(detalle).toContain('alta de miembro')
  })

  it('tolera un error sin código ni mensaje', () => {
    expect(membershipErrorDetail('baja', null)).toContain('baja')
  })
})

// ── Etiquetas visibles ──────────────────────────────────────────────────────

describe('etiquetas de la interfaz', () => {
  it('la interfaz nunca ofrece Propietario como opción asignable', () => {
    expect(Object.keys(MANAGEABLE_ROLE_LABELS).sort()).toEqual(['admin', 'member'])
    expect(Object.keys(MANAGEABLE_ROLE_LABELS)).not.toContain('owner')
  })

  it('las etiquetas están en castellano y no exponen valores técnicos', () => {
    expect(MANAGEABLE_ROLE_LABELS.admin).toBe('Administrador')
    expect(MANAGEABLE_ROLE_LABELS.member).toBe('Miembro')
    for (const etiqueta of Object.values(MANAGEABLE_ROLE_LABELS)) {
      for (const tecnico of ['client_owner', 'client_member', 'owner', 'admin', 'member', '_']) {
        expect(etiqueta).not.toContain(tecnico)
      }
    }
  })
})

// ── La interfaz administrativa no expone valores técnicos ───────────────────
//
// Verificación estructural sobre el código fuente de los componentes. Es la
// forma de fijar los casos 12 y 13 sin recurrir a Testing Library: lo que se
// comprueba es qué valores puede llegar a enviar el formulario.

describe('superficie administrativa de gestión de miembros', () => {
  const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
  const modal = readFileSync(resolve(raiz, 'src/components/admin/users/AddMemberModal.tsx'), 'utf8')
  const tabla = readFileSync(resolve(raiz, 'src/components/admin/users/MembersTable.tsx'), 'utf8')

  it('el alta no ofrece Propietario como opción', () => {
    expect(modal).not.toContain('client_owner')
    expect(modal).not.toMatch(/value="owner"/)
  })

  it('el alta no envía valores legacy', () => {
    expect(modal).not.toContain('client_member')
  })

  it('el alta ofrece exactamente Administrador y Miembro', () => {
    expect(modal).toContain('value="member"')
    expect(modal).toContain('value="admin"')
    expect(modal).toContain('MANAGEABLE_ROLE_LABELS')
  })

  it('el alta explica que la propiedad se gestiona aparte', () => {
    expect(modal).toContain('La transferencia de propiedad se gestionará mediante una acción específica.')
  })

  it('la tabla no ofrece roles legacy en el selector', () => {
    expect(tabla).not.toContain('client_owner')
    expect(tabla).not.toContain('client_member')
  })

  it('la tabla distingue al propietario y no le muestra selector', () => {
    expect(tabla).toContain('esPropietario')
    expect(tabla).toContain("member.orgRole === 'owner'")
  })

  it('la tabla usa el rol canónico, no el valor legacy almacenado', () => {
    expect(tabla).toContain('member.orgRole')
    expect(tabla).not.toMatch(/status=\{member\.role\}/)
  })

  it('ningún valor técnico crudo llega a la interfaz', () => {
    for (const fuente of [modal, tabla]) {
      // Las etiquetas visibles salen siempre de un mapa, nunca literales.
      expect(fuente).not.toMatch(/>Client (Owner|Member)</)
    }
  })
})

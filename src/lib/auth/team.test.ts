// Reglas de gestión de equipo — espejo en TypeScript de la migración 023.
//
// Estos tests NO prueban RLS. Fijan la semántica que la interfaz debe anticipar
// y que el trigger `enforce_membership_rules()`, las policies y el índice único
// imponen de verdad. La verificación real está en:
//   supabase/checks/6B3_structural_check.sql
//   supabase/checks/6B3_rls_behaviour_check.sql
//
// Distinguen las dos capas de la migración:
//   AUTORIZACIÓN — `platform_admin` tiene más margen.
//   INVARIANTES  — se aplican a todos, `platform_admin` incluido.

import { describe, expect, it } from 'vitest'
import {
  IMMUTABLE_MEMBERSHIP_COLUMNS,
  LEGACY_ROLE_FOR,
  OWNER_EDITABLE_ORG_COLUMNS,
  PLATFORM_ONLY_ORG_COLUMNS,
  evaluateCapabilityAssignment,
  evaluateMemberCreation,
  evaluateMemberRemoval,
  evaluateMemberUpdate,
  evaluateOwnerCreation,
  evaluateOwnerProtection,
  evaluateRolePairCoherence,
  evaluateStructuralImmutability,
  isOwnerEditableOrgColumn,
  type TeamActor,
  type TeamTarget,
} from './team'

const OWNER: TeamActor = { orgRole: 'owner', userId: 'u-owner' }
const ADMIN: TeamActor = { orgRole: 'admin', userId: 'u-admin' }
const MEMBER: TeamActor = { orgRole: 'member', userId: 'u-member' }
const EXTERNO: TeamActor = { orgRole: null, userId: 'u-externo' }
const PLATAFORMA: TeamActor = { orgRole: null, userId: 'u-mira', isPlatformAdmin: true }

const T_OWNER: TeamTarget = { orgRole: 'owner', userId: 'u-owner' }
const T_ADMIN: TeamTarget = { orgRole: 'admin', userId: 'u-admin' }
const T_MEMBER: TeamTarget = { orgRole: 'member', userId: 'u-member' }

// ═══════════════════════════════════════════════════════════════════════════
// Capa 1 — AUTORIZACIÓN
// ═══════════════════════════════════════════════════════════════════════════

describe('alta de miembros', () => {
  it('el propietario crea miembros y administradores', () => {
    expect(evaluateMemberCreation(OWNER, 'member')).toBeNull()
    expect(evaluateMemberCreation(OWNER, 'admin')).toBeNull()
  })

  it('un administrador crea miembros', () => {
    expect(evaluateMemberCreation(ADMIN, 'member')).toBeNull()
  })

  it('un administrador NO crea administradores', () => {
    expect(evaluateMemberCreation(ADMIN, 'admin')).toBe('FORBIDDEN')
  })

  it('un miembro y un externo no dan de alta a nadie', () => {
    expect(evaluateMemberCreation(MEMBER, 'member')).toBe('FORBIDDEN')
    expect(evaluateMemberCreation(EXTERNO, 'member')).toBe('FORBIDDEN')
  })

  it('platform_admin crea miembros y administradores', () => {
    expect(evaluateMemberCreation(PLATAFORMA, 'member')).toBeNull()
    expect(evaluateMemberCreation(PLATAFORMA, 'admin')).toBeNull()
  })
})

describe('modificación de pertenencias', () => {
  it('el propietario modifica a miembros y administradores', () => {
    expect(evaluateMemberUpdate(OWNER, T_MEMBER)).toBeNull()
    expect(evaluateMemberUpdate(OWNER, T_ADMIN)).toBeNull()
    expect(evaluateMemberUpdate(OWNER, T_MEMBER, 'admin')).toBeNull()
  })

  it('un administrador modifica a miembros, no a administradores', () => {
    expect(evaluateMemberUpdate(ADMIN, T_MEMBER)).toBeNull()
    expect(evaluateMemberUpdate(ADMIN, { orgRole: 'admin', userId: 'otro-admin' })).toBe('FORBIDDEN')
    expect(evaluateMemberUpdate(ADMIN, T_MEMBER, 'admin')).toBe('FORBIDDEN')
  })

  it('un miembro no gestiona el equipo', () => {
    expect(evaluateMemberUpdate(MEMBER, T_ADMIN)).toBe('FORBIDDEN')
  })
})

describe('eliminación de pertenencias', () => {
  it('el propietario elimina miembros y administradores', () => {
    expect(evaluateMemberRemoval(OWNER, T_MEMBER)).toBeNull()
    expect(evaluateMemberRemoval(OWNER, T_ADMIN)).toBeNull()
  })

  it('un administrador elimina miembros, no administradores', () => {
    expect(evaluateMemberRemoval(ADMIN, T_MEMBER)).toBeNull()
    expect(evaluateMemberRemoval(ADMIN, { orgRole: 'admin', userId: 'otro-admin' })).toBe('FORBIDDEN')
  })

  it('un miembro no elimina a nadie', () => {
    expect(evaluateMemberRemoval(MEMBER, T_MEMBER)).toBe('FORBIDDEN')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Capa 2 — INVARIANTES: se aplican también a platform_admin
// ═══════════════════════════════════════════════════════════════════════════

describe('invariante: nadie gestiona su propia fila', () => {
  it('ni el propietario, ni un administrador, ni platform_admin', () => {
    expect(evaluateMemberUpdate(ADMIN, { orgRole: 'admin', userId: 'u-admin' })).toBe('FORBIDDEN')
    expect(evaluateMemberUpdate(OWNER, { orgRole: 'owner', userId: 'u-owner' })).toBe('FORBIDDEN')
    expect(evaluateMemberUpdate(PLATAFORMA, { orgRole: 'member', userId: 'u-mira' })).toBe('FORBIDDEN')
    expect(evaluateMemberRemoval(PLATAFORMA, { orgRole: 'member', userId: 'u-mira' })).toBe('FORBIDDEN')
  })
})

describe('invariante: la fila del propietario es intocable', () => {
  it('ningún actor la modifica, platform_admin incluido', () => {
    expect(evaluateMemberUpdate(OWNER, T_OWNER)).toBe('FORBIDDEN')
    expect(evaluateMemberUpdate(ADMIN, T_OWNER)).toBe('FORBIDDEN')
    expect(evaluateMemberUpdate(PLATAFORMA, T_OWNER)).toBe('FORBIDDEN')
  })

  it('ningún actor la elimina, platform_admin incluido', () => {
    expect(evaluateMemberRemoval(OWNER, T_OWNER)).toBe('FORBIDDEN')
    expect(evaluateMemberRemoval(ADMIN, T_OWNER)).toBe('FORBIDDEN')
    expect(evaluateMemberRemoval(PLATAFORMA, T_OWNER)).toBe('FORBIDDEN')
  })
})

describe('invariante: como máximo un propietario por organización', () => {
  it('platform_admin NO crea un segundo propietario', () => {
    expect(evaluateOwnerCreation(PLATAFORMA, true)).toBe('FORBIDDEN')
  })

  it('platform_admin SÍ crea el primero si la organización no tiene ninguno', () => {
    expect(evaluateOwnerCreation(PLATAFORMA, false)).toBeNull()
  })

  it('un cliente no crea propietario ni siquiera en una organización huérfana', () => {
    expect(evaluateOwnerCreation(OWNER, false)).toBe('FORBIDDEN')
    expect(evaluateOwnerCreation(ADMIN, false)).toBe('FORBIDDEN')
    expect(evaluateOwnerCreation(MEMBER, false)).toBe('FORBIDDEN')
  })
})

describe('invariante: la organización nunca se queda sin propietario', () => {
  it('no se degrada al propietario', () => {
    expect(evaluateOwnerProtection(T_OWNER, { nuevoRol: 'admin' })).toBe('FORBIDDEN')
    expect(evaluateOwnerProtection(T_OWNER, { nuevoRol: 'member' })).toBe('FORBIDDEN')
  })

  it('no se desactiva su pertenencia', () => {
    expect(evaluateOwnerProtection(T_OWNER, { nuevoStatus: 'suspended' })).toBe('FORBIDDEN')
    expect(evaluateOwnerProtection(T_OWNER, { nuevoStatus: 'invited' })).toBe('FORBIDDEN')
  })

  it('no se elimina', () => {
    expect(evaluateOwnerProtection(T_OWNER, { eliminar: true })).toBe('FORBIDDEN')
  })

  it('sí se le pueden cambiar otras cosas manteniéndolo activo', () => {
    expect(evaluateOwnerProtection(T_OWNER, { nuevoRol: 'owner', nuevoStatus: 'active' })).toBeNull()
  })

  it('sobre un miembro o administrador no aplica', () => {
    expect(evaluateOwnerProtection(T_MEMBER, { eliminar: true })).toBeNull()
    expect(evaluateOwnerProtection(T_ADMIN, { nuevoStatus: 'suspended' })).toBeNull()
  })
})

describe('invariante: coherencia entre modelo canónico y legacy', () => {
  it('cada rol canónico tiene un único valor legacy admisible', () => {
    expect(LEGACY_ROLE_FOR.owner).toBe('client_owner')
    expect(LEGACY_ROLE_FOR.admin).toBe('client_member')
    expect(LEGACY_ROLE_FOR.member).toBe('client_member')
  })

  it('las combinaciones coherentes se aceptan', () => {
    expect(evaluateRolePairCoherence('owner', 'client_owner')).toBeNull()
    expect(evaluateRolePairCoherence('admin', 'client_member')).toBeNull()
    expect(evaluateRolePairCoherence('member', 'client_member')).toBeNull()
  })

  it('las incoherentes se rechazan, sea quien sea quien escriba', () => {
    // Es exactamente lo que hoy escribe `addOrganizationMember` desde /admin.
    expect(evaluateRolePairCoherence('member', 'client_owner')).toBe('INVALID_ROLE')
    expect(evaluateRolePairCoherence('owner', 'client_member')).toBe('INVALID_ROLE')
    expect(evaluateRolePairCoherence('admin', 'client_owner')).toBe('INVALID_ROLE')
  })

  it('un org_role desconocido o ausente se rechaza', () => {
    expect(evaluateRolePairCoherence('superadmin', 'client_member')).toBe('INVALID_ROLE')
    expect(evaluateRolePairCoherence(null, 'client_member')).toBe('INVALID_ROLE')
    expect(evaluateRolePairCoherence('member', null)).toBe('INVALID_ROLE')
  })
})

describe('invariante: identificadores estructurales inmutables', () => {
  const anterior = {
    id: 'm-1',
    organization_id: 'org-a',
    user_id: 'u-1',
    invited_by: 'u-admin',
    can_buy: false,
  }

  it.each(IMMUTABLE_MEMBERSHIP_COLUMNS)('%s no puede cambiar', (col) => {
    expect(evaluateStructuralImmutability(anterior, { [col]: 'otro-valor' })).toBe('FORBIDDEN')
  })

  it('las columnas gestionables sí pueden cambiar', () => {
    expect(evaluateStructuralImmutability(anterior, { can_buy: true })).toBeNull()
    expect(evaluateStructuralImmutability(anterior, { org_role: 'admin', status: 'suspended' })).toBeNull()
  })

  it('repetir el mismo valor no cuenta como cambio', () => {
    expect(evaluateStructuralImmutability(anterior, { organization_id: 'org-a' })).toBeNull()
  })
})

describe('invariante: techo comercial', () => {
  it('una organización compradora concede can_buy pero no can_sell', () => {
    expect(evaluateCapabilityAssignment({ commercialProfile: 'buyer' }, { canBuy: true })).toBeNull()
    expect(evaluateCapabilityAssignment({ commercialProfile: 'buyer' }, { canSell: true })).toBe('FORBIDDEN')
  })

  it('una organización vendedora concede can_sell pero no can_buy', () => {
    expect(evaluateCapabilityAssignment({ commercialProfile: 'seller' }, { canSell: true })).toBeNull()
    expect(evaluateCapabilityAssignment({ commercialProfile: 'seller' }, { canBuy: true })).toBe('FORBIDDEN')
  })

  it('buyer_seller concede ambas', () => {
    expect(
      evaluateCapabilityAssignment({ commercialProfile: 'buyer_seller' }, { canBuy: true, canSell: true }),
    ).toBeNull()
  })

  it('retirar capacidades siempre se permite', () => {
    expect(
      evaluateCapabilityAssignment({ commercialProfile: 'buyer' }, { canBuy: false, canSell: false }),
    ).toBeNull()
  })

  it('un perfil comercial desconocido no concede nada', () => {
    expect(evaluateCapabilityAssignment({ commercialProfile: null }, { canBuy: true })).toBe('FORBIDDEN')
    expect(evaluateCapabilityAssignment({ commercialProfile: null }, { canSell: true })).toBe('FORBIDDEN')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Columnas de organizations
// ═══════════════════════════════════════════════════════════════════════════

describe('columnas de organizations', () => {
  it('el propietario edita datos empresariales ordinarios', () => {
    for (const col of ['name', 'phone', 'email', 'website', 'city', 'address', 'cif_nif']) {
      expect(isOwnerEditableOrgColumn(col)).toBe(true)
    }
  })

  it('el propietario NO edita plan, suscripción, estado ni perfil comercial', () => {
    for (const col of PLATFORM_ONLY_ORG_COLUMNS) {
      expect(isOwnerEditableOrgColumn(col)).toBe(false)
    }
  })

  it('las dos listas son disjuntas', () => {
    const editables = new Set<string>(OWNER_EDITABLE_ORG_COLUMNS)
    for (const col of PLATFORM_ONLY_ORG_COLUMNS) {
      expect(editables.has(col)).toBe(false)
    }
  })

  it('una columna inventada no es editable', () => {
    expect(isOwnerEditableOrgColumn('is_superadmin')).toBe(false)
    expect(isOwnerEditableOrgColumn('')).toBe(false)
  })
})

describe('aislamiento entre organizaciones', () => {
  it('un usuario sin rol en la organización de destino no gestiona nada', () => {
    expect(evaluateMemberCreation(EXTERNO, 'member')).toBe('FORBIDDEN')
    expect(evaluateMemberUpdate(EXTERNO, T_MEMBER)).toBe('FORBIDDEN')
    expect(evaluateMemberRemoval(EXTERNO, T_MEMBER)).toBe('FORBIDDEN')
  })
})

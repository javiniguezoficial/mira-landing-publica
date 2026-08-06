// Administración de usuarios: autorización e invariantes (039).
//
// Estas reglas deciden quién puede sacar a alguien de una empresa, quién puede
// conceder permiso de compra y quién puede convertir a otra persona en
// administrador de MIRA. Se prueban sin red y sin base de datos, que es la
// única forma de cubrirlas exhaustivamente.
//
// La base de datos sigue siendo la autoridad (triggers de 021, 023 y 039).
// Lo que se fija aquí es que la interfaz deniegue LO MISMO, y antes.

import { describe, expect, it } from 'vitest'
import {
  ASSIGNABLE_MEMBERSHIP_STATUSES,
  ASSIGNABLE_ORG_ROLES,
  EDITABLE_PROFILE_FIELDS,
  LEGACY_ROLE_FOR_ASSIGNABLE,
  evaluateCapabilityCeiling,
  evaluateCapabilityChange,
  evaluateMembershipAssignment,
  evaluateMembershipRemoval,
  evaluateMembershipRoleChange,
  evaluateMembershipStatusChange,
  evaluatePlatformRoleChange,
  isEditableProfileField,
  normalizeAssignableMembershipStatus,
  normalizeAssignableOrgRole,
  normalizeAssignablePlatformRole,
  organizationAllows,
  pickEditableProfileFields,
  type AdminActor,
  type MembershipTarget,
  type OrganizationFacts,
} from './user-admin'

const ADMIN: AdminActor = { userId: 'admin-1', isPlatformAdmin: true }
const NO_ADMIN: AdminActor = { userId: 'ana', isPlatformAdmin: false }

const COMPRADORA: OrganizationFacts = { commercialProfile: 'buyer', hasOwner: true }
const SIN_OWNER: OrganizationFacts = { commercialProfile: 'buyer', hasOwner: false }
const AMBAS: OrganizationFacts = { commercialProfile: 'buyer_seller', hasOwner: true }

const MIEMBRO: MembershipTarget = { userId: 'jagoba', orgRole: 'member', status: 'active' }
const ADMIN_ORG: MembershipTarget = { userId: 'luis', orgRole: 'admin', status: 'active' }
const PROPIETARIO: MembershipTarget = { userId: 'ana', orgRole: 'owner', status: 'active' }

const SIN_CAPACIDADES = { canBuy: false, canSell: false }

// ═══════════════════════════════════════════════════════════════════════════
// Catálogos
// ═══════════════════════════════════════════════════════════════════════════

describe('valores admitidos', () => {
  it('los roles asignables son owner, admin y member', () => {
    expect([...ASSIGNABLE_ORG_ROLES]).toEqual(['owner', 'admin', 'member'])
  })

  // `invited` queda fuera: no hay flujo de invitación, así que dejar a alguien
  // invitado produciría una pertenencia que no da acceso y nadie completa.
  it('los estados asignables son solo active y suspended', () => {
    expect([...ASSIGNABLE_MEMBERSHIP_STATUSES]).toEqual(['active', 'suspended'])
  })

  it('cada rol canónico lleva su valor legacy obligatorio', () => {
    expect(LEGACY_ROLE_FOR_ASSIGNABLE.owner).toBe('client_owner')
    expect(LEGACY_ROLE_FOR_ASSIGNABLE.admin).toBe('client_member')
    expect(LEGACY_ROLE_FOR_ASSIGNABLE.member).toBe('client_member')
  })

  it('fail-closed: cualquier valor desconocido normaliza a null', () => {
    for (const raw of ['', 'client_owner', 'org_admin', 'OWNER', null, 7, {}]) {
      expect(normalizeAssignableOrgRole(raw), `${raw}`).toBeNull()
    }
    for (const raw of ['invited', 'activo', '', null]) {
      expect(normalizeAssignableMembershipStatus(raw), `${raw}`).toBeNull()
    }
    for (const raw of ['admin', 'client_member', '', null]) {
      expect(normalizeAssignablePlatformRole(raw), `${raw}`).toBeNull()
    }
  })

  it('los dos roles de plataforma sí se reconocen', () => {
    expect(normalizeAssignablePlatformRole('platform_admin')).toBe('platform_admin')
    expect(normalizeAssignablePlatformRole('user')).toBe('user')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Asignación
// ═══════════════════════════════════════════════════════════════════════════

describe('asignar a una organización', () => {
  it('un administrador de plataforma puede', () => {
    expect(
      evaluateMembershipAssignment(ADMIN, 'jagoba', 'member', COMPRADORA, SIN_CAPACIDADES),
    ).toBeNull()
  })

  it('quien NO es administrador de plataforma no puede', () => {
    expect(
      evaluateMembershipAssignment(NO_ADMIN, 'jagoba', 'member', COMPRADORA, SIN_CAPACIDADES),
    ).toBe('FORBIDDEN')
  })

  // La regla que impide que quien tiene el panel se conceda acceso a los datos
  // de un cliente.
  it('nadie se asigna a sí mismo', () => {
    expect(
      evaluateMembershipAssignment(ADMIN, ADMIN.userId, 'member', COMPRADORA, SIN_CAPACIDADES),
    ).toBe('FORBIDDEN')
  })

  it('no se crea un SEGUNDO propietario', () => {
    expect(
      evaluateMembershipAssignment(ADMIN, 'jagoba', 'owner', COMPRADORA, SIN_CAPACIDADES),
    ).toBe('FORBIDDEN')
  })

  // Caso real: «MIRA Pricing Technologies SL» existe sin propietario. Sin esta
  // excepción solo se podría arreglar con una conexión SQL directa.
  it('SÍ se crea el PRIMERO cuando la organización no tiene ninguno', () => {
    expect(
      evaluateMembershipAssignment(ADMIN, 'jagoba', 'owner', SIN_OWNER, SIN_CAPACIDADES),
    ).toBeNull()
  })

  it('no se concede una capacidad que la empresa no admite', () => {
    expect(
      evaluateMembershipAssignment(ADMIN, 'jagoba', 'member', COMPRADORA, {
        canBuy: false,
        canSell: true,
      }),
    ).toBe('FORBIDDEN')
  })

  it('sí se concede la que la empresa admite', () => {
    expect(
      evaluateMembershipAssignment(ADMIN, 'jagoba', 'member', COMPRADORA, {
        canBuy: true,
        canSell: false,
      }),
    ).toBeNull()
    expect(
      evaluateMembershipAssignment(ADMIN, 'jagoba', 'member', AMBAS, {
        canBuy: true,
        canSell: true,
      }),
    ).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Rol, estado, capacidades y retirada
// ═══════════════════════════════════════════════════════════════════════════

describe('cambio de rol en la organización', () => {
  it('un administrador de plataforma cambia a un miembro', () => {
    expect(evaluateMembershipRoleChange(ADMIN, MIEMBRO, 'admin', COMPRADORA)).toBeNull()
  })

  it('un cliente no cambia roles desde esta acción', () => {
    expect(evaluateMembershipRoleChange(NO_ADMIN, MIEMBRO, 'admin', COMPRADORA)).toBe('FORBIDDEN')
  })

  // Degradarlo dejaría la organización sin propietario.
  it('el propietario no cambia de rol', () => {
    expect(evaluateMembershipRoleChange(ADMIN, PROPIETARIO, 'member', COMPRADORA)).toBe('FORBIDDEN')
  })

  it('nadie modifica su propia pertenencia', () => {
    const propia: MembershipTarget = { userId: ADMIN.userId, orgRole: 'member', status: 'active' }
    expect(evaluateMembershipRoleChange(ADMIN, propia, 'admin', COMPRADORA)).toBe('FORBIDDEN')
  })

  it('no se asciende a propietario si ya hay uno', () => {
    expect(evaluateMembershipRoleChange(ADMIN, MIEMBRO, 'owner', COMPRADORA)).toBe('FORBIDDEN')
  })
})

describe('activar y desactivar la pertenencia', () => {
  it('se puede desactivar a un miembro', () => {
    expect(evaluateMembershipStatusChange(ADMIN, MIEMBRO, 'suspended')).toBeNull()
  })

  it('y volver a activarlo', () => {
    const suspendido: MembershipTarget = { ...MIEMBRO, status: 'suspended' }
    expect(evaluateMembershipStatusChange(ADMIN, suspendido, 'active')).toBeNull()
  })

  it('el propietario no se desactiva', () => {
    expect(evaluateMembershipStatusChange(ADMIN, PROPIETARIO, 'suspended')).toBe('FORBIDDEN')
  })

  it('…pero reactivar al propietario no es una degradación', () => {
    expect(evaluateMembershipStatusChange(ADMIN, PROPIETARIO, 'active')).toBeNull()
  })

  it('un cliente no cambia estados desde esta acción', () => {
    expect(evaluateMembershipStatusChange(NO_ADMIN, MIEMBRO, 'suspended')).toBe('FORBIDDEN')
  })
})

describe('capacidades comerciales', () => {
  it('el techo lo pone el perfil comercial de la empresa', () => {
    expect(evaluateCapabilityCeiling(COMPRADORA, { canBuy: true, canSell: false })).toBeNull()
    expect(evaluateCapabilityCeiling(COMPRADORA, { canBuy: false, canSell: true })).toBe('FORBIDDEN')
    expect(evaluateCapabilityCeiling(AMBAS, { canBuy: true, canSell: true })).toBeNull()
  })

  // Quitar permisos nunca puede quedar bloqueado por una restricción pensada
  // para no darlos de más.
  it('RETIRAR una capacidad siempre se permite', () => {
    const vendedora: OrganizationFacts = { commercialProfile: 'seller', hasOwner: true }
    expect(evaluateCapabilityCeiling(vendedora, SIN_CAPACIDADES)).toBeNull()
    expect(evaluateCapabilityCeiling({ commercialProfile: null, hasOwner: true }, SIN_CAPACIDADES)).toBeNull()
  })

  // A diferencia del rol, las capacidades del propietario SÍ se tocan: el
  // trigger de 023 solo protege su rol y su estado.
  it('las capacidades del propietario sí se pueden cambiar', () => {
    expect(
      evaluateCapabilityChange(ADMIN, PROPIETARIO, COMPRADORA, { canBuy: true, canSell: false }),
    ).toBeNull()
  })

  it('sobre uno mismo, no', () => {
    const propia: MembershipTarget = { userId: ADMIN.userId, orgRole: 'member', status: 'active' }
    expect(evaluateCapabilityChange(ADMIN, propia, COMPRADORA, SIN_CAPACIDADES)).toBe('FORBIDDEN')
  })

  it('`organizationAllows` responde por eje', () => {
    expect(organizationAllows('buyer', 'buy')).toBe(true)
    expect(organizationAllows('buyer', 'sell')).toBe(false)
    expect(organizationAllows('seller', 'sell')).toBe(true)
    expect(organizationAllows('buyer_seller', 'buy')).toBe(true)
    expect(organizationAllows('buyer_seller', 'sell')).toBe(true)
    expect(organizationAllows(null, 'buy')).toBe(false)
  })
})

describe('retirar de la organización', () => {
  it('se retira a un miembro', () => {
    expect(evaluateMembershipRemoval(ADMIN, MIEMBRO)).toBeNull()
  })

  it('se retira a un administrador de organización', () => {
    expect(evaluateMembershipRemoval(ADMIN, ADMIN_ORG)).toBeNull()
  })

  it('al propietario NO: la organización se quedaría sin ninguno', () => {
    expect(evaluateMembershipRemoval(ADMIN, PROPIETARIO)).toBe('FORBIDDEN')
  })

  it('ni a uno mismo', () => {
    const propia: MembershipTarget = { userId: ADMIN.userId, orgRole: 'member', status: 'active' }
    expect(evaluateMembershipRemoval(ADMIN, propia)).toBe('FORBIDDEN')
  })

  it('un cliente no retira a nadie desde esta acción', () => {
    expect(evaluateMembershipRemoval(NO_ADMIN, MIEMBRO)).toBe('FORBIDDEN')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Rol de PLATAFORMA
// ═══════════════════════════════════════════════════════════════════════════

describe('cambio del rol de plataforma', () => {
  const usuario = { userId: 'jagoba', currentRole: 'user' as const, isActive: true }
  const otroAdmin = { userId: 'demo', currentRole: 'platform_admin' as const, isActive: true }

  it('un administrador puede ascender a otra persona', () => {
    expect(evaluatePlatformRoleChange(ADMIN, usuario, 'platform_admin', 3)).toBeNull()
  })

  it('y degradar a otro administrador si quedan más', () => {
    expect(evaluatePlatformRoleChange(ADMIN, otroAdmin, 'user', 3)).toBeNull()
  })

  it('quien no es administrador no puede', () => {
    expect(evaluatePlatformRoleChange(NO_ADMIN, usuario, 'platform_admin', 3)).toBe('FORBIDDEN')
  })

  // Así el cambio siempre lo ha visto una segunda persona.
  it('NUNCA sobre uno mismo, ni para ascender ni para renunciar', () => {
    const propio = { userId: ADMIN.userId, currentRole: 'platform_admin' as const, isActive: true }
    expect(evaluatePlatformRoleChange(ADMIN, propio, 'user', 5)).toBe('FORBIDDEN')
    expect(evaluatePlatformRoleChange(ADMIN, propio, 'platform_admin', 5)).toBe('FORBIDDEN')
  })

  // Sin esto, el sistema se puede quedar sin nadie capaz de entrar en /admin y
  // recuperarlo exigiría una conexión SQL directa.
  it('no se degrada al ÚLTIMO administrador activo', () => {
    expect(evaluatePlatformRoleChange(ADMIN, otroAdmin, 'user', 1)).toBe('FORBIDDEN')
  })

  it('con dos administradores activos sí se puede degradar a uno', () => {
    expect(evaluatePlatformRoleChange(ADMIN, otroAdmin, 'user', 2)).toBeNull()
  })

  // Un administrador ya suspendido no cuenta como el último activo: degradarlo
  // no cambia cuántos pueden entrar.
  it('degradar a un administrador SUSPENDIDO no está limitado por el recuento', () => {
    const suspendido = { userId: 'demo', currentRole: 'platform_admin' as const, isActive: false }
    expect(evaluatePlatformRoleChange(ADMIN, suspendido, 'user', 1)).toBeNull()
  })

  it('ASCENDER nunca queda bloqueado por el recuento', () => {
    expect(evaluatePlatformRoleChange(ADMIN, usuario, 'platform_admin', 1)).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Campos editables del perfil
// ═══════════════════════════════════════════════════════════════════════════

describe('allowlist de campos del perfil', () => {
  // Los dos campos que el trigger de 021 protege NO pueden estar en un
  // formulario general: un cambio de teléfono y una concesión de administrador
  // no pueden compartir botón.
  it('ni `role` ni `status` son editables desde el formulario', () => {
    expect(isEditableProfileField('role')).toBe(false)
    expect(isEditableProfileField('status')).toBe(false)
    expect(EDITABLE_PROFILE_FIELDS as readonly string[]).not.toContain('role')
    expect(EDITABLE_PROFILE_FIELDS as readonly string[]).not.toContain('status')
  })

  it('el email tampoco: es la identidad de la cuenta', () => {
    expect(isEditableProfileField('email')).toBe(false)
  })

  it('sí lo son los datos personales y las preferencias', () => {
    for (const f of ['first_name', 'last_name', 'phone', 'preferred_locale']) {
      expect(isEditableProfileField(f), f).toBe(true)
    }
  })

  // REGRESIÓN de escalada de privilegios: aunque alguien añada `role` al cuerpo
  // de la petición, nunca llega a la sentencia UPDATE.
  it('`pickEditableProfileFields` descarta lo que no está en la lista', () => {
    const salida = pickEditableProfileFields({
      first_name: 'Ana',
      role: 'platform_admin',
      status: 'active',
      id: 'otro-usuario',
      email: 'nuevo@example.com',
    })
    expect(salida).toEqual({ first_name: 'Ana' })
    expect('role' in salida).toBe(false)
    expect('status' in salida).toBe(false)
    expect('id' in salida).toBe(false)
  })

  it('recorta espacios y convierte el vacío en null', () => {
    expect(pickEditableProfileFields({ first_name: '  Ana   María ' })).toEqual({
      first_name: 'Ana María',
    })
    expect(pickEditableProfileFields({ phone: '   ' })).toEqual({ phone: null })
    expect(pickEditableProfileFields({ phone: null })).toEqual({ phone: null })
  })

  it('ignora los campos que no vienen y los que no son texto', () => {
    expect(pickEditableProfileFields({})).toEqual({})
    expect(pickEditableProfileFields({ first_name: 42 })).toEqual({})
  })
})

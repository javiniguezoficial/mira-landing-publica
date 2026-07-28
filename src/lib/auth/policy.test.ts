import { describe, expect, it } from 'vitest'
import {
  adminDenialTarget,
  evaluateActiveMembership,
  evaluateActiveOrganization,
  evaluateActiveProfile,
  evaluateCapability,
  evaluateMembership,
  evaluateOrganizationRole,
  evaluatePlatformAdmin,
  evaluateSession,
} from './policy'
import type { AuthContext, AuthMembership } from './types'

function context(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    user: { id: 'user-1', email: 'ana@example.com' },
    platformRole: 'user',
    profileStatus: 'active',
    memberships: [],
    ...overrides,
  }
}

function membership(overrides: Partial<AuthMembership> = {}): AuthMembership {
  return {
    organizationId: 'org-a',
    organizationName: 'Acme',
    orgRole: 'member',
    membershipStatus: 'active',
    canBuy: false,
    canSell: false,
    joinedAt: '2026-01-01T00:00:00Z',
    organizationStatus: 'active',
    commercialProfile: 'buyer',
    ...overrides,
  }
}

describe('evaluateSession', () => {
  it('deniega sin contexto', () => {
    expect(evaluateSession(null)).toBe('UNAUTHENTICATED')
  })

  it('permite con contexto', () => {
    expect(evaluateSession(context())).toBeNull()
  })
})

describe('evaluatePlatformAdmin', () => {
  it('sin sesión devuelve UNAUTHENTICATED', () => {
    expect(evaluatePlatformAdmin(null)).toBe('UNAUTHENTICATED')
  })

  it('permite a platform_admin', () => {
    expect(evaluatePlatformAdmin(context({ platformRole: 'platform_admin' }))).toBeNull()
  })

  it('deniega a un usuario normal', () => {
    expect(evaluatePlatformAdmin(context({ platformRole: 'user' }))).toBe('FORBIDDEN')
  })

  it('un rol desconocido NO concede acceso — fail closed', () => {
    expect(evaluatePlatformAdmin(context({ platformRole: null }))).toBe('INVALID_ROLE')
  })

  it('no depende del estado del perfil en 6B.1', () => {
    // Los estados se aplican en 6B.5. Hasta entonces un perfil suspendido
    // conserva exactamente el comportamiento anterior al refactor.
    const suspendido = context({ platformRole: 'platform_admin', profileStatus: 'suspended' })
    expect(evaluatePlatformAdmin(suspendido)).toBeNull()
  })
})

describe('evaluateMembership', () => {
  it('deniega sin pertenencia', () => {
    expect(evaluateMembership(null)).toBe('NO_ORGANIZATION')
  })

  it('permite con pertenencia', () => {
    expect(evaluateMembership(membership())).toBeNull()
  })
})

describe('evaluateOrganizationRole', () => {
  it('sin pertenencia devuelve NO_ORGANIZATION', () => {
    expect(evaluateOrganizationRole(null, 'member')).toBe('NO_ORGANIZATION')
  })

  it('rol desconocido no concede nada', () => {
    expect(evaluateOrganizationRole(membership({ orgRole: null }), 'member')).toBe('INVALID_ROLE')
  })

  it('owner canónico satisface owner', () => {
    expect(evaluateOrganizationRole(membership({ orgRole: 'owner' }), 'owner')).toBeNull()
  })

  it('es jerárquico: owner satisface admin y member', () => {
    const owner = membership({ orgRole: 'owner' })
    expect(evaluateOrganizationRole(owner, 'admin')).toBeNull()
    expect(evaluateOrganizationRole(owner, 'member')).toBeNull()
  })

  it('admin satisface admin y member, pero no owner', () => {
    const admin = membership({ orgRole: 'admin' })
    expect(evaluateOrganizationRole(admin, 'admin')).toBeNull()
    expect(evaluateOrganizationRole(admin, 'member')).toBeNull()
    expect(evaluateOrganizationRole(admin, 'owner')).toBe('FORBIDDEN')
  })

  it('member solo satisface member', () => {
    const member = membership({ orgRole: 'member' })
    expect(evaluateOrganizationRole(member, 'member')).toBeNull()
    expect(evaluateOrganizationRole(member, 'admin')).toBe('FORBIDDEN')
    expect(evaluateOrganizationRole(member, 'owner')).toBe('FORBIDDEN')
  })
})

// ── Preparadas para bloques posteriores. Probadas, NO conectadas en 6B.1 ────

describe('evaluateActiveProfile (6B.5, no conectada)', () => {
  it('permite a un perfil activo', () => {
    expect(evaluateActiveProfile(context({ profileStatus: 'active' }))).toBeNull()
  })

  it.each(['pending', 'suspended', 'rejected'] as const)('deniega a un perfil %s', (estado) => {
    expect(evaluateActiveProfile(context({ profileStatus: estado }))).toBe('FORBIDDEN')
  })

  it('un estado desconocido deniega', () => {
    expect(evaluateActiveProfile(context({ profileStatus: null }))).toBe('FORBIDDEN')
  })

  it('sin sesión devuelve UNAUTHENTICATED', () => {
    expect(evaluateActiveProfile(null)).toBe('UNAUTHENTICATED')
  })
})

describe('evaluateActiveOrganization (6B.5, no conectada)', () => {
  it('permite si la organización está activa', () => {
    expect(evaluateActiveOrganization(membership({ organizationStatus: 'active' }))).toBeNull()
  })

  it.each(['pending', 'suspended', 'rejected'] as const)('deniega si está %s', (estado) => {
    expect(evaluateActiveOrganization(membership({ organizationStatus: estado }))).toBe('FORBIDDEN')
  })
})

describe('evaluateActiveMembership (6B.5, no conectada)', () => {
  it('permite si la pertenencia está activa', () => {
    expect(evaluateActiveMembership(membership({ membershipStatus: 'active' }))).toBeNull()
  })

  it('invited todavía no da acceso', () => {
    expect(evaluateActiveMembership(membership({ membershipStatus: 'invited' }))).toBe('FORBIDDEN')
  })

  it('suspended deniega', () => {
    expect(evaluateActiveMembership(membership({ membershipStatus: 'suspended' }))).toBe('FORBIDDEN')
  })
})

describe('evaluateCapability (6B.4, no conectada)', () => {
  it('can_buy=true en organización compradora permite comprar', () => {
    const m = membership({ canBuy: true, commercialProfile: 'buyer' })
    expect(evaluateCapability(m, 'buy')).toBeNull()
  })

  it('can_buy=false deniega comprar', () => {
    const m = membership({ canBuy: false, commercialProfile: 'buyer' })
    expect(evaluateCapability(m, 'buy')).toBe('FORBIDDEN')
  })

  it('can_sell=false deniega vender', () => {
    const m = membership({ canSell: false, commercialProfile: 'seller' })
    expect(evaluateCapability(m, 'sell')).toBe('FORBIDDEN')
  })

  it('el perfil comercial de la organización es el techo del miembro', () => {
    // El miembro tiene can_sell, pero su empresa solo compra.
    const m = membership({ canSell: true, commercialProfile: 'buyer' })
    expect(evaluateCapability(m, 'sell')).toBe('FORBIDDEN')
  })

  it('buyer_seller admite ambas capacidades', () => {
    const m = membership({ canBuy: true, canSell: true, commercialProfile: 'buyer_seller' })
    expect(evaluateCapability(m, 'buy')).toBeNull()
    expect(evaluateCapability(m, 'sell')).toBeNull()
  })

  it('un perfil comercial desconocido deniega ambas', () => {
    const m = membership({ canBuy: true, canSell: true, commercialProfile: null })
    expect(evaluateCapability(m, 'buy')).toBe('FORBIDDEN')
    expect(evaluateCapability(m, 'sell')).toBe('FORBIDDEN')
  })

  it('sin pertenencia devuelve NO_ORGANIZATION', () => {
    expect(evaluateCapability(null, 'buy')).toBe('NO_ORGANIZATION')
  })
})

// La misma decisión ('no eres administrador') se traduce a una respuesta
// distinta según dónde ocurra. Ninguna superficie hereda la de otra.
describe('adminDenialTarget — reparto por superficie', () => {
  it('la mayoría de acciones de administración vuelven al área de cliente', () => {
    expect(adminDenialTarget('redirect-dashboard')).toBe('/app/dashboard')
  })

  it('soporte y configuración vuelven al login', () => {
    expect(adminDenialTarget('redirect-login')).toBe('/login')
  })

  it('las acciones que informan en la interfaz lanzan en vez de navegar', () => {
    expect(adminDenialTarget('throw')).toBeNull()
  })

  it('una página nunca responde JSON: siempre hay destino salvo en modo throw', () => {
    const destinosDeNavegacion = (['redirect-dashboard', 'redirect-login'] as const).map(
      adminDenialTarget,
    )
    expect(destinosDeNavegacion.every((d) => typeof d === 'string' && d.startsWith('/'))).toBe(true)
  })
})

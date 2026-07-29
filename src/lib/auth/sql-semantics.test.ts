// Semántica esperada de las funciones SQL de autorización (Bloque 6B.2).
//
// ADVERTENCIA IMPORTANTE
// Estos tests NO prueban RLS. Prueban que la semántica que espera la aplicación
// coincide con la que implementan las migraciones 021 y 022, componiendo las
// funciones puras de `policy.ts`. Sirven para detectar una divergencia entre lo
// que el código asume y lo que la base de datos decide, no para sustituir la
// verificación real.
//
// La verificación real vive en:
//   supabase/checks/6B2_structural_check.sql     (estructura y grants)
//   supabase/checks/6B2_rls_behaviour_check.sql  (comportamiento, con ROLLBACK)
//
// Desde 6B.5 estas composiciones YA no viven solo aquí: `policy.ts` expone
// `evaluateOrganizationAccess` (is_org_member) y `evaluateCommercialAction`, y
// son las que usan los guards. Este fichero las conserva escritas a mano a
// propósito: si alguien relajara la implementación, la comparación seguiría
// fallando aquí en lugar de pasar por construcción.

import { describe, expect, it } from 'vitest'
import {
  evaluateActiveMembership,
  evaluateActiveOrganization,
  evaluateActiveProfile,
  evaluateCapability,
  evaluateOrganizationRole,
  evaluatePlatformAdmin,
  type CommercialCapability,
} from './policy'
import type { AuthContext, AuthMembership } from './types'

function contexto(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    user: { id: 'user-1', email: 'persona@example.com' },
    platformRole: 'user',
    profileStatus: 'active',
    memberships: [],
    ...overrides,
  }
}

function pertenencia(overrides: Partial<AuthMembership> = {}): AuthMembership {
  return {
    organizationId: 'org-acme',
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

// ── Espejo en TypeScript de cada función SQL ────────────────────────────────

/** is_platform_admin() — rol platform_admin Y perfil activo. */
function isPlatformAdmin(context: AuthContext | null): boolean {
  return evaluatePlatformAdmin(context) === null && evaluateActiveProfile(context) === null
}

/** is_org_member(uuid) — pertenencia activa Y organización activa. */
function isOrgMember(m: AuthMembership | null): boolean {
  return evaluateActiveMembership(m) === null && evaluateActiveOrganization(m) === null
}

/** is_org_owner(uuid) — lo anterior Y rol owner (canónico o legacy). */
function isOrgOwner(m: AuthMembership | null): boolean {
  return isOrgMember(m) && evaluateOrganizationRole(m, 'owner') === null
}

/** is_org_admin(uuid) — lo anterior Y rol owner o admin. */
function isOrgAdmin(m: AuthMembership | null): boolean {
  return isOrgMember(m) && evaluateOrganizationRole(m, 'admin') === null
}

/**
 * can_buy_in_org / can_sell_in_org — tal y como quedan tras la migración 025:
 * PERFIL activo Y pertenencia activa Y organización activa Y capacidad Y techo.
 *
 * El perfil se añade en 025. Antes, una cuenta suspendida conservaba sus
 * capacidades comerciales por acceso directo a PostgREST.
 */
function hasCapability(
  context: AuthContext | null,
  m: AuthMembership | null,
  cap: CommercialCapability,
): boolean {
  return (
    evaluateActiveProfile(context) === null && isOrgMember(m) && evaluateCapability(m, cap) === null
  )
}

// ── is_platform_admin() ─────────────────────────────────────────────────────

describe('is_platform_admin()', () => {
  it('platform_admin activo: sí', () => {
    expect(isPlatformAdmin(contexto({ platformRole: 'platform_admin', profileStatus: 'active' }))).toBe(true)
  })

  it('platform_admin SUSPENDIDO: no — suspender debe retirar permisos de verdad', () => {
    expect(isPlatformAdmin(contexto({ platformRole: 'platform_admin', profileStatus: 'suspended' }))).toBe(false)
  })

  it.each(['pending', 'rejected'] as const)('platform_admin %s: no', (estado) => {
    expect(isPlatformAdmin(contexto({ platformRole: 'platform_admin', profileStatus: estado }))).toBe(false)
  })

  it('usuario normal activo: no', () => {
    expect(isPlatformAdmin(contexto({ platformRole: 'user', profileStatus: 'active' }))).toBe(false)
  })

  it('perfil desconocido o ausente: no', () => {
    expect(isPlatformAdmin(contexto({ platformRole: null }))).toBe(false)
    expect(isPlatformAdmin(contexto({ platformRole: 'platform_admin', profileStatus: null }))).toBe(false)
    expect(isPlatformAdmin(null)).toBe(false)
  })
})

// ── is_org_member() ─────────────────────────────────────────────────────────

describe('is_org_member()', () => {
  it('pertenencia activa en organización activa: sí', () => {
    expect(isOrgMember(pertenencia())).toBe(true)
  })

  it('pertenencia invited: no — la invitación se acepta en 6C', () => {
    expect(isOrgMember(pertenencia({ membershipStatus: 'invited' }))).toBe(false)
  })

  it('pertenencia suspended: no', () => {
    expect(isOrgMember(pertenencia({ membershipStatus: 'suspended' }))).toBe(false)
  })

  it.each(['pending', 'suspended', 'rejected'] as const)(
    'organización %s invalida la pertenencia aunque el miembro esté activo',
    (estado) => {
      expect(isOrgMember(pertenencia({ organizationStatus: estado }))).toBe(false)
    },
  )

  it('sin pertenencia: no', () => {
    expect(isOrgMember(null)).toBe(false)
  })
})

// ── is_org_owner() e is_org_admin() ─────────────────────────────────────────

describe('is_org_owner() e is_org_admin()', () => {
  it('owner canónico satisface ambas', () => {
    const m = pertenencia({ orgRole: 'owner' })
    expect(isOrgOwner(m)).toBe(true)
    expect(isOrgAdmin(m)).toBe(true)
  })

  it('owner legacy (client_owner) sigue siendo compatible', () => {
    // `normalizeOrganizationRole` traduce 'client_owner' a 'owner', igual que
    // hace el fallback `or om.role = 'client_owner'` en SQL.
    const m = pertenencia({ orgRole: 'owner' })
    expect(isOrgOwner(m)).toBe(true)
  })

  it('admin satisface is_org_admin pero NO is_org_owner', () => {
    const m = pertenencia({ orgRole: 'admin' })
    expect(isOrgAdmin(m)).toBe(true)
    expect(isOrgOwner(m)).toBe(false)
  })

  it('member no satisface ninguna de las dos', () => {
    const m = pertenencia({ orgRole: 'member' })
    expect(isOrgAdmin(m)).toBe(false)
    expect(isOrgOwner(m)).toBe(false)
  })

  it('client_member legacy NO asciende a administrador', () => {
    // El modelo antiguo solo distinguía propietario y miembro: ascender a
    // client_member inventaría un permiso que nunca tuvo.
    const m = pertenencia({ orgRole: 'member' })
    expect(isOrgAdmin(m)).toBe(false)
  })

  it('un owner de organización suspendida pierde ambas', () => {
    const m = pertenencia({ orgRole: 'owner', organizationStatus: 'suspended' })
    expect(isOrgOwner(m)).toBe(false)
    expect(isOrgAdmin(m)).toBe(false)
  })

  it('un owner con pertenencia suspendida pierde ambas', () => {
    const m = pertenencia({ orgRole: 'owner', membershipStatus: 'suspended' })
    expect(isOrgOwner(m)).toBe(false)
  })

  it('un rol desconocido no concede nada', () => {
    const m = pertenencia({ orgRole: null })
    expect(isOrgOwner(m)).toBe(false)
    expect(isOrgAdmin(m)).toBe(false)
  })
})

// ── can_buy_in_org() y can_sell_in_org() ────────────────────────────────────

describe('can_buy_in_org()', () => {
  it('buyer con can_buy=true: sí — es la configuración real de hoy', () => {
    expect(hasCapability(contexto(), pertenencia({ canBuy: true, commercialProfile: 'buyer' }), 'buy')).toBe(true)
  })

  it('buyer_seller con can_buy=true: sí', () => {
    expect(hasCapability(contexto(), pertenencia({ canBuy: true, commercialProfile: 'buyer_seller' }), 'buy')).toBe(true)
  })

  it('seller con can_buy=true: NO — el perfil comercial es el techo', () => {
    expect(hasCapability(contexto(), pertenencia({ canBuy: true, commercialProfile: 'seller' }), 'buy')).toBe(false)
  })

  it('can_buy=false: no', () => {
    expect(hasCapability(contexto(), pertenencia({ canBuy: false, commercialProfile: 'buyer' }), 'buy')).toBe(false)
  })

  it('la pertenencia suspendida anula la capacidad', () => {
    const m = pertenencia({ canBuy: true, commercialProfile: 'buyer', membershipStatus: 'suspended' })
    expect(hasCapability(contexto(), m, 'buy')).toBe(false)
  })

  it('la organización suspendida anula la capacidad', () => {
    const m = pertenencia({ canBuy: true, commercialProfile: 'buyer', organizationStatus: 'suspended' })
    expect(hasCapability(contexto(), m, 'buy')).toBe(false)
  })
})

describe('can_sell_in_org()', () => {
  it('seller con can_sell=true: sí', () => {
    expect(hasCapability(contexto(), pertenencia({ canSell: true, commercialProfile: 'seller' }), 'sell')).toBe(true)
  })

  it('buyer_seller con can_sell=true: sí', () => {
    expect(hasCapability(contexto(), pertenencia({ canSell: true, commercialProfile: 'buyer_seller' }), 'sell')).toBe(true)
  })

  it('buyer con can_sell=true: NO — el perfil comercial es el techo', () => {
    expect(hasCapability(contexto(), pertenencia({ canSell: true, commercialProfile: 'buyer' }), 'sell')).toBe(false)
  })

  it('can_sell=false: no', () => {
    expect(hasCapability(contexto(), pertenencia({ canSell: false, commercialProfile: 'seller' }), 'sell')).toBe(false)
  })

  it('un perfil comercial desconocido no concede ninguna capacidad', () => {
    const m = pertenencia({ canBuy: true, canSell: true, commercialProfile: null })
    expect(hasCapability(contexto(), m, 'buy')).toBe(false)
    expect(hasCapability(contexto(), m, 'sell')).toBe(false)
  })
})

// ── Los administradores de plataforma no heredan permisos organizativos ─────

describe('platform_admin sin pertenencia', () => {
  const admin = contexto({ platformRole: 'platform_admin', profileStatus: 'active', memberships: [] })

  it('es administrador de plataforma', () => {
    expect(isPlatformAdmin(admin)).toBe(true)
  })

  it('pero NO es miembro, ni compra, ni vende en ninguna organización', () => {
    // Estas funciones evalúan pertenencias reales. La administración global
    // depende exclusivamente de is_platform_admin().
    expect(isOrgMember(null)).toBe(false)
    expect(isOrgOwner(null)).toBe(false)
    expect(isOrgAdmin(null)).toBe(false)
    expect(hasCapability(contexto(), null, 'buy')).toBe(false)
    expect(hasCapability(contexto(), null, 'sell')).toBe(false)
  })
})

// ── 025: el perfil suspendido pierde las capacidades comerciales ────────────
//
// Antes de 025, `can_buy_in_org()` no consultaba `profiles` en absoluto. Una
// cuenta suspendida con pertenencia y organización activas conservaba `can_buy`
// y podía crear cotizaciones —y cancelar las publicadas— por PostgREST directo.
// Verificado en remoto con ROLLBACK antes y después del cuerpo propuesto.

describe('025 · profiles.status en las capacidades comerciales', () => {
  const compradora = pertenencia({ canBuy: true, commercialProfile: 'buyer' })
  const vendedora = pertenencia({ canSell: true, commercialProfile: 'seller' })

  it('perfil activo: la capacidad se conserva — Ana no se ve afectada', () => {
    expect(hasCapability(contexto(), compradora, 'buy')).toBe(true)
    expect(hasCapability(contexto(), vendedora, 'sell')).toBe(true)
  })

  it.each(['suspended', 'pending', 'rejected'] as const)(
    'perfil %s: pierde compra y venta',
    (estado) => {
      expect(hasCapability(contexto({ profileStatus: estado }), compradora, 'buy')).toBe(false)
      expect(hasCapability(contexto({ profileStatus: estado }), vendedora, 'sell')).toBe(false)
    },
  )

  it('un estado de perfil desconocido no se asume activo', () => {
    expect(hasCapability(contexto({ profileStatus: null }), compradora, 'buy')).toBe(false)
  })

  it('sin sesión no hay capacidad', () => {
    expect(hasCapability(null, compradora, 'buy')).toBe(false)
  })

  it('las tres suspensiones son independientes: cualquiera basta para denegar', () => {
    expect(hasCapability(contexto({ profileStatus: 'suspended' }), compradora, 'buy')).toBe(false)
    expect(
      hasCapability(contexto(), pertenencia({ canBuy: true, commercialProfile: 'buyer', membershipStatus: 'suspended' }), 'buy'),
    ).toBe(false)
    expect(
      hasCapability(contexto(), pertenencia({ canBuy: true, commercialProfile: 'buyer', organizationStatus: 'suspended' }), 'buy'),
    ).toBe(false)
  })

  it('la LECTURA no cambia: is_org_member sigue sin mirar el perfil', () => {
    // Decisión explícita de 6B.5, documentada en la cabecera de 025: suspender
    // una cuenta le retira las acciones comerciales, no el histórico de su
    // organización. Cambiar eso afectaría a rfqs, respuestas, perfiles y
    // organizaciones, y merece su propio bloque.
    expect(isOrgMember(pertenencia())).toBe(true)
    expect(hasCapability(contexto({ profileStatus: 'suspended' }), compradora, 'buy')).toBe(false)
  })
})

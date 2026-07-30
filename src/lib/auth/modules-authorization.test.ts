// Autorización con módulos por organización (Fase 1.4).
//
// ADVERTENCIA, la misma que en `sql-semantics.test.ts`: esto NO prueba RLS.
// Prueba que la semántica que asume la aplicación coincide con la que impone la
// migración 027, componiendo las funciones puras de `policy.ts` y `rfq.ts`.
// La verificación real contra la base de datos, con ROLLBACK, vive en
// `supabase/checks/027_modules_check.sql`.
//
// Lo que se fija aquí, y que es el corazón del bloque: MÓDULO y CAPACIDAD son
// ejes independientes. Un miembro con `can_buy = true` en una organización con
// `quotes = false` no opera, y la razón que se le devuelve es `MODULE_DISABLED`,
// no `FORBIDDEN`.

import { describe, expect, it } from 'vitest'
import {
  evaluateCapability,
  evaluateOrganizationAccess,
  evaluateOrganizationModule,
} from './policy'
import {
  evaluateRfqCreation,
  evaluateRfqManagement,
  evaluateRfqVisibility,
  mensajeDenegacionRfq,
  RFQ_MESSAGES,
} from './rfq'
import { DEFAULT_ORGANIZATION_MODULES, type OrganizationModules } from './modules'
import type { AuthMembership } from './types'

const ORG = 'org-acme'

function pertenencia(overrides: Partial<AuthMembership> = {}): AuthMembership {
  return {
    organizationId: ORG,
    organizationName: 'Acme',
    orgRole: 'member',
    membershipStatus: 'active',
    canBuy: true,
    canSell: false,
    joinedAt: '2026-01-01T00:00:00Z',
    organizationStatus: 'active',
    commercialProfile: 'buyer',
    ...overrides,
    modules: overrides.modules ?? { ...DEFAULT_ORGANIZATION_MODULES },
  }
}

function conModulos(modules: Partial<OrganizationModules>): AuthMembership {
  return pertenencia({ modules: { ...DEFAULT_ORGANIZATION_MODULES, ...modules } })
}

const cotizacion = { organizationId: ORG, createdBy: 'u-1', status: 'draft' }

// ═══════════════════════════════════════════════════════════════════════════
// org_module_enabled(uuid, text)
// ═══════════════════════════════════════════════════════════════════════════

describe('org_module_enabled() — espejo en TypeScript', () => {
  it('módulos activos por defecto: concede', () => {
    expect(evaluateOrganizationModule(pertenencia(), 'markets')).toBeNull()
    expect(evaluateOrganizationModule(pertenencia(), 'quotes')).toBeNull()
  })

  it('módulo conocido desactivado: MODULE_DISABLED', () => {
    expect(evaluateOrganizationModule(conModulos({ quotes: false }), 'quotes')).toBe(
      'MODULE_DISABLED',
    )
    expect(evaluateOrganizationModule(conModulos({ markets: false }), 'markets')).toBe(
      'MODULE_DISABLED',
    )
  })

  it('apagar un módulo NO afecta al otro', () => {
    const soloMercados = conModulos({ quotes: false })
    expect(evaluateOrganizationModule(soloMercados, 'markets')).toBeNull()

    const soloCotizaciones = conModulos({ markets: false })
    expect(evaluateOrganizationModule(soloCotizaciones, 'quotes')).toBeNull()
  })

  it('sin pertenencia: NO_ORGANIZATION, no MODULE_DISABLED', () => {
    // De una organización a la que no perteneces no se informa de su
    // configuración comercial.
    expect(evaluateOrganizationModule(null, 'quotes')).toBe('NO_ORGANIZATION')
  })

  it('unos módulos corruptos deniegan — fail-closed en la comprobación', () => {
    const rota = pertenencia()
    // Simula lo que llegaría si alguien esquivara el parser.
    ;(rota as { modules: unknown }).modules = null
    expect(evaluateOrganizationModule(rota, 'quotes')).toBe('MODULE_DISABLED')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Los tres ejes no se contaminan
// ═══════════════════════════════════════════════════════════════════════════

describe('módulo y capacidad son ejes independientes', () => {
  it('el módulo apagado NO toca `can_buy`: la capacidad personal sigue intacta', () => {
    const m = conModulos({ quotes: false })
    // Este es el punto que evita que apagar un módulo destruya configuración:
    // volver a encenderlo devuelve exactamente el estado anterior.
    expect(m.canBuy).toBe(true)
    expect(evaluateCapability(m, 'buy')).toBeNull()
    expect(evaluateOrganizationAccess(m)).toBeNull()
  })

  it('sin `can_buy` pero con módulo activo, el motivo es FORBIDDEN, no el módulo', () => {
    const m = pertenencia({ canBuy: false })
    expect(evaluateOrganizationModule(m, 'quotes')).toBeNull()
    expect(evaluateCapability(m, 'buy')).toBe('FORBIDDEN')
  })

  it('el módulo apagado NO retira la pertenencia a la organización', () => {
    expect(evaluateOrganizationAccess(conModulos({ quotes: false }))).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Cotizaciones: bloqueo completo con quotes = false
// ═══════════════════════════════════════════════════════════════════════════

describe('quotes = false bloquea toda la superficie de cotizaciones', () => {
  const sinModulo = conModulos({ quotes: false })

  it('no se puede CREAR aunque haya can_buy y perfil comprador', () => {
    expect(evaluateRfqCreation(sinModulo)).toBe('MODULE_DISABLED')
  })

  it('no se puede CONSULTAR el histórico', () => {
    expect(evaluateRfqVisibility(sinModulo, { organizationId: ORG })).toBe('MODULE_DISABLED')
  })

  it('no se puede GESTIONAR: ni editar, ni publicar, ni cancelar', () => {
    const actor = { userId: 'u-1', orgRole: 'member' as const }
    expect(evaluateRfqManagement(actor, cotizacion, sinModulo)).toBe('MODULE_DISABLED')
  })

  it('tampoco el OWNER de la organización: el módulo no es un permiso que él conceda', () => {
    const owner = conModulos({ quotes: false })
    owner.orgRole = 'owner'
    const actor = { userId: 'u-owner', orgRole: 'owner' as const }
    expect(evaluateRfqCreation(owner)).toBe('MODULE_DISABLED')
    // Cotización creada por OTRA persona: el owner la gestionaría de tener módulo.
    expect(evaluateRfqManagement(actor, cotizacion, owner)).toBe('MODULE_DISABLED')
  })

  it('tampoco un ADMIN de la organización', () => {
    const admin = conModulos({ quotes: false })
    admin.orgRole = 'admin'
    const actor = { userId: 'u-admin', orgRole: 'admin' as const }
    expect(evaluateRfqManagement(actor, cotizacion, admin)).toBe('MODULE_DISABLED')
  })

  it('con el módulo ACTIVO todo vuelve a funcionar igual que antes de 1.4', () => {
    const m = pertenencia()
    const actor = { userId: 'u-1', orgRole: 'member' as const }
    expect(evaluateRfqCreation(m)).toBeNull()
    expect(evaluateRfqVisibility(m, { organizationId: ORG })).toBeNull()
    expect(evaluateRfqManagement(actor, cotizacion, m)).toBeNull()
  })

  it('otra organización con el módulo activo no se ve afectada', () => {
    const otra = pertenencia({ organizationId: 'org-otra' })
    expect(evaluateRfqCreation(otra)).toBeNull()
    expect(evaluateRfqVisibility(otra, { organizationId: 'org-otra' })).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Bypass administrativo — INTENCIONAL, documentado en 027
// ═══════════════════════════════════════════════════════════════════════════

describe('platform_admin conserva el acceso administrativo', () => {
  it('gestiona cotizaciones de una organización con el módulo apagado', () => {
    // Espejo de `admin_update_rfqs`, que sigue dependiendo solo de
    // `is_platform_admin()`. Quien apaga el módulo tiene que poder seguir
    // dando soporte y reactivarlo.
    const actor = { userId: 'u-admin', orgRole: null, isPlatformAdmin: true }
    expect(evaluateRfqManagement(actor, cotizacion, conModulos({ quotes: false }))).toBeNull()
    expect(evaluateRfqManagement(actor, cotizacion, null)).toBeNull()
  })

  it('pero el bypass es del ACTOR de plataforma, no de la organización', () => {
    // Sin la marca de platform_admin, la misma pertenencia sigue bloqueada.
    const actor = { userId: 'u-admin', orgRole: null, isPlatformAdmin: false }
    expect(evaluateRfqManagement(actor, cotizacion, conModulos({ quotes: false }))).toBe(
      'MODULE_DISABLED',
    )
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Mensajes: falta de permisos ≠ módulo deshabilitado
// ═══════════════════════════════════════════════════════════════════════════

describe('mensajeDenegacionRfq distingue los tres motivos', () => {
  it('módulo apagado: habla de la organización, no de permisos', () => {
    const mensaje = mensajeDenegacionRfq('MODULE_DISABLED')
    expect(mensaje).toBe(RFQ_MESSAGES.moduloDeshabilitado)
    expect(mensaje).toContain('deshabilitado para tu organización')
    expect(mensaje).not.toContain('permisos')
  })

  it('sin organización: mensaje propio', () => {
    expect(mensajeDenegacionRfq('NO_ORGANIZATION')).toBe(RFQ_MESSAGES.sinOrganizacion)
  })

  it('sin capacidad: sigue siendo el mensaje de permisos de siempre', () => {
    expect(mensajeDenegacionRfq('FORBIDDEN')).toBe(RFQ_MESSAGES.sinCapacidadEnOrganizacion)
    expect(mensajeDenegacionRfq('FORBIDDEN')).toContain('permisos')
  })

  it('los dos mensajes son distintos — es justo lo que 1.4 exige distinguir', () => {
    expect(mensajeDenegacionRfq('MODULE_DISABLED')).not.toBe(
      mensajeDenegacionRfq('FORBIDDEN'),
    )
  })
})

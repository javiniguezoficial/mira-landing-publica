// Compatibilidad del RFQ actual con el perfil comercial (Bloque 1).
//
// El bloque NO implementa el workflow de vendedor: eso es posterior. Lo que
// fijan estos tests es que abrir el perfil comercial —hasta ahora todas las
// organizaciones eran `buyer` por el default de la columna— no cambia NADA de lo
// que el RFQ hace hoy, y muy en particular que `can_sell` no abre ninguna
// puerta que antes estuviera cerrada.
//
// Espejo de lo que impone SQL:
//
//   · `org_member_insert_rfqs`  → can_buy_in_org(organization_id) AND …
//   · `org_member_update_rfqs`  → can_buy_in_org(organization_id) AND …
//   · `org_member_select_rfqs`  → is_org_member(organization_id) AND módulo
//
// Ninguna policy de `rfqs` menciona `can_sell_in_org()`. La función existe y
// está probada, pero hoy no concede acceso a nada: ese es exactamente el estado
// que este archivo congela hasta que llegue el bloque del portal de vendedor.

import { describe, expect, it } from 'vitest'
import {
  evaluateRfqCreation,
  evaluateRfqManagement,
  evaluateRfqVisibility,
  type RfqActor,
  type RfqRef,
} from './rfq'
import type { AuthMembership } from './types'
import type { CommercialProfile } from '@/lib/identity'

function membership(over: Partial<AuthMembership> = {}): AuthMembership {
  return {
    organizationId: 'org-1',
    organizationName: 'Acme',
    orgRole: 'member',
    membershipStatus: 'active',
    canBuy: false,
    canSell: false,
    joinedAt: '2026-01-01',
    organizationStatus: 'active',
    commercialProfile: 'buyer',
    modules: { markets: true, quotes: true },
    ...over,
  }
}

const RFQ_PROPIA: RfqRef = { organizationId: 'org-1', createdBy: 'u-1', status: 'draft' }
const ACTOR: RfqActor = { userId: 'u-1', orgRole: 'member' }

// ═══════════════════════════════════════════════════════════════════════════
// Lo que ya funcionaba debe seguir funcionando
// ═══════════════════════════════════════════════════════════════════════════

describe('comprador con can_buy sigue creando RFQ', () => {
  it('organización buyer + can_buy → puede crear', () => {
    const m = membership({ commercialProfile: 'buyer', canBuy: true })
    expect(evaluateRfqCreation(m)).toBeNull()
  })

  it('organización buyer_seller + can_buy → puede crear', () => {
    const m = membership({ commercialProfile: 'buyer_seller', canBuy: true })
    expect(evaluateRfqCreation(m)).toBeNull()
  })

  it('y puede gestionar su propia cotización', () => {
    const m = membership({ commercialProfile: 'buyer_seller', canBuy: true })
    expect(evaluateRfqManagement(ACTOR, RFQ_PROPIA, m)).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Lo que NO debe abrirse
// ═══════════════════════════════════════════════════════════════════════════

describe('sin can_buy no se crea ninguna RFQ', () => {
  it('aunque la organización sea compradora', () => {
    const m = membership({ commercialProfile: 'buyer', canBuy: false })
    expect(evaluateRfqCreation(m)).toBe('FORBIDDEN')
    expect(evaluateRfqManagement(ACTOR, RFQ_PROPIA, m)).toBe('FORBIDDEN')
  })

  it('aunque sea administrador de su organización', () => {
    const m = membership({ commercialProfile: 'buyer', canBuy: false, orgRole: 'admin' })
    const actorAdmin: RfqActor = { userId: 'u-1', orgRole: 'admin' }
    expect(evaluateRfqCreation(m)).toBe('FORBIDDEN')
    expect(evaluateRfqManagement(actorAdmin, RFQ_PROPIA, m)).toBe('FORBIDDEN')
  })

  it('aunque sea el propietario', () => {
    const m = membership({ commercialProfile: 'buyer', canBuy: false, orgRole: 'owner' })
    const actorOwner: RfqActor = { userId: 'u-1', orgRole: 'owner' }
    expect(evaluateRfqCreation(m)).toBe('FORBIDDEN')
    expect(evaluateRfqManagement(actorOwner, RFQ_PROPIA, m)).toBe('FORBIDDEN')
  })
})

describe('una organización seller NO obtiene permisos de comprador', () => {
  it('ni con can_buy marcado en la pertenencia', () => {
    const m = membership({ commercialProfile: 'seller', canBuy: true })
    expect(evaluateRfqCreation(m)).toBe('FORBIDDEN')
    expect(evaluateRfqManagement(ACTOR, RFQ_PROPIA, m)).toBe('FORBIDDEN')
  })

  it('ni con las dos capacidades marcadas', () => {
    const m = membership({ commercialProfile: 'seller', canBuy: true, canSell: true })
    expect(evaluateRfqCreation(m)).toBe('FORBIDDEN')
  })
})

describe('can_sell TODAVÍA no concede nada en RFQ', () => {
  it('vender no habilita crear', () => {
    const m = membership({ commercialProfile: 'seller', canSell: true })
    expect(evaluateRfqCreation(m)).toBe('FORBIDDEN')
  })

  it('vender no habilita gestionar', () => {
    const m = membership({ commercialProfile: 'buyer_seller', canSell: true, canBuy: false })
    expect(evaluateRfqManagement(ACTOR, RFQ_PROPIA, m)).toBe('FORBIDDEN')
  })

  it('vender no da acceso a la RFQ de OTRO cliente', () => {
    // El caso que el bloque posterior tendrá que abrir de forma explícita. Hoy
    // debe seguir cerrado: un vendedor no ve las solicitudes de nadie.
    const vendedor = membership({
      organizationId: 'org-vendedora',
      commercialProfile: 'seller',
      canSell: true,
    })
    const rfqAjena: RfqRef = { organizationId: 'org-compradora', createdBy: 'u-9', status: 'open' }

    expect(evaluateRfqVisibility(vendedor, rfqAjena)).toBe('FORBIDDEN')
    expect(evaluateRfqManagement({ userId: 'u-v', orgRole: 'member' }, rfqAjena, vendedor)).toBe(
      'FORBIDDEN',
    )
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Aislamiento entre organizaciones
// ═══════════════════════════════════════════════════════════════════════════

describe('aislamiento multi-tenant', () => {
  const PERFILES: CommercialProfile[] = ['buyer', 'seller', 'buyer_seller']

  it('ningún perfil comercial permite ver la RFQ de otra organización', () => {
    const rfqAjena: RfqRef = { organizationId: 'org-ajena', createdBy: 'u-9', status: 'open' }

    for (const perfil of PERFILES) {
      const m = membership({
        organizationId: 'org-1',
        commercialProfile: perfil,
        canBuy: true,
        canSell: true,
      })
      expect(evaluateRfqVisibility(m, rfqAjena)).toBe('FORBIDDEN')
      expect(evaluateRfqManagement(ACTOR, rfqAjena, m)).toBe('FORBIDDEN')
    }
  })

  it('ser propietario o administrador tampoco cruza la frontera', () => {
    const rfqAjena: RfqRef = { organizationId: 'org-ajena', createdBy: 'u-9', status: 'draft' }

    for (const rol of ['owner', 'admin'] as const) {
      const m = membership({ orgRole: rol, commercialProfile: 'buyer_seller', canBuy: true })
      expect(evaluateRfqManagement({ userId: 'u-1', orgRole: rol }, rfqAjena, m)).toBe('FORBIDDEN')
      expect(evaluateRfqVisibility(m, rfqAjena)).toBe('FORBIDDEN')
    }
  })

  it('sin pertenencia no se ve nada', () => {
    expect(evaluateRfqVisibility(null, RFQ_PROPIA)).toBe('NO_ORGANIZATION')
    expect(evaluateRfqCreation(null)).toBe('NO_ORGANIZATION')
    expect(evaluateRfqManagement(ACTOR, RFQ_PROPIA, null)).toBe('FORBIDDEN')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// El módulo sigue dominando sobre la capacidad
// ═══════════════════════════════════════════════════════════════════════════

describe('el módulo de cotizaciones manda sobre el perfil comercial', () => {
  it('con el módulo apagado no se crea ni se ve, tenga el perfil que tenga', () => {
    for (const perfil of ['buyer', 'seller', 'buyer_seller'] as const) {
      const m = membership({
        commercialProfile: perfil,
        canBuy: true,
        canSell: true,
        modules: { markets: true, quotes: false },
      })
      expect(evaluateRfqCreation(m)).toBe('MODULE_DISABLED')
      expect(evaluateRfqVisibility(m, RFQ_PROPIA)).toBe('MODULE_DISABLED')
    }
  })
})

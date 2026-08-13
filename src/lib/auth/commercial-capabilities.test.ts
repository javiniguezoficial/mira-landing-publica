// Perfil comercial de la organización como TECHO de las capacidades (Bloque 1).
//
// Estos tests NO prueban RLS. Fijan la semántica que la interfaz debe anticipar
// y que imponen de verdad, en la base de datos:
//
//   · el CHECK `organizations_commercial_profile_check`;
//   · el trigger `enforce_membership_rules()` (023), que rechaza `can_buy` sin
//     perfil comprador y `can_sell` sin perfil vendedor con `23514`;
//   · `can_buy_in_org()` / `can_sell_in_org()`, que exigen LAS DOS cosas —la
//     marca del miembro y el perfil de la empresa— antes de conceder nada.
//
// El caso que motiva el bloque: toda organización nacía con el default `buyer`
// porque ningún formulario escribía la columna, así que la casilla «Vender»
// salía deshabilitada para siempre y el cliente lo leía como un fallo de
// permisos. La columna y los triggers llevaban funcionando desde 019.

import { describe, expect, it } from 'vitest'
import {
  capabilitiesExceedProfile,
  clampCapabilitiesToProfile,
  evaluateCapabilityCeiling,
  organizationAllows,
} from './user-admin'
import { capabilityCeilingReason, evaluateCapabilityAssignment } from './team'
import { evaluateCapability } from './policy'
import type { AuthMembership } from './types'
import type { CommercialProfile } from '@/lib/identity'

const PERFILES: CommercialProfile[] = ['buyer', 'seller', 'buyer_seller']

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

// ═══════════════════════════════════════════════════════════════════════════
// El techo, perfil por perfil
// ═══════════════════════════════════════════════════════════════════════════

describe('organización buyer', () => {
  it('admite comprar y NO admite vender', () => {
    expect(organizationAllows('buyer', 'buy')).toBe(true)
    expect(organizationAllows('buyer', 'sell')).toBe(false)
  })

  it('concede can_buy y rechaza can_sell', () => {
    expect(evaluateCapabilityCeiling({ commercialProfile: 'buyer', hasOwner: true }, { canBuy: true, canSell: false })).toBeNull()
    expect(evaluateCapabilityCeiling({ commercialProfile: 'buyer', hasOwner: true }, { canBuy: false, canSell: true })).toBe('FORBIDDEN')
  })

  it('un miembro con can_sell no puede vender aunque lleve la marca', () => {
    const m = membership({ commercialProfile: 'buyer', canSell: true })
    expect(evaluateCapability(m, 'sell')).toBe('FORBIDDEN')
  })

  it('explica por qué la casilla de vender está apagada', () => {
    expect(capabilityCeilingReason('buyer', 'buy')).toBeNull()
    expect(capabilityCeilingReason('buyer', 'sell')).toContain('perfil vendedor')
  })
})

describe('organización seller', () => {
  it('admite vender y NO admite comprar', () => {
    expect(organizationAllows('seller', 'sell')).toBe(true)
    expect(organizationAllows('seller', 'buy')).toBe(false)
  })

  it('concede can_sell y rechaza can_buy', () => {
    expect(evaluateCapabilityCeiling({ commercialProfile: 'seller', hasOwner: true }, { canBuy: false, canSell: true })).toBeNull()
    expect(evaluateCapabilityCeiling({ commercialProfile: 'seller', hasOwner: true }, { canBuy: true, canSell: false })).toBe('FORBIDDEN')
  })

  it('NO obtiene permisos de comprador por accidente', () => {
    const m = membership({ commercialProfile: 'seller', canBuy: true, canSell: true })
    expect(evaluateCapability(m, 'buy')).toBe('FORBIDDEN')
    expect(evaluateCapability(m, 'sell')).toBeNull()
  })

  it('explica por qué la casilla de comprar está apagada', () => {
    expect(capabilityCeilingReason('seller', 'sell')).toBeNull()
    expect(capabilityCeilingReason('seller', 'buy')).toContain('perfil comprador')
  })
})

describe('organización buyer_seller', () => {
  it('admite las dos capacidades', () => {
    expect(organizationAllows('buyer_seller', 'buy')).toBe(true)
    expect(organizationAllows('buyer_seller', 'sell')).toBe(true)
  })

  it('las capacidades son INDEPENDIENTES entre sí', () => {
    const soloCompra = membership({ commercialProfile: 'buyer_seller', canBuy: true })
    expect(evaluateCapability(soloCompra, 'buy')).toBeNull()
    expect(evaluateCapability(soloCompra, 'sell')).toBe('FORBIDDEN')

    const soloVenta = membership({ commercialProfile: 'buyer_seller', canSell: true })
    expect(evaluateCapability(soloVenta, 'buy')).toBe('FORBIDDEN')
    expect(evaluateCapability(soloVenta, 'sell')).toBeNull()

    const ambas = membership({ commercialProfile: 'buyer_seller', canBuy: true, canSell: true })
    expect(evaluateCapability(ambas, 'buy')).toBeNull()
    expect(evaluateCapability(ambas, 'sell')).toBeNull()
  })

  it('no hay motivo que explicar: ninguna casilla se apaga', () => {
    expect(capabilityCeilingReason('buyer_seller', 'buy')).toBeNull()
    expect(capabilityCeilingReason('buyer_seller', 'sell')).toBeNull()
  })
})

describe('perfil desconocido o ausente', () => {
  it('FAIL-CLOSED: sin perfil no se concede ninguna capacidad', () => {
    expect(organizationAllows(null, 'buy')).toBe(false)
    expect(organizationAllows(null, 'sell')).toBe(false)
    expect(evaluateCapabilityCeiling({ commercialProfile: null, hasOwner: true }, { canBuy: true, canSell: false })).toBe('FORBIDDEN')
    expect(evaluateCapability(membership({ commercialProfile: null, canBuy: true }), 'buy')).toBe('FORBIDDEN')
  })

  it('RETIRAR capacidades se permite siempre, aunque el perfil no las contemple', () => {
    for (const perfil of [...PERFILES, null]) {
      expect(
        evaluateCapabilityCeiling({ commercialProfile: perfil, hasOwner: true }, { canBuy: false, canSell: false }),
      ).toBeNull()
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Cambio de perfil comercial: recorte de capacidades
// ═══════════════════════════════════════════════════════════════════════════

describe('cambiar el perfil comercial recalcula las capacidades', () => {
  it('bajar de buyer_seller a buyer retira can_sell', () => {
    expect(clampCapabilitiesToProfile('buyer', { canBuy: true, canSell: true })).toEqual({
      canBuy: true,
      canSell: false,
    })
  })

  it('bajar de buyer_seller a seller retira can_buy', () => {
    expect(clampCapabilitiesToProfile('seller', { canBuy: true, canSell: true })).toEqual({
      canBuy: false,
      canSell: true,
    })
  })

  it('un perfil desconocido retira TODO — fail-closed', () => {
    expect(clampCapabilitiesToProfile(null, { canBuy: true, canSell: true })).toEqual({
      canBuy: false,
      canSell: false,
    })
  })

  it('AMPLIAR el perfil NO concede capacidades a nadie', () => {
    // De `buyer` a `buyer_seller`: quien no vendía sigue sin vender. Conceder
    // una capacidad es una decisión de una persona, no un efecto secundario de
    // cambiar un desplegable.
    expect(clampCapabilitiesToProfile('buyer_seller', { canBuy: true, canSell: false })).toEqual({
      canBuy: true,
      canSell: false,
    })
    expect(clampCapabilitiesToProfile('buyer_seller', { canBuy: false, canSell: false })).toEqual({
      canBuy: false,
      canSell: false,
    })
  })

  it('detecta si hay algo que retirar, para no escribir de más', () => {
    expect(capabilitiesExceedProfile('buyer', { canBuy: true, canSell: true })).toBe(true)
    expect(capabilitiesExceedProfile('buyer', { canBuy: true, canSell: false })).toBe(false)
    expect(capabilitiesExceedProfile('buyer_seller', { canBuy: true, canSell: true })).toBe(false)
    expect(capabilitiesExceedProfile('seller', { canBuy: false, canSell: true })).toBe(false)
  })

  it('el recorte es idempotente', () => {
    for (const perfil of PERFILES) {
      const una = clampCapabilitiesToProfile(perfil, { canBuy: true, canSell: true })
      expect(clampCapabilitiesToProfile(perfil, una)).toEqual(una)
      expect(capabilitiesExceedProfile(perfil, una)).toBe(false)
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Coherencia entre las dos puertas que miran el mismo techo
// ═══════════════════════════════════════════════════════════════════════════

describe('el techo es el mismo en el panel de MIRA y en el portal de cliente', () => {
  it('evaluateCapabilityCeiling y evaluateCapabilityAssignment coinciden', () => {
    const combinaciones = [
      { canBuy: true, canSell: false },
      { canBuy: false, canSell: true },
      { canBuy: true, canSell: true },
      { canBuy: false, canSell: false },
    ]

    for (const perfil of [...PERFILES, null]) {
      for (const caps of combinaciones) {
        expect(evaluateCapabilityCeiling({ commercialProfile: perfil, hasOwner: true }, caps)).toBe(
          evaluateCapabilityAssignment({ commercialProfile: perfil }, caps),
        )
      }
    }
  })
})

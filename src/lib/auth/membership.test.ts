import { describe, expect, it } from 'vitest'
import { getMembershipForOrganization, resolveFallbackMembership } from './membership'
import type { AuthMembership } from './types'

function membership(overrides: Partial<AuthMembership> & { organizationId: string }): AuthMembership {
  return {
    organizationName: 'Org',
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

describe('getMembershipForOrganization', () => {
  const memberships = [
    membership({ organizationId: 'org-a' }),
    membership({ organizationId: 'org-b', orgRole: 'owner' }),
  ]

  it('devuelve la pertenencia de la organización pedida', () => {
    expect(getMembershipForOrganization(memberships, 'org-b')?.orgRole).toBe('owner')
  })

  it('devuelve null si el usuario no pertenece a esa organización', () => {
    expect(getMembershipForOrganization(memberships, 'org-z')).toBeNull()
  })

  it('devuelve null sin organizationId — nunca elige una por su cuenta', () => {
    expect(getMembershipForOrganization(memberships, null)).toBeNull()
    expect(getMembershipForOrganization(memberships, undefined)).toBeNull()
    expect(getMembershipForOrganization(memberships, '')).toBeNull()
  })

  it('tolera entradas no válidas', () => {
    expect(getMembershipForOrganization(null, 'org-a')).toBeNull()
    expect(getMembershipForOrganization(undefined, 'org-a')).toBeNull()
    expect(getMembershipForOrganization([], 'org-a')).toBeNull()
  })
})

describe('resolveFallbackMembership', () => {
  it('devuelve null sin pertenencias', () => {
    expect(resolveFallbackMembership([])).toBeNull()
    expect(resolveFallbackMembership(null)).toBeNull()
    expect(resolveFallbackMembership(undefined)).toBeNull()
  })

  it('con una sola pertenencia devuelve esa', () => {
    const only = membership({ organizationId: 'org-a' })
    expect(resolveFallbackMembership([only])).toBe(only)
  })

  it('prioriza owner sobre admin y member', () => {
    const resultado = resolveFallbackMembership([
      membership({ organizationId: 'org-a', orgRole: 'member' }),
      membership({ organizationId: 'org-b', orgRole: 'admin' }),
      membership({ organizationId: 'org-c', orgRole: 'owner' }),
    ])
    expect(resultado?.organizationId).toBe('org-c')
  })

  it('prioriza admin sobre member', () => {
    const resultado = resolveFallbackMembership([
      membership({ organizationId: 'org-a', orgRole: 'member' }),
      membership({ organizationId: 'org-b', orgRole: 'admin' }),
    ])
    expect(resultado?.organizationId).toBe('org-b')
  })

  it('un rol desconocido va al final: no se premia lo que no se reconoce', () => {
    const resultado = resolveFallbackMembership([
      membership({ organizationId: 'org-a', orgRole: null }),
      membership({ organizationId: 'org-b', orgRole: 'member' }),
    ])
    expect(resultado?.organizationId).toBe('org-b')
  })

  it('a igualdad de rol, desempata por joined_at más antiguo', () => {
    const resultado = resolveFallbackMembership([
      membership({ organizationId: 'org-a', joinedAt: '2026-05-01T00:00:00Z' }),
      membership({ organizationId: 'org-b', joinedAt: '2026-01-01T00:00:00Z' }),
    ])
    expect(resultado?.organizationId).toBe('org-b')
  })

  it('a igualdad de rol y fecha, desempata por organization_id ascendente', () => {
    const resultado = resolveFallbackMembership([
      membership({ organizationId: 'org-z' }),
      membership({ organizationId: 'org-a' }),
    ])
    expect(resultado?.organizationId).toBe('org-a')
  })

  it('el rol manda sobre la antigüedad', () => {
    const resultado = resolveFallbackMembership([
      membership({ organizationId: 'org-a', orgRole: 'member', joinedAt: '2020-01-01T00:00:00Z' }),
      membership({ organizationId: 'org-b', orgRole: 'owner', joinedAt: '2026-06-01T00:00:00Z' }),
    ])
    expect(resultado?.organizationId).toBe('org-b')
  })

  it('es determinista: el orden de entrada no altera el resultado', () => {
    const a = membership({ organizationId: 'org-a', orgRole: 'admin' })
    const b = membership({ organizationId: 'org-b', orgRole: 'owner' })
    const c = membership({ organizationId: 'org-c', orgRole: 'member' })
    const esperado = 'org-b'
    expect(resolveFallbackMembership([a, b, c])?.organizationId).toBe(esperado)
    expect(resolveFallbackMembership([c, b, a])?.organizationId).toBe(esperado)
    expect(resolveFallbackMembership([b, a, c])?.organizationId).toBe(esperado)
  })

  it('no muta el array recibido', () => {
    const entrada = [
      membership({ organizationId: 'org-z', orgRole: 'member' }),
      membership({ organizationId: 'org-a', orgRole: 'owner' }),
    ]
    resolveFallbackMembership(entrada)
    expect(entrada[0].organizationId).toBe('org-z')
  })

  it('descarta filas sin organizationId utilizable', () => {
    const valida = membership({ organizationId: 'org-a' })
    const resultado = resolveFallbackMembership([
      membership({ organizationId: '' }),
      valida,
    ])
    expect(resultado).toBe(valida)
  })
})

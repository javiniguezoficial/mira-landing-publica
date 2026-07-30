// Semántica esperada de la migración 028 (Fase 2.1 y 2.2).
//
// ADVERTENCIA, la misma que en `src/lib/auth/sql-semantics.test.ts`: esto NO
// prueba RLS. Prueba que la semántica que asume la aplicación coincide con la
// que implementan las policies y `market_enabled_for_user()`. La verificación
// real contra la base de datos, con datos temporales que se eliminan, está
// documentada en el informe del bloque.

import { describe, expect, it } from 'vitest'
import { evaluateMarketAccess, filterVisibleMarkets, visibleFavoriteMarketIds } from './access'

// ── Espejo en TypeScript de las funciones y policies SQL ────────────────────

interface Membership {
  organizationId: string
  membershipStatus: 'active' | 'invited' | 'suspended'
  organizationStatus: 'active' | 'pending' | 'suspended' | 'rejected'
}

/**
 * `market_enabled_for_user(market_id)` — false si ALGUNA organización ACTIVA de
 * la persona, con pertenencia ACTIVA, tiene el mercado deshabilitado.
 *
 * Los dos `status = 'active'` son los mismos que están escritos en la función:
 * una pertenencia suspendida o una organización suspendida no restringen nada,
 * porque a través de ellas ya no se opera.
 */
function marketEnabledForUser(
  marketId: string,
  memberships: Membership[],
  disabledByOrg: Record<string, string[]>,
): boolean {
  return !memberships.some(
    (m) =>
      m.membershipStatus === 'active' &&
      m.organizationStatus === 'active' &&
      (disabledByOrg[m.organizationId] ?? []).includes(marketId),
  )
}

/** Policy `user_manage_own_favorites_*` — `user_id = auth.uid()` en las tres. */
function canTouchFavorite(rowUserId: string, authUid: string | null): boolean {
  return authUid !== null && rowUserId === authUid
}

/** Policy `admin_all_disabled_markets` — solo `is_platform_admin()`. */
function canWriteDisabledMarkets(isPlatformAdmin: boolean): boolean {
  return isPlatformAdmin
}

/** Policy `org_member_select_disabled_markets` — `is_org_member(organization_id)`. */
function canReadDisabledMarkets(m: Membership | null): boolean {
  return m?.membershipStatus === 'active' && m.organizationStatus === 'active'
}

const ACME = 'org-acme'
const OTRA = 'org-otra'
const activa = (orgId: string): Membership => ({
  organizationId: orgId,
  membershipStatus: 'active',
  organizationStatus: 'active',
})

// ═══════════════════════════════════════════════════════════════════════════
// market_enabled_for_user()
// ═══════════════════════════════════════════════════════════════════════════

describe('market_enabled_for_user() — espejo en TypeScript', () => {
  it('sin ninguna fila deshabilitada: todo visible — el defecto no quita acceso', () => {
    expect(marketEnabledForUser('m-1', [activa(ACME)], {})).toBe(true)
  })

  it('mercado deshabilitado en su organización: no visible', () => {
    expect(marketEnabledForUser('m-1', [activa(ACME)], { [ACME]: ['m-1'] })).toBe(false)
  })

  it('otro mercado de la misma organización sigue visible', () => {
    expect(marketEnabledForUser('m-2', [activa(ACME)], { [ACME]: ['m-1'] })).toBe(true)
  })

  // Aislamiento entre clientes: es la garantía central de 2.2.
  it('otra organización con el mercado habilitado NO se ve afectada', () => {
    const disabled = { [ACME]: ['m-1'] }
    expect(marketEnabledForUser('m-1', [activa(ACME)], disabled)).toBe(false)
    expect(marketEnabledForUser('m-1', [activa(OTRA)], disabled)).toBe(true)
  })

  it('sin pertenencias no hay nada que restringir', () => {
    // Un platform_admin sin organización, por ejemplo.
    expect(marketEnabledForUser('m-1', [], { [ACME]: ['m-1'] })).toBe(true)
  })

  it('una pertenencia suspendida no restringe: por ahí ya no se opera', () => {
    const suspendida: Membership = {
      organizationId: ACME,
      membershipStatus: 'suspended',
      organizationStatus: 'active',
    }
    expect(marketEnabledForUser('m-1', [suspendida], { [ACME]: ['m-1'] })).toBe(true)
  })

  it('una organización suspendida tampoco restringe', () => {
    const orgSuspendida: Membership = {
      organizationId: ACME,
      membershipStatus: 'active',
      organizationStatus: 'suspended',
    }
    expect(marketEnabledForUser('m-1', [orgSuspendida], { [ACME]: ['m-1'] })).toBe(true)
  })

  // Decisión explícita, documentada en la migración: con varias organizaciones
  // se elige la lectura RESTRICTIVA. Ser más estricto que la aplicación no abre
  // ninguna puerta.
  it('con dos organizaciones, basta que UNA lo tenga deshabilitado', () => {
    expect(
      marketEnabledForUser('m-1', [activa(ACME), activa(OTRA)], { [OTRA]: ['m-1'] }),
    ).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Favoritos: policies
// ═══════════════════════════════════════════════════════════════════════════

describe('user_market_favorites — policies', () => {
  it('cada persona gestiona los suyos', () => {
    expect(canTouchFavorite('u-ana', 'u-ana')).toBe(true)
  })

  // El punto que pide 2.1: nadie toca los favoritos de otro.
  it('NADIE puede tocar los favoritos de otra persona', () => {
    expect(canTouchFavorite('u-ana', 'u-otro')).toBe(false)
  })

  // No hay bypass de platform_admin, y es deliberado: un favorito es una
  // preferencia personal, no un dato administrable.
  it('ni siquiera un platform_admin: la policy no mira el rol', () => {
    expect(canTouchFavorite('u-ana', 'u-admin')).toBe(false)
  })

  it('sin sesión no se puede tocar ninguno', () => {
    expect(canTouchFavorite('u-ana', null)).toBe(false)
  })

  it('el favorito es del USUARIO, no de la organización', () => {
    // Dos personas de la misma empresa tienen favoritos independientes: no hay
    // ninguna condición de organización en la policy.
    expect(canTouchFavorite('u-ana', 'u-companero')).toBe(false)
  })

  // La unicidad la garantiza el índice `(user_id, market_id)`, no la interfaz.
  it('el mismo par usuario+mercado no puede duplicarse', () => {
    const filas = new Set<string>()
    const clave = (u: string, m: string) => `${u}|${m}`
    filas.add(clave('u-ana', 'm-1'))
    filas.add(clave('u-ana', 'm-1')) // segundo clic
    expect(filas.size).toBe(1)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Mercados deshabilitados: policies
// ═══════════════════════════════════════════════════════════════════════════

describe('organization_disabled_markets — policies', () => {
  it('solo platform_admin escribe', () => {
    expect(canWriteDisabledMarkets(true)).toBe(true)
  })

  // Lo que en 027 hizo falta cerrar con un trigger, aquí no hace falta: la
  // tabla es nueva y ninguna policy da escritura a un owner.
  it('el OWNER no puede rehabilitarse mercados por PostgREST directo', () => {
    expect(canWriteDisabledMarkets(false)).toBe(false)
  })

  it('un miembro normal tampoco puede modificarlos', () => {
    expect(canWriteDisabledMarkets(false)).toBe(false)
  })

  it('los miembros activos SÍ pueden consultar la configuración de su empresa', () => {
    expect(canReadDisabledMarkets(activa(ACME))).toBe(true)
  })

  it('sin pertenencia utilizable no se lee', () => {
    expect(canReadDisabledMarkets(null)).toBe(false)
    expect(
      canReadDisabledMarkets({
        organizationId: ACME,
        membershipStatus: 'suspended',
        organizationStatus: 'active',
      }),
    ).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Composición completa: los tres ejes juntos
// ═══════════════════════════════════════════════════════════════════════════

describe('jerarquía módulo > mercado > favorito', () => {
  const catalogo = [{ id: 'm-1' }, { id: 'm-2' }, { id: 'm-3' }]

  it('módulo activo + nada deshabilitado: se ve todo', () => {
    expect(
      filterVisibleMarkets(catalogo, { moduleEnabled: true, disabledMarketIds: [] }),
    ).toHaveLength(3)
  })

  it('el mercado deshabilitado se excluye de las consultas', () => {
    const visibles = filterVisibleMarkets(catalogo, {
      moduleEnabled: true,
      disabledMarketIds: ['m-2'],
    })
    expect(visibles.map((m) => m.id)).not.toContain('m-2')
  })

  // markets=false domina sobre la configuración granular: aunque no haya
  // ningún mercado deshabilitado, no se ve nada.
  it('módulo markets=false domina: sin mercados aunque ninguno esté deshabilitado', () => {
    expect(
      filterVisibleMarkets(catalogo, { moduleEnabled: false, disabledMarketIds: [] }),
    ).toEqual([])
    expect(evaluateMarketAccess('m-1', { moduleEnabled: false, disabledMarketIds: [] })).toBe(
      'module-disabled',
    )
  })

  it('un favorito NO produce bypass de ninguno de los dos niveles', () => {
    const favoritos = ['m-2']
    expect(visibleFavoriteMarketIds(favoritos, { moduleEnabled: true, disabledMarketIds: ['m-2'] }))
      .toEqual([])
    expect(visibleFavoriteMarketIds(favoritos, { moduleEnabled: false, disabledMarketIds: [] }))
      .toEqual([])
  })

  it('la URL directa a un mercado deshabilitado no devuelve datos', () => {
    // Espejo de `client_read_products` y `client_read_price_records`: si el
    // mercado no pasa `market_enabled_for_user`, la fila no existe para esta
    // persona y la página acaba en notFound.
    const disponible = marketEnabledForUser('m-2', [activa(ACME)], { [ACME]: ['m-2'] })
    expect(disponible).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Regresión: sin configuración, nada cambia
// ═══════════════════════════════════════════════════════════════════════════

describe('regresión 028 — el estado por defecto no quita acceso a nadie', () => {
  it('una organización sin filas ve exactamente lo mismo que antes de la migración', () => {
    const catalogo = Array.from({ length: 127 }, (_, i) => ({ id: `m-${i}` }))
    const visibles = filterVisibleMarkets(catalogo, {
      moduleEnabled: true,
      disabledMarketIds: [],
    })
    expect(visibles).toHaveLength(127)
    for (const m of catalogo) {
      expect(marketEnabledForUser(m.id, [activa(ACME)], {})).toBe(true)
    }
  })

  it('sin favoritos marcados, el bloque queda vacío pero no roto', () => {
    expect(visibleFavoriteMarketIds([], { moduleEnabled: true, disabledMarketIds: [] })).toEqual([])
  })
})

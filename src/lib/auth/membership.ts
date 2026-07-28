// Resolución de pertenencias organizativas (Bloque 6B.1).
//
// Módulo puro. Sustituye al `memberships[0]` que usaban `getActiveOrg` y
// `getMyOrganization`: con más de una pertenencia, la organización activa
// dependía del orden que devolviera Postgres, que no está garantizado.

import type { OrganizationRole } from '@/lib/identity'
import type { AuthMembership } from './types'

/**
 * Resolución EXPLÍCITA: la organización viene indicada por quien llama.
 * Es la forma correcta y la única que debería quedar cuando la interfaz
 * permita elegir organización.
 */
export function getMembershipForOrganization(
  memberships: AuthMembership[] | null | undefined,
  organizationId: string | null | undefined,
): AuthMembership | null {
  if (!Array.isArray(memberships) || !organizationId) return null
  return memberships.find((m) => m != null && m.organizationId === organizationId) ?? null
}

// Prioridad del rol en el desempate. Un rol desconocido va al final: no se
// premia lo que no se reconoce.
const ROLE_RANK: Record<OrganizationRole, number> = { owner: 0, admin: 1, member: 2 }

function rankOf(role: OrganizationRole | null): number {
  return role ? ROLE_RANK[role] : 3
}

/**
 * Resolución de FALLBACK, temporal.
 *
 * Las pantallas anteriores a 6B (dashboard, mi organización, RFQs) no indican
 * organización porque el producto todavía no expone multiempresa. Hasta que
 * exista un selector de organización visible, estas pantallas necesitan una
 * elección; lo importante es que sea DETERMINISTA y no dependa del orden de
 * la base de datos.
 *
 * Criterio, en orden:
 *   1. rol organizativo: owner > admin > member > desconocido;
 *   2. `joined_at` más antiguo;
 *   3. `organization_id` ascendente, como desempate estable final.
 *
 * NO filtra por estado de pertenencia ni de organización: 6B.1 debe conservar
 * exactamente el comportamiento observable actual. Ese filtrado llega en 6B.5.
 *
 * TEMPORAL: sustituir por selección explícita de organización cuando el
 * producto soporte multiempresa de forma visible.
 */
export function resolveFallbackMembership(
  memberships: AuthMembership[] | null | undefined,
): AuthMembership | null {
  if (!Array.isArray(memberships)) return null

  const validas = memberships.filter(
    (m): m is AuthMembership => m != null && typeof m.organizationId === 'string' && m.organizationId.length > 0,
  )
  if (validas.length === 0) return null

  return [...validas].sort((a, b) => {
    const porRol = rankOf(a.orgRole) - rankOf(b.orgRole)
    if (porRol !== 0) return porRol

    // `joined_at` es ISO-8601 en UTC: el orden lexicográfico coincide con el
    // cronológico, así que no hace falta construir Date.
    if (a.joinedAt !== b.joinedAt) return a.joinedAt < b.joinedAt ? -1 : 1

    return a.organizationId < b.organizationId ? -1 : a.organizationId > b.organizationId ? 1 : 0
  })[0]
}

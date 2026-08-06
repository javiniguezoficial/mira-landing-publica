// Filtros del listado de usuarios de administración (Fase 039).
//
// Módulo PURO. Los filtros viven en la URL, no en el estado del componente:
// así una búsqueda se puede compartir, marcar y recargar, y el listado se
// resuelve en servidor sin mandar al navegador la lista completa de usuarios.
//
// Este archivo es la ÚNICA fuente sobre qué filtros existen, cómo se escriben
// en la URL y qué valores se admiten. Un valor que no se reconoce se descarta:
// nunca se pasa a la consulta tal cual.

import { normalizePlatformRole, type PlatformRole, type ProfileStatus } from '@/lib/identity'

/** Nombres de los search params. Un solo sitio donde cambiarlos. */
export const USER_PARAM = {
  search: 'q',
  organization: 'org',
  status: 'status',
  role: 'role',
  membership: 'mem',
  capability: 'cap',
} as const

/** Longitud máxima de la búsqueda. Corta cadenas absurdas antes de la consulta. */
export const MAX_USER_SEARCH_LENGTH = 100

// ── Pertenencia a organización ──────────────────────────────────────────────

/**
 * Filtro «con / sin organización».
 *
 * Es el que el cliente pidió primero: «no puedo asignar usuarios a empresas».
 * Para poder asignarlos hay que poder encontrarlos, y quien no pertenece a
 * ninguna organización es justo el que no aparece en ninguna ficha de cliente.
 */
export const MEMBERSHIP_FILTERS = ['any', 'with', 'without'] as const

export type MembershipFilter = (typeof MEMBERSHIP_FILTERS)[number]

export const MEMBERSHIP_FILTER_LABELS: Record<MembershipFilter, string> = {
  any: 'Con y sin organización',
  with: 'Con organización',
  without: 'Sin organización',
}

// ── Capacidad comercial ─────────────────────────────────────────────────────

export const CAPABILITY_FILTERS = ['any', 'buyer', 'seller'] as const

export type CapabilityFilter = (typeof CAPABILITY_FILTERS)[number]

export const CAPABILITY_FILTER_LABELS: Record<CapabilityFilter, string> = {
  any: 'Cualquier capacidad',
  buyer: 'Comprador',
  seller: 'Vendedor',
}

// ── Estado del perfil ───────────────────────────────────────────────────────

export const PROFILE_STATUS_FILTERS: ProfileStatus[] = [
  'active',
  'pending',
  'suspended',
  'rejected',
]

// ── Filtros resueltos ───────────────────────────────────────────────────────

export interface UserListFilters {
  /** Texto libre, ya recortado. Casa contra nombre, apellidos y correo. */
  search: string
  /** UUID de organización, o `''` para todas. */
  organizationId: string
  status: ProfileStatus | ''
  role: PlatformRole | ''
  membership: MembershipFilter
  capability: CapabilityFilter
}

export const EMPTY_USER_FILTERS: UserListFilters = {
  search: '',
  organizationId: '',
  status: '',
  role: '',
  membership: 'any',
  capability: 'any',
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function texto(raw: unknown): string {
  if (typeof raw !== 'string') return ''
  return raw.trim().replace(/\s+/g, ' ').slice(0, MAX_USER_SEARCH_LENGTH)
}

/**
 * Normaliza lo que llega de la URL.
 *
 * Fail-safe hacia «sin filtro»: un valor corrupto no debe romper la pantalla ni,
 * peor, colarse en la consulta. Una organización que no sea un UUID se descarta
 * antes de llegar a PostgREST.
 */
export function parseUserListParams(
  raw: Record<string, string | undefined> | URLSearchParams,
): UserListFilters {
  const get = (key: string): string | undefined =>
    raw instanceof URLSearchParams ? (raw.get(key) ?? undefined) : raw[key]

  const org = texto(get(USER_PARAM.organization))
  const status = texto(get(USER_PARAM.status))
  const role = texto(get(USER_PARAM.role))
  const mem = texto(get(USER_PARAM.membership))
  const cap = texto(get(USER_PARAM.capability))

  return {
    search: texto(get(USER_PARAM.search)),
    organizationId: UUID_RE.test(org) ? org.toLowerCase() : '',
    status: (PROFILE_STATUS_FILTERS as string[]).includes(status) ? (status as ProfileStatus) : '',
    // El rol se normaliza con el mismo adaptador que el resto de la aplicación,
    // así que `client_owner` de una URL antigua sigue significando «usuario».
    role: role ? (normalizePlatformRole(role) ?? '') : '',
    membership: (MEMBERSHIP_FILTERS as readonly string[]).includes(mem)
      ? (mem as MembershipFilter)
      : 'any',
    capability: (CAPABILITY_FILTERS as readonly string[]).includes(cap)
      ? (cap as CapabilityFilter)
      : 'any',
  }
}

/** ¿Hay algún filtro puesto? Para decidir el estado vacío y el botón «Limpiar». */
export function hasActiveUserFilters(f: UserListFilters): boolean {
  return (
    f.search !== '' ||
    f.organizationId !== '' ||
    f.status !== '' ||
    f.role !== '' ||
    f.membership !== 'any' ||
    f.capability !== 'any'
  )
}

// ── Aplicación de los filtros ───────────────────────────────────────────────

/** Lo mínimo que necesita una fila para poder filtrarse. */
export interface FilterableUser {
  firstName: string | null
  lastName: string | null
  email: string
  status: ProfileStatus | null
  platformRole: PlatformRole | null
  memberships: Array<{
    organizationId: string
    canBuy: boolean
    canSell: boolean
  }>
}

/**
 * Normaliza para comparar: minúsculas y sin acentos.
 *
 * Buscar «martinez» tiene que encontrar «Martínez». Es la misma decisión que ya
 * se tomó en la búsqueda de proveedores, y por el mismo motivo: nadie escribe
 * los acentos en un buscador.
 */
export function foldForSearch(raw: string | null | undefined): string {
  return (raw ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

/**
 * ¿Casa este usuario con los filtros?
 *
 * Se aplica en SERVIDOR, después de resolver los correos —que viven en
 * `auth.users`, no en `profiles`— y las pertenencias. Filtrar en el navegador
 * exigiría mandarle la lista entera de usuarios con sus organizaciones, que es
 * justo lo que no debe salir de servidor sin necesidad.
 */
export function matchesUserFilters(user: FilterableUser, f: UserListFilters): boolean {
  if (f.search) {
    const aguja = foldForSearch(f.search)
    const pajar = foldForSearch(
      [user.firstName, user.lastName, user.email].filter(Boolean).join(' '),
    )
    if (!pajar.includes(aguja)) return false
  }

  if (f.status && user.status !== f.status) return false
  if (f.role && user.platformRole !== f.role) return false

  const tieneOrg = user.memberships.length > 0
  if (f.membership === 'with' && !tieneOrg) return false
  if (f.membership === 'without' && tieneOrg) return false

  if (f.organizationId && !user.memberships.some((m) => m.organizationId === f.organizationId)) {
    return false
  }

  if (f.capability === 'buyer' && !user.memberships.some((m) => m.canBuy)) return false
  if (f.capability === 'seller' && !user.memberships.some((m) => m.canSell)) return false

  return true
}

/** Reconstruye la query conservando el resto de filtros. Para los enlaces. */
export function buildUserListHref(
  basePath: string,
  current: UserListFilters,
  cambio: Partial<UserListFilters>,
): string {
  const f = { ...current, ...cambio }
  const params = new URLSearchParams()

  if (f.search) params.set(USER_PARAM.search, f.search)
  if (f.organizationId) params.set(USER_PARAM.organization, f.organizationId)
  if (f.status) params.set(USER_PARAM.status, f.status)
  if (f.role) params.set(USER_PARAM.role, f.role)
  if (f.membership !== 'any') params.set(USER_PARAM.membership, f.membership)
  if (f.capability !== 'any') params.set(USER_PARAM.capability, f.capability)

  const qs = params.toString()
  return qs ? `${basePath}?${qs}` : basePath
}

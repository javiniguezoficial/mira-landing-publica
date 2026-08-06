// Filtros del listado de usuarios (039).
//
// El filtro que motiva el bloque es «sin organización»: para poder asignar a
// alguien a una empresa hay que poder encontrar a quien no está en ninguna, y
// esa persona es justo la que no aparece en ninguna ficha de cliente.

import { describe, expect, it } from 'vitest'
import {
  EMPTY_USER_FILTERS,
  MAX_USER_SEARCH_LENGTH,
  USER_PARAM,
  buildUserListHref,
  foldForSearch,
  hasActiveUserFilters,
  matchesUserFilters,
  parseUserListParams,
  type FilterableUser,
} from './list-params'

const ORG_A = '35fe4e45-f546-415e-b2e1-01017c200f7f'
const ORG_B = 'f63214b3-eb92-4467-aa70-136da6aac909'

function usuario(over: Partial<FilterableUser> = {}): FilterableUser {
  return {
    firstName: 'Ana',
    lastName: 'Martínez Herrera',
    email: 'ana@example.com',
    status: 'active',
    platformRole: 'user',
    memberships: [{ organizationId: ORG_A, canBuy: true, canSell: false }],
    ...over,
  }
}

const SIN_ORG = usuario({
  firstName: 'Jagoba',
  lastName: 'Riveiro',
  email: 'jagoba@example.com',
  memberships: [],
})

describe('parseUserListParams', () => {
  it('sin nada devuelve todos los filtros vacíos', () => {
    expect(parseUserListParams({})).toEqual(EMPTY_USER_FILTERS)
  })

  it('lee los seis filtros', () => {
    const f = parseUserListParams({
      [USER_PARAM.search]: ' ana ',
      [USER_PARAM.organization]: ORG_A,
      [USER_PARAM.status]: 'active',
      [USER_PARAM.role]: 'platform_admin',
      [USER_PARAM.membership]: 'without',
      [USER_PARAM.capability]: 'buyer',
    })
    expect(f.search).toBe('ana')
    expect(f.organizationId).toBe(ORG_A)
    expect(f.status).toBe('active')
    expect(f.role).toBe('platform_admin')
    expect(f.membership).toBe('without')
    expect(f.capability).toBe('buyer')
  })

  it('acepta también un URLSearchParams', () => {
    const f = parseUserListParams(new URLSearchParams({ q: 'jagoba', mem: 'without' }))
    expect(f.search).toBe('jagoba')
    expect(f.membership).toBe('without')
  })

  // Fail-safe hacia «sin filtro»: un valor corrupto no puede romper la
  // pantalla ni, peor, colarse en la consulta.
  it('una organización que no es UUID se descarta antes de la consulta', () => {
    for (const raw of ['1; drop table profiles', 'acme', '../../etc', '']) {
      expect(parseUserListParams({ [USER_PARAM.organization]: raw }).organizationId).toBe('')
    }
  })

  it('un estado o una pertenencia desconocidos caen a «sin filtro»', () => {
    expect(parseUserListParams({ [USER_PARAM.status]: 'zombie' }).status).toBe('')
    expect(parseUserListParams({ [USER_PARAM.membership]: 'quizá' }).membership).toBe('any')
    expect(parseUserListParams({ [USER_PARAM.capability]: 'todo' }).capability).toBe('any')
  })

  // El rol pasa por el mismo adaptador que el resto de la aplicación, así que
  // una URL antigua con `client_owner` sigue significando «usuario».
  it('el rol legacy de una URL antigua se normaliza', () => {
    expect(parseUserListParams({ [USER_PARAM.role]: 'client_owner' }).role).toBe('user')
    expect(parseUserListParams({ [USER_PARAM.role]: 'inventado' }).role).toBe('')
  })

  it('la búsqueda se recorta a un tamaño razonable', () => {
    const larga = 'a'.repeat(500)
    expect(parseUserListParams({ [USER_PARAM.search]: larga }).search).toHaveLength(
      MAX_USER_SEARCH_LENGTH,
    )
  })

  it('`hasActiveUserFilters` distingue el estado inicial', () => {
    expect(hasActiveUserFilters(EMPTY_USER_FILTERS)).toBe(false)
    expect(hasActiveUserFilters({ ...EMPTY_USER_FILTERS, membership: 'without' })).toBe(true)
    expect(hasActiveUserFilters({ ...EMPTY_USER_FILTERS, search: 'a' })).toBe(true)
  })
})

describe('búsqueda por texto', () => {
  it('busca en nombre, apellidos y correo', () => {
    const f = { ...EMPTY_USER_FILTERS, search: 'martinez' }
    expect(matchesUserFilters(usuario(), f)).toBe(true)
    expect(matchesUserFilters(usuario(), { ...EMPTY_USER_FILTERS, search: 'example.com' })).toBe(true)
    expect(matchesUserFilters(usuario(), { ...EMPTY_USER_FILTERS, search: 'lopez' })).toBe(false)
  })

  // Nadie escribe los acentos en un buscador.
  it('ignora acentos y mayúsculas', () => {
    expect(foldForSearch('Martínez')).toBe('martinez')
    expect(matchesUserFilters(usuario(), { ...EMPTY_USER_FILTERS, search: 'MARTÍNEZ' })).toBe(true)
    expect(matchesUserFilters(usuario(), { ...EMPTY_USER_FILTERS, search: 'martinez' })).toBe(true)
  })

  it('un usuario sin nombre se encuentra por su correo', () => {
    const anonimo = usuario({ firstName: null, lastName: null, email: 'x@mira.com' })
    expect(matchesUserFilters(anonimo, { ...EMPTY_USER_FILTERS, search: 'x@mira' })).toBe(true)
  })
})

describe('filtro con / sin organización', () => {
  it('«sin organización» encuentra a quien no pertenece a ninguna', () => {
    const f = { ...EMPTY_USER_FILTERS, membership: 'without' as const }
    expect(matchesUserFilters(SIN_ORG, f)).toBe(true)
    expect(matchesUserFilters(usuario(), f)).toBe(false)
  })

  it('«con organización» hace lo contrario', () => {
    const f = { ...EMPTY_USER_FILTERS, membership: 'with' as const }
    expect(matchesUserFilters(SIN_ORG, f)).toBe(false)
    expect(matchesUserFilters(usuario(), f)).toBe(true)
  })

  it('«cualquiera» no descarta a nadie', () => {
    expect(matchesUserFilters(SIN_ORG, EMPTY_USER_FILTERS)).toBe(true)
    expect(matchesUserFilters(usuario(), EMPTY_USER_FILTERS)).toBe(true)
  })
})

describe('resto de filtros', () => {
  it('por organización concreta', () => {
    const f = { ...EMPTY_USER_FILTERS, organizationId: ORG_A }
    expect(matchesUserFilters(usuario(), f)).toBe(true)
    expect(matchesUserFilters(usuario(), { ...EMPTY_USER_FILTERS, organizationId: ORG_B })).toBe(false)
    expect(matchesUserFilters(SIN_ORG, f)).toBe(false)
  })

  it('con varias pertenencias basta con que una case', () => {
    const doble = usuario({
      memberships: [
        { organizationId: ORG_A, canBuy: false, canSell: false },
        { organizationId: ORG_B, canBuy: false, canSell: true },
      ],
    })
    expect(matchesUserFilters(doble, { ...EMPTY_USER_FILTERS, organizationId: ORG_B })).toBe(true)
    expect(matchesUserFilters(doble, { ...EMPTY_USER_FILTERS, capability: 'seller' })).toBe(true)
  })

  it('por estado del perfil', () => {
    expect(matchesUserFilters(usuario(), { ...EMPTY_USER_FILTERS, status: 'active' })).toBe(true)
    expect(matchesUserFilters(usuario(), { ...EMPTY_USER_FILTERS, status: 'suspended' })).toBe(false)
  })

  it('por rol de plataforma', () => {
    const admin = usuario({ platformRole: 'platform_admin' })
    expect(matchesUserFilters(admin, { ...EMPTY_USER_FILTERS, role: 'platform_admin' })).toBe(true)
    expect(matchesUserFilters(usuario(), { ...EMPTY_USER_FILTERS, role: 'platform_admin' })).toBe(false)
  })

  it('por capacidad comercial', () => {
    expect(matchesUserFilters(usuario(), { ...EMPTY_USER_FILTERS, capability: 'buyer' })).toBe(true)
    expect(matchesUserFilters(usuario(), { ...EMPTY_USER_FILTERS, capability: 'seller' })).toBe(false)
    expect(matchesUserFilters(SIN_ORG, { ...EMPTY_USER_FILTERS, capability: 'buyer' })).toBe(false)
  })

  it('los filtros se combinan con Y, no con O', () => {
    const f = { ...EMPTY_USER_FILTERS, membership: 'with' as const, capability: 'seller' as const }
    expect(matchesUserFilters(usuario(), f)).toBe(false)
  })
})

describe('buildUserListHref', () => {
  it('conserva el resto de filtros al cambiar uno', () => {
    const actual = { ...EMPTY_USER_FILTERS, search: 'ana', membership: 'with' as const }
    const href = buildUserListHref('/admin/usuarios', actual, { capability: 'buyer' })
    expect(href).toContain('q=ana')
    expect(href).toContain('mem=with')
    expect(href).toContain('cap=buyer')
  })

  it('omite los valores por defecto para no ensuciar la URL', () => {
    expect(buildUserListHref('/admin/usuarios', EMPTY_USER_FILTERS, {})).toBe('/admin/usuarios')
  })

  it('quitar un filtro lo saca de la URL', () => {
    const actual = { ...EMPTY_USER_FILTERS, membership: 'without' as const }
    expect(buildUserListHref('/admin/usuarios', actual, { membership: 'any' })).toBe(
      '/admin/usuarios',
    )
  })
})

// El contexto de autorización NO debe compartirse entre peticiones ni entre
// usuarios. Sería la peor forma del P0: en lugar de ver su propia información
// bajo la carcasa equivocada, un usuario vería la de otro.
//
// `getAuthContext` recibe el cliente de Supabase como parámetro y no guarda
// nada: no hay módulo con estado, ni memoización, ni `React.cache()`. Estos
// tests lo fijan.

import { describe, expect, it, vi } from 'vitest'

interface Identidad {
  id: string
  email: string
  role: string
  memberships?: Array<Record<string, unknown>>
}

/** Cliente de prueba: cada uno responde SOLO por su propia identidad. */
function clienteDe(identidad: Identidad) {
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: identidad.id, email: identidad.email } } }),
    },
    from: (tabla: string) => ({
      select: () => {
        if (tabla === 'profiles') {
          return {
            eq: () => ({
              single: async () => ({ data: { role: identidad.role, status: 'active' }, error: null }),
            }),
          }
        }
        return {
          eq: async () => ({ data: identidad.memberships ?? [], error: null }),
        }
      },
    }),
  }
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => {
    throw new Error('loadAuthContext no debe usarse en estos tests')
  },
}))

const { getAuthContext } = await import('./context')

type ClienteDePrueba = ReturnType<typeof clienteDe>
// El cliente de prueba implementa solo lo que `getAuthContext` consume.
const comoCliente = (c: ClienteDePrueba) => c as unknown as Parameters<typeof getAuthContext>[0]

const ANA: Identidad = {
  id: 'ana-uuid',
  email: 'cliente@example.com',
  role: 'user',
  memberships: [
    {
      organization_id: 'org-acme',
      role: 'client_owner',
      org_role: 'owner',
      can_buy: true,
      can_sell: false,
      status: 'active',
      joined_at: '2026-01-01T00:00:00Z',
      organization: { id: 'org-acme', name: 'Acme', status: 'active', commercial_profile: 'buyer' },
    },
  ],
}

const ADMIN: Identidad = {
  id: 'admin-uuid',
  email: 'admin@example.com',
  role: 'platform_admin',
  memberships: [],
}

describe('sin caché compartida entre usuarios', () => {
  it('dos usuarios seguidos obtienen cada uno SU contexto', async () => {
    const deAna = await getAuthContext(comoCliente(clienteDe(ANA)))
    const deAdmin = await getAuthContext(comoCliente(clienteDe(ADMIN)))

    expect(deAna?.user.id).toBe('ana-uuid')
    expect(deAna?.platformRole).toBe('user')
    expect(deAdmin?.user.id).toBe('admin-uuid')
    expect(deAdmin?.platformRole).toBe('platform_admin')
  })

  it('el orden inverso da el mismo resultado: nada se queda pegado', async () => {
    const deAdmin = await getAuthContext(comoCliente(clienteDe(ADMIN)))
    const deAna = await getAuthContext(comoCliente(clienteDe(ANA)))

    expect(deAdmin?.platformRole).toBe('platform_admin')
    expect(deAna?.platformRole).toBe('user')
    // Lo esencial: la clienta NUNCA hereda el rol del administrador.
    expect(deAna?.platformRole).not.toBe('platform_admin')
  })

  it('las pertenencias tampoco se filtran de un usuario a otro', async () => {
    const deAna = await getAuthContext(comoCliente(clienteDe(ANA)))
    const deAdmin = await getAuthContext(comoCliente(clienteDe(ADMIN)))

    expect(deAna?.memberships).toHaveLength(1)
    expect(deAna?.memberships[0].organizationId).toBe('org-acme')
    expect(deAdmin?.memberships).toHaveLength(0)
  })

  it('en concurrencia cada contexto sigue siendo el suyo', async () => {
    const [a, b, c] = await Promise.all([
      getAuthContext(comoCliente(clienteDe(ANA))),
      getAuthContext(comoCliente(clienteDe(ADMIN))),
      getAuthContext(comoCliente(clienteDe(ANA))),
    ])

    expect(a?.platformRole).toBe('user')
    expect(b?.platformRole).toBe('platform_admin')
    expect(c?.platformRole).toBe('user')
  })

  it('devuelve objetos nuevos, no una instancia reutilizada', async () => {
    const primera = await getAuthContext(comoCliente(clienteDe(ANA)))
    const segunda = await getAuthContext(comoCliente(clienteDe(ANA)))

    expect(primera).not.toBe(segunda)
    expect(primera).toEqual(segunda)
  })
})

describe('normalización del contexto', () => {
  it('traduce el rol legacy del miembro al canónico', async () => {
    const contexto = await getAuthContext(comoCliente(clienteDe(ANA)))
    expect(contexto?.memberships[0].orgRole).toBe('owner')
  })

  it('un rol global desconocido colapsa en null y no concede nada', async () => {
    const raro = { ...ANA, role: 'superadmin' }
    const contexto = await getAuthContext(comoCliente(clienteDe(raro)))
    expect(contexto?.platformRole).toBeNull()
  })

  it('sin sesión devuelve null', async () => {
    const sinUsuario = {
      auth: { getUser: async () => ({ data: { user: null } }) },
      from: () => ({ select: () => ({ eq: async () => ({ data: [], error: null }) }) }),
    }
    expect(await getAuthContext(comoCliente(sinUsuario as unknown as ClienteDePrueba))).toBeNull()
  })
})

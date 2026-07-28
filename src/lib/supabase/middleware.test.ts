// Comportamiento del middleware ante cada identidad. Sin red: se sustituye el
// cliente de Supabase por uno de prueba.
//
// Cubre la regresión del P0: una usuaria con rol `user` debe salir de /admin
// aunque escriba la URL a mano, y un fallo al leer el perfil debe denegar en
// lugar de dejar pasar.

import { beforeEach, describe, expect, it, vi } from 'vitest'

interface Escenario {
  user: { id: string; email?: string } | null
  profile?: { role: string } | null
  profileError?: { message: string } | null
}

let escenario: Escenario = { user: null }

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: escenario.user } }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: escenario.profile ?? null,
            error: escenario.profileError ?? null,
          }),
        }),
      }),
    }),
  }),
}))

const { updateSession } = await import('./middleware')
const { NextRequest } = await import('next/server')

function peticion(path: string) {
  return new NextRequest(new Request(`http://localhost:3000${path}`))
}

/** Devuelve el destino de la redirección, o null si deja pasar. */
async function destinoDe(path: string): Promise<string | null> {
  const respuesta = await updateSession(peticion(path))
  const location = respuesta.headers.get('location')
  return location ? new URL(location).pathname : null
}

const ANA = { id: 'ana-uuid', email: 'cliente@example.com' }
const ADMIN = { id: 'admin-uuid', email: 'admin@example.com' }

beforeEach(() => {
  escenario = { user: null }
})

describe('sin sesión', () => {
  it('/admin/dashboard redirige a /login', async () => {
    expect(await destinoDe('/admin/dashboard')).toBe('/login')
  })

  it('/app/dashboard redirige a /login', async () => {
    expect(await destinoDe('/app/dashboard')).toBe('/login')
  })

  it('conserva a dónde iba en redirectTo', async () => {
    const respuesta = await updateSession(peticion('/admin/dashboard'))
    const destino = new URL(respuesta.headers.get('location')!)
    expect(destino.searchParams.get('redirectTo')).toBe('/admin/dashboard')
  })

  it('las rutas públicas siguen abiertas', async () => {
    expect(await destinoDe('/')).toBeNull()
    expect(await destinoDe('/login')).toBeNull()
  })
})

describe('usuaria cliente (rol `user`) — la regresión del P0', () => {
  beforeEach(() => {
    escenario = { user: ANA, profile: { role: 'user' } }
  })

  it('NO puede entrar en /admin/dashboard', async () => {
    expect(await destinoDe('/admin/dashboard')).toBe('/app/dashboard')
  })

  it.each([
    '/admin/usuarios',
    '/admin/clientes',
    '/admin/proveedores',
    '/admin/rfqs',
    '/admin/noticias',
    '/admin/precios',
    '/admin/soporte',
    '/admin/configuracion',
    '/admin/mercados',
    '/admin/cualquier-ruta-futura',
  ])('NO puede entrar en %s', async (ruta) => {
    expect(await destinoDe(ruta)).toBe('/app/dashboard')
  })

  it('sí puede usar su propia área', async () => {
    expect(await destinoDe('/app/dashboard')).toBeNull()
    expect(await destinoDe('/app/rfqs')).toBeNull()
  })
})

describe('roles legacy de cliente', () => {
  it.each(['client_owner', 'client_member'])('%s no entra en /admin', async (role) => {
    escenario = { user: ANA, profile: { role } }
    expect(await destinoDe('/admin/dashboard')).toBe('/app/dashboard')
  })
})

describe('fail-closed', () => {
  it('un rol desconocido deniega', async () => {
    escenario = { user: ANA, profile: { role: 'superadmin' } }
    expect(await destinoDe('/admin/dashboard')).toBe('/app/dashboard')
  })

  it('un perfil inexistente deniega', async () => {
    escenario = { user: ANA, profile: null }
    expect(await destinoDe('/admin/dashboard')).toBe('/app/dashboard')
  })

  it('un ERROR al leer el perfil deniega — un error nunca es un permiso', async () => {
    escenario = { user: ADMIN, profile: null, profileError: { message: 'timeout' } }
    expect(await destinoDe('/admin/dashboard')).toBe('/app/dashboard')
  })
})

describe('platform_admin', () => {
  beforeEach(() => {
    escenario = { user: ADMIN, profile: { role: 'platform_admin' } }
  })

  it('entra en /admin sin redirección', async () => {
    expect(await destinoDe('/admin/dashboard')).toBeNull()
    expect(await destinoDe('/admin/usuarios')).toBeNull()
  })

  it('también puede usar /app', async () => {
    expect(await destinoDe('/app/dashboard')).toBeNull()
  })

  it('no se produce bucle de redirección', async () => {
    // Su destino desde /login es /admin/dashboard, y /admin/dashboard le deja
    // pasar: la cadena termina.
    expect(await destinoDe('/login')).toBe('/admin/dashboard')
    expect(await destinoDe('/admin/dashboard')).toBeNull()
  })
})

describe('destino tras autenticarse', () => {
  it('un administrador va al panel de administración', async () => {
    escenario = { user: ADMIN, profile: { role: 'platform_admin' } }
    expect(await destinoDe('/login')).toBe('/admin/dashboard')
  })

  it('una clienta va a su área', async () => {
    escenario = { user: ANA, profile: { role: 'user' } }
    expect(await destinoDe('/login')).toBe('/app/dashboard')
    expect(await destinoDe('/registro')).toBe('/app/dashboard')
  })

  it('un rol desconocido va al área de cliente, nunca a /admin', async () => {
    escenario = { user: ANA, profile: { role: 'basura' } }
    expect(await destinoDe('/login')).toBe('/app/dashboard')
  })

  it('sin bucle: la clienta llega a /app/dashboard y ahí se queda', async () => {
    escenario = { user: ANA, profile: { role: 'user' } }
    expect(await destinoDe('/login')).toBe('/app/dashboard')
    expect(await destinoDe('/app/dashboard')).toBeNull()
  })
})

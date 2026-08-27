import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { normalizePlatformRole } from '@/lib/identity'
import { evaluatePlatformRole } from '@/lib/auth/policy'
import { SUSPENDED_REDIRECT_PATH, shouldBlockSuspended } from '@/lib/auth/suspension'

/**
 * Rol global del usuario, resuelto FAIL-CLOSED.
 *
 * Devuelve `null` —que deniega— si la consulta falla, si no hay fila o si el
 * valor almacenado no se reconoce. Un error de consulta NUNCA puede
 * interpretarse como permiso.
 *
 * El middleware corre en el Edge Runtime y no puede usar `getAuthContext()`
 * (depende de `next/headers`), así que construye su propia consulta mínima
 * pero delega la DECISIÓN en `evaluatePlatformRole`, la misma que usan los
 * guards de servidor.
 */
/**
 * Rol y estado del perfil, en UNA sola consulta.
 *
 * Antes solo se leía el rol. El estado hace falta porque suspender a alguien
 * tiene que impedirle NAVEGAR, no solo ejecutar acciones: sin esto, una cuenta
 * suspendida seguía abriendo `/app` con normalidad y solo fallaba al intentar
 * escribir algo.
 *
 * Ante un error de consulta se deniega: fail-closed, igual que el resto.
 */
async function resolveProfile(
  supabase: ReturnType<typeof createServerClient>,
  userId: string,
): Promise<{ role: ReturnType<typeof normalizePlatformRole>; status: string | null } | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('role, status')
    .eq('id', userId)
    .maybeSingle()

  if (error) {
    console.error('[middleware] error al cargar el perfil; se deniega:', error.message)
    return null
  }

  return { role: normalizePlatformRole(data?.role), status: (data?.status as string) ?? null }
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname

  const isAppRoute = pathname.startsWith('/app')
  const isAdminRoute = pathname.startsWith('/admin')

  // Rutas privadas: usuario no autenticado → /login
  if ((isAppRoute || isAdminRoute) && !user) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.searchParams.set('redirectTo', pathname)
    return NextResponse.redirect(loginUrl)
  }

  // Rutas de administración: solo platform_admin.
  //
  // La comprobación es fail-closed en toda la cadena: sin perfil, con error de
  // consulta o con un rol que no se reconoce, `evaluatePlatformRole` devuelve
  // un código de denegación y el usuario sale de /admin.
  //
  // 6B.5: aquí se comprueba el ROL, no el estado del perfil. El middleware corre
  // en el Edge Runtime y no puede construir un `AuthContext` completo. La puerta
  // que sí exige `profileStatus = 'active'` —y que coincide con
  // `is_platform_admin()`— es `requirePlatformAdmin`, en el layout de /admin y
  // en cada Server Action administrativa. Un administrador suspendido puede
  // cruzar este filtro y es el layout quien lo devuelve al área de cliente:
  // defensa en profundidad, no un hueco.
  if (isAdminRoute && user) {
    const perfil = await resolveProfile(supabase, user.id)
    const platformRole = perfil?.role ?? null

    if (evaluatePlatformRole(platformRole) !== null) {
      const redirectUrl = request.nextUrl.clone()
      redirectUrl.pathname = '/app/dashboard'
      redirectUrl.search = ''
      return NextResponse.redirect(redirectUrl)
    }
  }

  // ── Cuenta SUSPENDIDA en el área de cliente ──────────────────────────────
  //
  // Suspender tiene que impedir el acceso de verdad, no solo pintar una
  // etiqueta en el panel. Se comprueba en la NAVEGACIÓN porque las páginas de
  // `/app` no llevan guard propio: sin esto, una cuenta suspendida seguía
  // paseándose por el área de cliente y solo chocaba al intentar escribir.
  //
  // La excepción de `/app/ayuda` es DELIBERADA y viene de antes: es la vía por
  // la que una persona suspendida puede preguntar por qué lo está. Ver
  // `lib/auth/suspension.ts`, donde está la explicación entera.
  if (isAppRoute && user) {
    const perfil = await resolveProfile(supabase, user.id)

    if (shouldBlockSuspended(perfil?.status, pathname)) {
      const redirectUrl = request.nextUrl.clone()
      redirectUrl.pathname = SUSPENDED_REDIRECT_PATH
      redirectUrl.search = ''
      return NextResponse.redirect(redirectUrl)
    }
  }

  // Usuario autenticado en /login o /registro → redirigir a su dashboard.
  // Aquí un rol desconocido NO deniega nada: solo elige destino, y el destino
  // seguro es el área de cliente.
  const isAuthRoute = pathname === '/login' || pathname === '/registro'
  if (isAuthRoute && user) {
    const perfil = await resolveProfile(supabase, user.id)
    const platformRole = perfil?.role ?? null

    const destination =
      platformRole === 'platform_admin' ? '/admin/dashboard' : '/app/dashboard'

    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = destination
    redirectUrl.search = ''
    return NextResponse.redirect(redirectUrl)
  }

  return supabaseResponse
}

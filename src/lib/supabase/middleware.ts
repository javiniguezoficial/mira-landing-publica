import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

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

  // Rutas privadas: usuario autenticado → verificar rol
  if ((isAppRoute || isAdminRoute) && user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    // Cliente intentando entrar a /admin/* → /app/dashboard
    if (isAdminRoute && profile?.role !== 'platform_admin') {
      const redirectUrl = request.nextUrl.clone()
      redirectUrl.pathname = '/app/dashboard'
      return NextResponse.redirect(redirectUrl)
    }
  }

  // Usuario autenticado en /login o /registro → redirigir a su dashboard
  const isAuthRoute = pathname === '/login' || pathname === '/registro'
  if (isAuthRoute && user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    const destination =
      profile?.role === 'platform_admin' ? '/admin/dashboard' : '/app/dashboard'

    const redirectUrl = request.nextUrl.clone()
    redirectUrl.pathname = destination
    return NextResponse.redirect(redirectUrl)
  }

  return supabaseResponse
}

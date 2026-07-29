import { createClient } from '@/lib/supabase/server'
import { completeOrganizationSignup } from '@/lib/actions/onboarding'
import { NextResponse } from 'next/server'

/**
 * `next` viene de la URL, así que puede apuntar a cualquier sitio. Solo se
 * admite una ruta interna: sin esta comprobación, un enlace preparado podría
 * llevar al usuario recién autenticado a un dominio ajeno.
 */
function destinoSeguro(next: string | null): string {
  if (!next) return '/app/dashboard'
  // Una sola barra inicial y nada de esquema ni de host: '//evil.com' y
  // 'https://evil.com' quedan fuera.
  if (!next.startsWith('/') || next.startsWith('//')) return '/app/dashboard'
  return next
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = destinoSeguro(searchParams.get('next'))

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // Alta pendiente: si el usuario se registró desde la landing con
      // confirmación de email, aquí es donde por fin hay sesión para crear su
      // empresa. Es idempotente, así que volver a entrar por este enlace no
      // duplica nada.
      try {
        await completeOrganizationSignup()
      } catch (e) {
        console.error('[auth] no se pudo completar el alta tras confirmar el email:', e)
      }

      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Error — redirigir al login con mensaje
  return NextResponse.redirect(`${origin}/login?error=auth`)
}

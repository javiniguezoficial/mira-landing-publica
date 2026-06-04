import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/app/dashboard'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // Redirigir al destino deseado o al dashboard por defecto
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Error — redirigir al login con mensaje
  return NextResponse.redirect(`${origin}/login?error=auth`)
}

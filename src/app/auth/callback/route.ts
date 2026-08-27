import { createClient } from '@/lib/supabase/server'
import { completeOrganizationSignup } from '@/lib/actions/onboarding'

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

/**
 * Redirección a una ruta INTERNA, sin construir ninguna URL absoluta.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * AQUÍ ESTABA EL `https://0.0.0.0:3000` (hotfix)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * La versión anterior hacía:
 *
 *   const { searchParams, origin } = new URL(request.url)
 *   ...
 *   return NextResponse.redirect(`${origin}/login?error=auth`)
 *
 * Ese `origin` NO es el dominio público. Este handler recibe un `Request` web
 * corriente, y en el servidor `standalone` de Next.js —el que se despliega en
 * el contenedor— `request.url` se reconstruye a partir de la dirección en la
 * que el proceso ESCUCHA. El Dockerfile fija
 *
 *   ENV HOSTNAME="0.0.0.0"
 *   ENV PORT=3000
 *
 * así que el origen sale `0.0.0.0:3000`. El esquema `https:` sí llegaba bien
 * —de `x-forwarded-proto`, que el proxy de Coolify sí envía—, y de ahí el
 * híbrido exacto que vio el cliente: `https://0.0.0.0:3000`.
 *
 * Es también la razón de que el resto de la aplicación NO tuviera este
 * problema: el middleware redirige con `request.nextUrl`, que es un
 * `NextRequest` y sí resuelve las cabeceras `x-forwarded-*`. Si `nextUrl`
 * estuviera mal, nadie podría ni entrar al login.
 *
 * ── La corrección: no derivar el origen, no necesitarlo ───────────────────
 *
 * Los tres destinos de este handler son SIEMPRE rutas internas — `next` está
 * validado por `destinoSeguro`, y el de error es fijo—. Nunca hizo falta un
 * dominio, solo lo parecía porque `NextResponse.redirect()` exige una URL
 * absoluta.
 *
 * Una cabecera `Location` RELATIVA está permitida desde el RFC 7231 §7.1.2 y
 * la resuelve el NAVEGADOR contra la dirección que él pidió — que es, por
 * definición, la pública y correcta. Así el contenedor deja de tener voz en
 * esto: no puede equivocarse sobre un dominio que ya no llega a nombrar.
 *
 * No se usa `NEXT_PUBLIC_APP_URL` a propósito. Sería otra cosa más que puede
 * estar mal configurada, y aquí no aporta nada: el destino está en el mismo
 * origen que la petición.
 */
function redirigirA(ruta: string): Response {
  return new Response(null, { status: 303, headers: { Location: ruta } })
}

/**
 * Salida de error, con el fragmento CORTADO.
 *
 * ── Por qué `#` al final, y por qué no es un adorno ──────────────────────
 *
 * En QA se vio esta URL en la barra de direcciones:
 *
 *   /login?error=auth#access_token=…
 *
 * El fragmento no lo puso este handler —no puede: el fragmento nunca llega al
 * servidor—. Lo arrastró el NAVEGADOR. Según el RFC 7231 §7.1.2, cuando el
 * destino de una redirección no trae fragmento propio, el agente hereda el de
 * la petición original. Como el enlace venía con `#access_token=…`, ese token
 * acabó pegado a una pantalla de error.
 *
 * Dar al `Location` un fragmento propio —aunque sea vacío— corta la herencia.
 * Un `access_token` en la barra de direcciones es una sesión completa: queda en
 * el historial, viaja si alguien comparte el enlace y sale en cualquier
 * captura de pantalla. Que ocurra sobre una página de error no lo hace menos
 * grave; lo hace más probable, porque es justo cuando la gente copia la URL
 * para preguntar qué ha pasado.
 *
 * La causa de fondo —las invitaciones no debían pasar por aquí— está corregida
 * aparte. Esto es el cierre para cualquier otro enlace que llegue con sesión en
 * el fragmento.
 */
function redirigirAErrorSinFragmento(ruta: string): Response {
  return new Response(null, { status: 303, headers: { Location: `${ruta}#` } })
}

export async function GET(request: Request) {
  // Solo se leen los PARÁMETROS. El origen de esta URL no es de fiar y ya no se
  // usa para nada; ver `redirigirA`.
  const { searchParams } = new URL(request.url)
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

      return redirigirA(next)
    }

    // El detalle se queda en el servidor: a la interfaz solo le llega
    // `?error=auth`. Sin esto no había forma de distinguir un enlace caducado
    // de una Site URL mal configurada en Supabase.
    console.error(
      `[auth] no se pudo canjear el código del enlace: ${error.name} ${error.status ?? ''} ${error.message}`,
    )
  } else {
    // Llegar aquí SIN `code` significa casi siempre que el enlace del correo no
    // apuntaba a esta ruta: Supabase mandó al usuario a su «Site URL» en lugar
    // de al `redirectTo` que pide la aplicación.
    console.error('[auth] se ha llamado a /auth/callback sin parámetro `code`.')
  }

  return redirigirAErrorSinFragmento('/login?error=auth')
}

'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { MiraLogo } from './MiraLogo'
import { createClient } from '@/lib/supabase/client'
import {
  INVITE_NEXT_PATH,
  describeInviteOutcome,
  inviteErrorMessage,
  resolveInvite,
} from '@/lib/auth/invite-session'

/**
 * Cierre de una invitación de MIRA Pricing.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * POR QUÉ ESTA PANTALLA TIENE QUE SER DE CLIENTE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Porque la sesión llega en el FRAGMENTO de la URL (`#access_token=…`), y el
 * fragmento no se envía nunca al servidor. `/auth/callback` es un Route
 * Handler: por definición no puede verlo. Ese era exactamente el fallo — un
 * enlace válido tratado como error porque el servidor no tenía forma de leerlo.
 *
 * Aquí no se pinta un formulario: es una pantalla de paso. Establece la sesión
 * y manda a la persona a crear su contraseña.
 *
 * ── Por qué `setSession()` explícito y no `detectSessionInUrl` ───────────
 *
 * El cliente de navegador trae `detectSessionInUrl: true` y acabaría cogiendo
 * el fragmento por su cuenta, pero lo hace de forma asíncrona durante su
 * inicialización. Depender de eso convertiría la navegación siguiente en una
 * carrera: si se navega antes de que termine, la sesión no está. Leerlo y
 * llamar a `setSession()` hace el momento explícito y comprobable.
 *
 * ── Por qué se borra el fragmento de la barra de direcciones ─────────────
 *
 * `history.replaceState` en cuanto se ha leído. Un `access_token` en la URL es
 * una sesión completa: se queda en el historial, viaja en un «compartir esta
 * página» y aparece en una captura de pantalla. Se quita antes de navegar a
 * ningún sitio.
 */
export function AcceptInvitePage() {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const yaProcesado = useRef(false)

  useEffect(() => {
    // Una sola vez por montaje: Strict Mode ejecuta los efectos dos veces en
    // desarrollo, y establecer la sesión dos veces sería trabajo tirado.
    if (yaProcesado.current) return
    yaProcesado.current = true

    const resultado = resolveInvite(window.location.hash, window.location.search)

    // Nunca el token: solo QUÉ ha llegado. Ver `describeInviteOutcome`.
    console.info(`[auth] ${describeInviteOutcome(resultado)}`)

    if (resultado.kind !== 'session' && resultado.kind !== 'code') {
      limpiarFragmento()
      setError(inviteErrorMessage(resultado))
      return
    }

    void (async () => {
      const supabase = createClient()

      const { error: fallo } =
        resultado.kind === 'session'
          ? await supabase.auth.setSession({
              access_token: resultado.accessToken,
              refresh_token: resultado.refreshToken,
            })
          : await supabase.auth.exchangeCodeForSession(resultado.code)

      // El token sale de la barra de direcciones EN CUANTO deja de hacer falta,
      // haya ido bien o mal.
      limpiarFragmento()

      if (fallo) {
        // `fallo.message` puede describir el token; no se enseña ni se registra.
        console.error(`[auth] no se pudo establecer la sesión de la invitación: ${fallo.name}`)
        setError(inviteErrorMessage({ kind: 'invalid' }))
        return
      }

      // Destino interno y CONSTANTE: no sale de la URL, así que no hay forma de
      // convertir esto en un redirect abierto.
      router.replace(`${INVITE_NEXT_PATH}?motivo=invitacion`)
    })()
  }, [router])

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-slate-50 p-6">
      <MiraLogo className="h-12 w-12" />

      {error ? (
        <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-xl">
          <h1 className="mb-2 text-lg font-bold text-mira-ink">No hemos podido continuar</h1>
          <p className="text-sm leading-relaxed text-slate-600">{error}</p>
          <a
            href="/login"
            className="mt-6 inline-flex items-center justify-center rounded-xl bg-mira-magenta px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-mira-magenta-deep"
          >
            Ir a iniciar sesión
          </a>
        </div>
      ) : (
        <div className="text-center">
          <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-mira-magenta" />
          <p className="text-sm text-slate-500">Validando tu invitación…</p>
        </div>
      )}
    </div>
  )
}

/** Quita el `#…` sin recargar y sin dejar rastro en el historial. */
function limpiarFragmento() {
  if (typeof window === 'undefined') return
  window.history.replaceState(null, '', window.location.pathname)
}

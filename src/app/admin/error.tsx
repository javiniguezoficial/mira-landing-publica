'use client'

// Red de seguridad del panel de administración.
//
// ── Por qué hace falta ──────────────────────────────────────────────────────
//
// Hasta ahora la app no tenía NINGÚN error boundary: en todo `src/app` solo
// existía `not-found.tsx`. Cualquier excepción no capturada —en un Server
// Component, en una Server Action, en el render— caía al fallback de Next y el
// usuario veía «Application error: a server-side exception has occurred»
// seguido de un digest, sin navegación, sin forma de volver y sin saber si su
// trabajo se había guardado.
//
// ── Qué NO es ───────────────────────────────────────────────────────────────
//
// Esto es la ÚLTIMA defensa, no el mecanismo normal. Un fallo que una pantalla
// sabe manejar —un CSV que no valida, una confirmación rechazada— tiene que
// tratarlo la propia pantalla y dejar al usuario donde estaba: llegar aquí
// significa perder el formulario y el contexto. El asistente de importación,
// por ejemplo, captura los suyos y no llega nunca a este componente.
//
// No se enseña `error.message`: en producción Next ya lo sustituye por un
// texto genérico, pero en un fallo de cliente vendría entero, con nombres de
// función y rutas del bundle. El `digest` sí, que para eso existe.

import { useEffect } from 'react'
import { AlertOctagon, RotateCcw, LayoutDashboard } from 'lucide-react'
import Link from 'next/link'
import { miraBtn } from '@/lib/miraButtons'
import { safeErrorReference } from '@/lib/imports/errors'

interface Props {
  error: Error & { digest?: string }
  reset: () => void
}

export default function AdminError({ error, reset }: Props) {
  useEffect(() => {
    // A los logs del servidor con su referencia; a la pantalla, nada de esto.
    console.error(`[admin] error no capturado: ${error.digest ?? 'sin digest'}`)
  }, [error])

  const referencia = safeErrorReference(error)

  return (
    <div className="flex w-full max-w-2xl flex-col gap-6 p-4 md:p-6 xl:p-8">
      <div className="mira-card rounded-2xl p-6 sm:p-8">
        <div className="flex items-start gap-3.5">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-red-50">
            <AlertOctagon size={22} className="text-red-500" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-black tracking-tight text-mira-ink">
              Algo ha fallado
            </h1>
            <p className="mt-1 text-sm text-slate-500">
              No hemos podido completar la operación. Ningún dato se ha modificado por este error.
            </p>
          </div>
        </div>

        <p className="mt-5 rounded-xl bg-mira-canvas/60 px-4 py-3 text-xs text-slate-500">
          Puedes volver a intentarlo. Si el problema se repite, avísanos con la referencia de abajo:
          es lo que nos permite localizar el fallo exacto en los registros.
        </p>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button type="button" onClick={reset} className={miraBtn.primary}>
            <RotateCcw size={14} /> Volver a intentarlo
          </button>
          <Link href="/admin" className={miraBtn.ghost}>
            <LayoutDashboard size={14} /> Ir al panel
          </Link>
        </div>

        {referencia && (
          <p className="mt-4 text-[11px] text-slate-400">
            Referencia técnica: <span className="font-mono">{referencia}</span>
          </p>
        )}
      </div>
    </div>
  )
}

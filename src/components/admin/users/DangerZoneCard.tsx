'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react'
import { deleteUserAccount } from '@/lib/actions/user-admin'
import { isDeletionConfirmed } from '@/lib/auth/user-deletion'
import { MiraSectionCard } from '@/components/mira/MiraSectionCard'
import { miraField } from '@/lib/miraButtons'

interface Props {
  userId: string
  email: string
  fullName: string
  organizationName: string | null
  organizationRole: string | null
  /** Motivos por los que NO se puede eliminar. Vacío = eliminable. */
  blocks: string[]
  /** Lo que se desvinculará. No impide nada. */
  warnings: string[]
  /** El administrador está mirando su propia ficha. */
  isSelf: boolean
}

/**
 * Zona de peligro de la ficha de usuario.
 *
 * ── Por qué vive en su propia tarjeta, al final ──────────────────────────
 *
 * Porque eliminar no es «una acción más» de la ficha. Ponerla junto a
 * «Suspender» o «Cambiar rol» la convierte en algo que se pulsa por inercia, y
 * es la única operación de esta pantalla que no se puede deshacer.
 *
 * ── Por qué la confirmación es el CORREO y no la palabra «ELIMINAR» ──────
 *
 * Porque teclear una palabra fija se automatiza en cuanto se hace dos veces.
 * Escribir la dirección obliga a mirar a QUIÉN se está eliminando, que es
 * exactamente el error que hay que hacer imposible: borrar la cuenta
 * equivocada. La comprobación se repite en el servidor contra el correo real
 * leído de Auth, así que esto es una ayuda, no la protección.
 */
export function DangerZoneCard({
  userId, email, fullName, organizationName, organizationRole, blocks, warnings, isSelf,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [abierto, setAbierto] = useState(false)
  const [confirmacion, setConfirmacion] = useState('')
  const [error, setError] = useState<string | null>(null)

  const bloqueado = blocks.length > 0
  const coincide = isDeletionConfirmed(confirmacion, email)

  function eliminar() {
    if (!coincide || pending || bloqueado) return
    setError(null)

    startTransition(async () => {
      const res = await deleteUserAccount({ userId, confirmation: confirmacion })
      if (!res.ok) {
        setError(res.error)
        return
      }
      // La ficha ya no existe: se vuelve al listado.
      router.replace('/admin/usuarios')
      router.refresh()
    })
  }

  return (
    <MiraSectionCard
      title="Zona de peligro"
      icon={AlertTriangle}
      bodyClassName="space-y-4 p-5"
      className="border-red-200"
    >
      {/* Si no se puede, se dice POR QUÉ y qué hacer en su lugar. Nunca un
          error de SQL. */}
      {bloqueado ? (
        <div className="space-y-3">
          <p className="text-sm font-bold text-mira-ink">Esta cuenta no se puede eliminar</p>
          <ul className="space-y-2">
            {blocks.map((motivo, i) => (
              <li key={i} className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
                {motivo}
              </li>
            ))}
          </ul>
          <p className="text-xs text-slate-500">
            Suspender la cuenta retira el acceso y conserva todo el histórico. Es reversible.
          </p>
        </div>
      ) : !abierto ? (
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            Eliminar la cuenta borra su acceso, su perfil y sus pertenencias. No se puede deshacer.
            Si solo quieres retirarle el acceso, <strong>suspéndela</strong>: es reversible y
            conserva el histórico.
          </p>
          <button
            type="button"
            onClick={() => setAbierto(true)}
            disabled={isSelf}
            className="inline-flex items-center gap-2 rounded-xl border border-red-300 bg-white px-4 py-2 text-sm font-bold text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Trash2 size={14} /> Eliminar usuario
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Antes de confirmar, quién es exactamente. */}
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
            <p className="mb-2 text-sm font-bold text-red-800">
              Vas a eliminar definitivamente esta cuenta
            </p>
            <dl className="space-y-1 text-sm text-red-900">
              <div className="flex gap-2"><dt className="font-semibold">Usuario:</dt><dd>{fullName}</dd></div>
              <div className="flex gap-2"><dt className="font-semibold">Email:</dt><dd className="font-mono">{email}</dd></div>
              <div className="flex gap-2">
                <dt className="font-semibold">Organización:</dt>
                <dd>{organizationName ?? 'Sin organización'}{organizationRole ? ` · ${organizationRole}` : ''}</dd>
              </div>
            </dl>
          </div>

          {warnings.length > 0 && (
            <ul className="space-y-1.5">
              {warnings.map((w, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-slate-600">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" />
                  {w}
                </li>
              ))}
            </ul>
          )}

          <div>
            <label htmlFor="confirmar-borrado" className="mb-1.5 block text-sm font-bold text-red-700">
              Escribe <span className="font-mono">{email}</span> para habilitar el botón
            </label>
            <input
              id="confirmar-borrado"
              type="text"
              autoComplete="off"
              value={confirmacion}
              onChange={(e) => setConfirmacion(e.target.value)}
              placeholder={email}
              className={`${miraField} font-mono`}
            />
          </div>

          {error && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={eliminar}
              disabled={!coincide || pending}
              className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {pending
                ? <><Loader2 size={14} className="animate-spin" /> Eliminando…</>
                : <><Trash2 size={14} /> Eliminar definitivamente</>}
            </button>
            <button
              type="button"
              onClick={() => { setAbierto(false); setConfirmacion(''); setError(null) }}
              disabled={pending}
              className="rounded-xl border border-mira-line bg-white px-4 py-2 text-sm font-bold text-slate-600 transition-colors hover:border-mira-magenta/30 disabled:opacity-40"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </MiraSectionCard>
  )
}

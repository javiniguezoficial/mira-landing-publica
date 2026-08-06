'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Save } from 'lucide-react'
import { updateUserProfileFields } from '@/lib/actions/user-admin'
import { miraBtn, miraField } from '@/lib/miraButtons'
import type { AdminUserRow } from '@/lib/actions/users'

const labelCls = 'mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-400'

/**
 * Datos editables del perfil (039).
 *
 * ── Lo que NO está aquí ─────────────────────────────────────────────────────
 *
 * Ni el rol de plataforma ni el estado del usuario. Los dos tienen su propia
 * tarjeta con su confirmación, y el servidor los descarta aunque lleguen en
 * este formulario: `pickEditableProfileFields` es una allowlist.
 *
 * La razón es concreta: en un formulario general, «guardar» significa lo mismo
 * para un número de teléfono que para conceder acceso al panel de MIRA. No
 * pueden compartir botón.
 *
 * El EMAIL tampoco se edita: vive en `auth.users` y cambiarlo es una operación
 * de identidad —con verificación— que no pertenece a esta pantalla.
 */
export function UserProfileForm({ user }: { user: AdminUserRow }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const [firstName, setFirstName] = useState(user.firstName ?? '')
  const [lastName, setLastName] = useState(user.lastName ?? '')
  const [phone, setPhone] = useState(user.phone ?? '')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setOk(null)

    startTransition(async () => {
      const r = await updateUserProfileFields(user.id, {
        first_name: firstName,
        last_name: lastName,
        phone,
      })
      if (r.ok) {
        setOk('Perfil actualizado.')
        router.refresh()
      } else {
        setError(r.error)
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelCls} htmlFor="perfil-nombre">
            Nombre
          </label>
          <input
            id="perfil-nombre"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            className={miraField}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="perfil-apellidos">
            Apellidos
          </label>
          <input
            id="perfil-apellidos"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            className={miraField}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="perfil-telefono">
            Teléfono
          </label>
          <input
            id="perfil-telefono"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className={miraField}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="perfil-email">
            Email
          </label>
          <input
            id="perfil-email"
            value={user.email}
            disabled
            className={`${miraField} disabled:cursor-not-allowed disabled:bg-mira-canvas disabled:text-slate-400`}
          />
          <p className="mt-1 text-[11px] text-slate-400">
            El email es la identidad de la cuenta y no se cambia desde aquí.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pending} className={miraBtn.primary}>
          {pending ? (
            <>
              <Loader2 size={14} className="animate-spin" /> Guardando…
            </>
          ) : (
            <>
              <Save size={14} /> Guardar cambios
            </>
          )}
        </button>
        {ok && <span className="text-xs font-semibold text-emerald-600">{ok}</span>}
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
          {error}
        </p>
      )}
    </form>
  )
}

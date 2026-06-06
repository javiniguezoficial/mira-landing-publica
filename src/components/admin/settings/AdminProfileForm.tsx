'use client'

import { useActionState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { updateAdminProfile } from '@/lib/actions/admin-settings'
import type { ActionResult } from '@/lib/actions/admin-settings'
import { miraBtn, miraField } from '@/lib/miraButtons'

const fieldLabel = 'block text-sm font-bold text-mira-ink mb-1.5'

interface Props {
  defaultValues: {
    email: string
    first_name: string | null
    last_name: string | null
    phone: string | null
    avatar_url: string | null
  }
}

const initial: ActionResult = {}

export function AdminProfileForm({ defaultValues }: Props) {
  const router = useRouter()
  const [state, formAction, pending] = useActionState(updateAdminProfile, initial)

  useEffect(() => {
    if (state.success) router.refresh()
  }, [state.success])

  return (
    <form action={formAction} className="space-y-5">
      {/* Email — solo lectura */}
      <div>
        <label className={fieldLabel}>
          Email
        </label>
        <input
          type="email"
          value={defaultValues.email}
          disabled
          className={`${miraField} cursor-not-allowed bg-slate-50 text-slate-500`}
        />
        <p className="text-xs text-slate-400 mt-1">El email no se puede modificar desde aquí.</p>
      </div>

      {/* Nombre */}
      <div>
        <label htmlFor="first_name" className={fieldLabel}>
          Nombre <span className="text-red-500">*</span>
        </label>
        <input
          id="first_name"
          name="first_name"
          type="text"
          required
          defaultValue={defaultValues.first_name ?? ''}
          placeholder="Nombre"
          className={miraField}
        />
      </div>

      {/* Apellidos */}
      <div>
        <label htmlFor="last_name" className={fieldLabel}>
          Apellidos
        </label>
        <input
          id="last_name"
          name="last_name"
          type="text"
          defaultValue={defaultValues.last_name ?? ''}
          placeholder="Apellidos"
          className={miraField}
        />
      </div>

      {/* Teléfono */}
      <div>
        <label htmlFor="phone" className={fieldLabel}>
          Teléfono
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          defaultValue={defaultValues.phone ?? ''}
          placeholder="+34 600 000 000"
          className={miraField}
        />
      </div>

      {/* Feedback */}
      {state.error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {state.error}
        </p>
      )}
      {state.success && (
        <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
          {state.success}
        </p>
      )}

      <div className="pt-1">
        <button type="submit" disabled={pending} className={miraBtn.primary}>
          {pending ? 'Guardando…' : 'Guardar perfil'}
        </button>
      </div>
    </form>
  )
}

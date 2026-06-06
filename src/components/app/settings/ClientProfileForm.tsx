'use client'

import { useActionState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { updateClientProfile } from '@/lib/actions/client-settings'
import type { ActionResult } from '@/lib/actions/client-settings'

interface Props {
  defaultValues: {
    email: string
    first_name: string | null
    last_name: string | null
    phone: string | null
  }
}

const initial: ActionResult = {}

export function ClientProfileForm({ defaultValues }: Props) {
  const router = useRouter()
  const [state, formAction, pending] = useActionState(updateClientProfile, initial)

  useEffect(() => {
    if (state.success) router.refresh()
  }, [state.success])

  return (
    <form action={formAction} className="space-y-5">
      {/* Email — solo lectura */}
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1.5">
          Email
        </label>
        <input
          type="email"
          value={defaultValues.email}
          disabled
          className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 text-slate-500 text-sm cursor-not-allowed"
        />
        <p className="text-xs text-slate-400 mt-1">El email no se puede modificar desde aquí.</p>
      </div>

      {/* Nombre */}
      <div>
        <label htmlFor="first_name" className="block text-sm font-semibold text-slate-700 mb-1.5">
          Nombre <span className="text-red-500">*</span>
        </label>
        <input
          id="first_name"
          name="first_name"
          type="text"
          required
          defaultValue={defaultValues.first_name ?? ''}
          placeholder="Tu nombre"
          className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-mira-magenta/20 focus:border-mira-magenta transition-colors"
        />
      </div>

      {/* Apellidos */}
      <div>
        <label htmlFor="last_name" className="block text-sm font-semibold text-slate-700 mb-1.5">
          Apellidos
        </label>
        <input
          id="last_name"
          name="last_name"
          type="text"
          defaultValue={defaultValues.last_name ?? ''}
          placeholder="Tus apellidos"
          className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-mira-magenta/20 focus:border-mira-magenta transition-colors"
        />
      </div>

      {/* Teléfono */}
      <div>
        <label htmlFor="phone" className="block text-sm font-semibold text-slate-700 mb-1.5">
          Teléfono
        </label>
        <input
          id="phone"
          name="phone"
          type="tel"
          defaultValue={defaultValues.phone ?? ''}
          placeholder="+34 600 000 000"
          className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-mira-magenta/20 focus:border-mira-magenta transition-colors"
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
        <button
          type="submit"
          disabled={pending}
          className="px-5 py-2.5 rounded-lg bg-mira-magenta text-white text-sm font-semibold hover:bg-mira-magenta-deep disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {pending ? 'Guardando…' : 'Guardar perfil'}
        </button>
      </div>
    </form>
  )
}

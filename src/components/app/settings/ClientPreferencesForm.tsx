'use client'

import { useActionState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { updateClientPreferences } from '@/lib/actions/client-settings'
import type { ActionResult } from '@/lib/actions/client-settings'

interface Props {
  defaultValues: {
    preferred_locale: string
    preferred_currency: string
    preferred_country: string
  }
}

const initial: ActionResult = {}

const LOCALES = [
  { value: 'es', label: 'Español' },
  { value: 'en', label: 'English' },
]

const CURRENCIES = [
  { value: 'EUR', label: 'Euro (EUR)' },
]

const COUNTRIES = [
  { value: 'ES', label: 'España' },
  { value: 'PT', label: 'Portugal' },
  { value: 'FR', label: 'Francia' },
  { value: 'DE', label: 'Alemania' },
  { value: 'IT', label: 'Italia' },
  { value: 'NL', label: 'Países Bajos' },
  { value: 'PL', label: 'Polonia' },
]

export function ClientPreferencesForm({ defaultValues }: Props) {
  const router = useRouter()
  const [state, formAction, pending] = useActionState(updateClientPreferences, initial)

  useEffect(() => {
    if (state.success) router.refresh()
  }, [state.success])

  return (
    <form action={formAction} className="space-y-5">
      {/* Idioma */}
      <div>
        <label htmlFor="preferred_locale" className="block text-sm font-semibold text-slate-700 mb-1.5">
          Idioma preferido
        </label>
        <select
          id="preferred_locale"
          name="preferred_locale"
          defaultValue={defaultValues.preferred_locale}
          className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-mira-magenta/20 focus:border-mira-magenta transition-colors"
        >
          {LOCALES.map(l => (
            <option key={l.value} value={l.value}>{l.label}</option>
          ))}
        </select>
      </div>

      {/* Moneda */}
      <div>
        <label htmlFor="preferred_currency" className="block text-sm font-semibold text-slate-700 mb-1.5">
          Moneda por defecto
        </label>
        <select
          id="preferred_currency"
          name="preferred_currency"
          defaultValue={defaultValues.preferred_currency}
          className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-mira-magenta/20 focus:border-mira-magenta transition-colors"
        >
          {CURRENCIES.map(c => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
        <p className="text-xs text-slate-400 mt-1">Próximamente estarán disponibles más monedas.</p>
      </div>

      {/* País */}
      <div>
        <label htmlFor="preferred_country" className="block text-sm font-semibold text-slate-700 mb-1.5">
          País por defecto
        </label>
        <select
          id="preferred_country"
          name="preferred_country"
          defaultValue={defaultValues.preferred_country}
          className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-mira-magenta/20 focus:border-mira-magenta transition-colors"
        >
          {COUNTRIES.map(c => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
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
          {pending ? 'Guardando…' : 'Guardar preferencias'}
        </button>
      </div>
    </form>
  )
}

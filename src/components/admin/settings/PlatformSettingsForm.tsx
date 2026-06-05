'use client'

import { useActionState } from 'react'
import { updatePlatformSettings } from '@/lib/actions/admin-settings'
import type { ActionResult } from '@/lib/actions/admin-settings'

interface Props {
  defaultValues: {
    platform_name: string
    support_email: string | null
    default_country: string
    default_currency: string
    maintenance_mode: boolean
  }
}

const initial: ActionResult = {}

export function PlatformSettingsForm({ defaultValues }: Props) {
  const [state, formAction, pending] = useActionState(updatePlatformSettings, initial)

  return (
    <form action={formAction} className="space-y-5">
      {/* Nombre de la plataforma */}
      <div>
        <label htmlFor="platform_name" className="block text-sm font-semibold text-slate-700 mb-1.5">
          Nombre de la plataforma <span className="text-red-500">*</span>
        </label>
        <input
          id="platform_name"
          name="platform_name"
          type="text"
          required
          defaultValue={defaultValues.platform_name}
          placeholder="MIRA"
          className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-mira-primary/30 focus:border-mira-primary transition-colors"
        />
      </div>

      {/* Email de soporte */}
      <div>
        <label htmlFor="support_email" className="block text-sm font-semibold text-slate-700 mb-1.5">
          Email de soporte
        </label>
        <input
          id="support_email"
          name="support_email"
          type="email"
          defaultValue={defaultValues.support_email ?? ''}
          placeholder="soporte@tudominio.com"
          className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-mira-primary/30 focus:border-mira-primary transition-colors"
        />
      </div>

      {/* País por defecto */}
      <div>
        <label htmlFor="default_country" className="block text-sm font-semibold text-slate-700 mb-1.5">
          País por defecto <span className="text-red-500">*</span>
        </label>
        <input
          id="default_country"
          name="default_country"
          type="text"
          required
          maxLength={2}
          defaultValue={defaultValues.default_country}
          placeholder="ES"
          className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm uppercase focus:outline-none focus:ring-2 focus:ring-mira-primary/30 focus:border-mira-primary transition-colors"
        />
        <p className="text-xs text-slate-400 mt-1">Código ISO de 2 letras, ej. ES, FR, PT</p>
      </div>

      {/* Moneda por defecto */}
      <div>
        <label htmlFor="default_currency" className="block text-sm font-semibold text-slate-700 mb-1.5">
          Moneda por defecto <span className="text-red-500">*</span>
        </label>
        <input
          id="default_currency"
          name="default_currency"
          type="text"
          required
          maxLength={3}
          defaultValue={defaultValues.default_currency}
          placeholder="EUR"
          className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm uppercase focus:outline-none focus:ring-2 focus:ring-mira-primary/30 focus:border-mira-primary transition-colors"
        />
        <p className="text-xs text-slate-400 mt-1">Código ISO de 3 letras, ej. EUR, USD, GBP</p>
      </div>

      {/* Modo mantenimiento */}
      <div>
        <p className="block text-sm font-semibold text-slate-700 mb-2">Modo mantenimiento</p>
        <div className="flex items-start gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="maintenance_mode"
              value="false"
              defaultChecked={!defaultValues.maintenance_mode}
              className="accent-mira-primary"
            />
            <span className="text-sm text-slate-700">Desactivado</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="maintenance_mode"
              value="true"
              defaultChecked={defaultValues.maintenance_mode}
              className="accent-mira-primary"
            />
            <span className="text-sm text-slate-700">Activado</span>
          </label>
        </div>
        <p className="text-xs text-slate-400 mt-1">
          Si se activa, los clientes verán una pantalla de mantenimiento al intentar acceder.
        </p>
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
          className="px-5 py-2.5 rounded-lg bg-mira-primary text-white text-sm font-semibold hover:bg-mira-primary/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {pending ? 'Guardando…' : 'Guardar ajustes'}
        </button>
      </div>
    </form>
  )
}

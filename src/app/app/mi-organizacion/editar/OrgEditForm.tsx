'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import type { OrgDetail } from '@/lib/queries/my-organization'
import type { UpdateOrgBasicResult } from '@/lib/actions/my-organization'

interface Props {
  action: (formData: FormData) => Promise<UpdateOrgBasicResult>
  defaultValues: OrgDetail
}

export function OrgEditForm({ action, defaultValues }: Props) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setError(null)
    setPending(true)
    const fd = new FormData(e.currentTarget)
    const result = await action(fd)
    if (result?.error) {
      setError(result.error)
      setPending(false)
    }
    // Si no hay error, el server action hace redirect
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm font-medium">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {/* Ciudad */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1.5">Ciudad</label>
          <input
            name="city"
            type="text"
            defaultValue={defaultValues.city ?? ''}
            className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-mira-magenta/20 focus:border-mira-magenta"
            placeholder="Madrid"
          />
        </div>

        {/* Teléfono */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1.5">Teléfono</label>
          <input
            name="phone"
            type="tel"
            defaultValue={defaultValues.phone ?? ''}
            className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-mira-magenta/20 focus:border-mira-magenta"
            placeholder="+34 600 000 000"
          />
        </div>

        {/* Email */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1.5">Email de contacto</label>
          <input
            name="email"
            type="email"
            defaultValue={defaultValues.email ?? ''}
            className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-mira-magenta/20 focus:border-mira-magenta"
            placeholder="contacto@empresa.com"
          />
        </div>

        {/* Web */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1.5">Sitio web</label>
          <input
            name="website"
            type="url"
            defaultValue={defaultValues.website ?? ''}
            className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-mira-magenta/20 focus:border-mira-magenta"
            placeholder="https://empresa.com"
          />
        </div>
      </div>

      {/* Campos de solo lectura — informativos */}
      <div className="border-t border-slate-100 pt-5">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Datos no editables</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { label: 'Razón social', value: defaultValues.name },
            { label: 'País', value: defaultValues.country },
            { label: 'CIF / NIF', value: defaultValues.cif_nif },
            { label: 'Sector', value: defaultValues.sector },
          ].map(({ label, value }) => (
            <div key={label}>
              <p className="text-xs font-semibold text-slate-400 mb-1">{label}</p>
              <p className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-500 cursor-not-allowed">
                {value || '—'}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 pt-2">
        <a
          href="/app/mi-organizacion"
          className="px-4 py-2 text-sm font-semibold text-slate-600 bg-slate-100 rounded-lg hover:bg-slate-200 transition-colors"
        >
          Cancelar
        </a>
        <button
          type="submit"
          disabled={pending}
          className="flex items-center gap-2 px-6 py-2.5 bg-mira-magenta text-white text-sm font-semibold rounded-lg hover:bg-mira-magenta-deep transition-colors disabled:opacity-60"
        >
          {pending && <Loader2 size={15} className="animate-spin" />}
          Guardar cambios
        </button>
      </div>
    </form>
  )
}

'use client'

import { useActionState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { submitSupportTicket } from '@/lib/actions/support'
import type { ActionResult } from '@/lib/actions/support'
import { Send } from 'lucide-react'

const initial: ActionResult = {}

const CATEGORIES = [
  { value: 'account',   label: 'Cuenta' },
  { value: 'data',      label: 'Datos' },
  { value: 'prices',    label: 'Precios' },
  { value: 'rfq',       label: 'Cotizaciones (RFQ)' },
  { value: 'suppliers', label: 'Proveedores' },
  { value: 'billing',   label: 'Facturación' },
  { value: 'other',     label: 'Otro' },
]

const PRIORITIES = [
  { value: 'low',    label: 'Baja' },
  { value: 'normal', label: 'Normal' },
  { value: 'high',   label: 'Alta' },
]

export function SupportForm() {
  const router = useRouter()
  const [state, formAction, pending] = useActionState(submitSupportTicket, initial)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (state.success) {
      formRef.current?.reset()
      router.refresh()
    }
  }, [state.success])

  return (
    <form ref={formRef} action={formAction} className="space-y-5">
      {/* Asunto */}
      <div>
        <label htmlFor="subject" className="block text-sm font-semibold text-slate-700 mb-1.5">
          Asunto <span className="text-red-500">*</span>
        </label>
        <input
          id="subject"
          name="subject"
          type="text"
          required
          placeholder="Describe brevemente tu solicitud"
          className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-mira-magenta/20 focus:border-mira-magenta transition-colors"
        />
      </div>

      {/* Categoría + Prioridad */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="category" className="block text-sm font-semibold text-slate-700 mb-1.5">
            Categoría <span className="text-red-500">*</span>
          </label>
          <select
            id="category"
            name="category"
            required
            defaultValue="other"
            className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-mira-magenta/20 focus:border-mira-magenta transition-colors"
          >
            {CATEGORIES.map(c => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="priority" className="block text-sm font-semibold text-slate-700 mb-1.5">
            Prioridad
          </label>
          <select
            id="priority"
            name="priority"
            defaultValue="normal"
            className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-mira-magenta/20 focus:border-mira-magenta transition-colors"
          >
            {PRIORITIES.map(p => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Mensaje */}
      <div>
        <label htmlFor="message" className="block text-sm font-semibold text-slate-700 mb-1.5">
          Mensaje <span className="text-red-500">*</span>
        </label>
        <textarea
          id="message"
          name="message"
          required
          rows={5}
          placeholder="Describe con detalle tu consulta o problema…"
          className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-mira-magenta/20 focus:border-mira-magenta transition-colors resize-none"
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
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-mira-magenta text-white text-sm font-semibold hover:bg-mira-magenta-deep disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          <Send size={14} />
          {pending ? 'Enviando…' : 'Enviar solicitud'}
        </button>
      </div>
    </form>
  )
}

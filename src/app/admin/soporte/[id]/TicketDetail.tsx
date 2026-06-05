'use client'

import { useActionState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { updateTicketResponse, updateTicketStatus } from '@/lib/actions/support'
import type { ActionResult } from '@/lib/actions/support'
import { useState } from 'react'

interface Props {
  ticketId: string
  currentStatus: string
  currentResponse: string | null
}

const STATUSES = [
  { value: 'open',        label: 'Abierto' },
  { value: 'in_progress', label: 'En proceso' },
  { value: 'resolved',    label: 'Resuelto' },
  { value: 'closed',      label: 'Cerrado' },
]

const initial: ActionResult = {}

export function TicketDetail({ ticketId, currentStatus, currentResponse }: Props) {
  const router = useRouter()
  const [state, formAction, pending] = useActionState(updateTicketResponse, initial)
  const [quickStatus, setQuickStatus] = useState<ActionResult>({})
  const [loadingStatus, setLoadingStatus] = useState(false)

  useEffect(() => {
    if (state.success) router.refresh()
  }, [state.success])

  const handleStatusChange = async (newStatus: string) => {
    setLoadingStatus(true)
    setQuickStatus({})
    const result = await updateTicketStatus(ticketId, newStatus)
    setQuickStatus(result)
    setLoadingStatus(false)
    if (result.success) router.refresh()
  }

  return (
    <div className="space-y-6">
      {/* Cambio rápido de estado */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <p className="text-sm font-semibold text-slate-700 mb-3">Cambiar estado</p>
        <div className="flex flex-wrap gap-2">
          {STATUSES.map(s => (
            <button
              key={s.value}
              onClick={() => handleStatusChange(s.value)}
              disabled={loadingStatus || s.value === currentStatus}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold border transition-colors disabled:cursor-not-allowed ${
                s.value === currentStatus
                  ? 'bg-mira-primary text-white border-mira-primary'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        {quickStatus.error   && <p className="text-xs text-red-600 mt-2">{quickStatus.error}</p>}
        {quickStatus.success && <p className="text-xs text-emerald-600 mt-2">{quickStatus.success}</p>}
      </div>

      {/* Respuesta admin */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <p className="text-sm font-semibold text-slate-700 mb-3">Respuesta al usuario</p>
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="ticket_id" value={ticketId} />
          <input type="hidden" name="status"    value={currentStatus} />
          <textarea
            name="admin_response"
            rows={5}
            defaultValue={currentResponse ?? ''}
            placeholder="Escribe una respuesta interna para el usuario…"
            className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-mira-primary/30 focus:border-mira-primary transition-colors resize-none"
          />
          {state.error   && <p className="text-xs text-red-600">{state.error}</p>}
          {state.success && <p className="text-xs text-emerald-600">{state.success}</p>}
          <button
            type="submit"
            disabled={pending}
            className="px-4 py-2 rounded-lg bg-mira-primary text-white text-sm font-semibold hover:bg-mira-primary/90 disabled:opacity-60 transition-colors"
          >
            {pending ? 'Guardando…' : 'Guardar respuesta'}
          </button>
        </form>
      </div>
    </div>
  )
}

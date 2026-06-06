'use client'

import { useActionState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { updateTicketResponse, updateTicketStatus } from '@/lib/actions/support'
import type { ActionResult } from '@/lib/actions/support'
import { useState } from 'react'
import { SlidersHorizontal, MessageSquare } from 'lucide-react'
import { miraBtn, miraField } from '@/lib/miraButtons'
import { MiraSectionCard } from '@/components/mira/MiraSectionCard'

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
      <MiraSectionCard title="Cambiar estado" icon={SlidersHorizontal} bodyClassName="p-5">
        <div className="flex flex-wrap gap-2">
          {STATUSES.map(s => (
            <button
              key={s.value}
              onClick={() => handleStatusChange(s.value)}
              disabled={loadingStatus || s.value === currentStatus}
              className={`rounded-xl px-4 py-1.5 text-xs font-bold transition-colors disabled:cursor-not-allowed ${
                s.value === currentStatus
                  ? 'bg-mira-magenta text-white shadow-lg shadow-mira-magenta/25'
                  : 'border border-mira-line bg-white text-slate-600 hover:border-mira-magenta/30 hover:text-mira-magenta'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        {quickStatus.error   && <p className="mt-2 text-xs text-red-600">{quickStatus.error}</p>}
        {quickStatus.success && <p className="mt-2 text-xs text-emerald-600">{quickStatus.success}</p>}
      </MiraSectionCard>

      {/* Respuesta admin */}
      <MiraSectionCard title="Respuesta al usuario" icon={MessageSquare} bodyClassName="p-5">
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="ticket_id" value={ticketId} />
          <input type="hidden" name="status"    value={currentStatus} />
          <textarea
            name="admin_response"
            rows={5}
            defaultValue={currentResponse ?? ''}
            placeholder="Escribe una respuesta interna para el usuario…"
            className={`${miraField} resize-none`}
          />
          {state.error   && <p className="text-xs text-red-600">{state.error}</p>}
          {state.success && <p className="text-xs text-emerald-600">{state.success}</p>}
          <button type="submit" disabled={pending} className={miraBtn.primary}>
            {pending ? 'Guardando…' : 'Guardar respuesta'}
          </button>
        </form>
      </MiraSectionCard>
    </div>
  )
}

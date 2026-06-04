'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { X, UserPlus } from 'lucide-react'
import { addOrganizationMember } from '@/lib/actions/users'
import type { UserProfile, OrgMemberRole } from '@/lib/actions/users'

interface Props {
  orgId: string
  existingMemberIds: string[]
  allUsers: UserProfile[]
}

const inputCls = 'w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-mira-primary/30 focus:border-mira-primary'

function fullName(u: UserProfile) {
  return [u.first_name, u.last_name].filter(Boolean).join(' ') || u.email
}

export function AddMemberModal({ orgId, existingMemberIds, allUsers }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [userId, setUserId] = useState('')
  const [role, setRole] = useState<OrgMemberRole>('client_member')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const available = allUsers.filter((u) => !existingMemberIds.includes(u.id))

  function handleClose() {
    setOpen(false)
    setUserId('')
    setRole('client_member')
    setError(null)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (!userId) { setError('Selecciona un usuario.'); return }

    startTransition(async () => {
      try {
        await addOrganizationMember(orgId, userId, role)
        router.refresh()
        handleClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error inesperado.')
      }
    })
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-bold bg-mira-primary text-white rounded-lg hover:bg-mira-primary/90 transition-colors"
      >
        <UserPlus size={14} />
        Añadir miembro
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40" onClick={handleClose} />

          {/* Modal */}
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md p-6 z-10">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-base font-heading font-bold text-slate-900">Añadir miembro</h3>
              <button onClick={handleClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 transition-colors">
                <X size={16} />
              </button>
            </div>

            {error && (
              <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            {available.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-4">
                Todos los usuarios ya son miembros de esta organización.
              </p>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                    Usuario <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={userId}
                    onChange={(e) => setUserId(e.target.value)}
                    className={inputCls}
                  >
                    <option value="">— Seleccionar usuario —</option>
                    {available.map((u) => (
                      <option key={u.id} value={u.id}>
                        {fullName(u)}{u.email ? ` · ${u.email}` : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                    Rol en la organización
                  </label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value as OrgMemberRole)}
                    className={inputCls}
                  >
                    <option value="client_member">Client Member</option>
                    <option value="client_owner">Client Owner</option>
                  </select>
                </div>

                <div className="flex justify-end gap-3 pt-2">
                  <button
                    type="button"
                    onClick={handleClose}
                    className="px-4 py-2 text-sm font-semibold text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={isPending}
                    className="px-5 py-2 text-sm font-bold bg-mira-primary text-white rounded-lg hover:bg-mira-primary/90 transition-colors disabled:opacity-60"
                  >
                    {isPending ? 'Añadiendo…' : 'Añadir miembro'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}

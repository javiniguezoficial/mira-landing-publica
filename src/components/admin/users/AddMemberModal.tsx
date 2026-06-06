'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { X, UserPlus } from 'lucide-react'
import { addOrganizationMember } from '@/lib/actions/users'
import type { UserProfile, OrgMemberRole } from '@/lib/actions/users'
import { miraBtn, miraField, miraLabel } from '@/lib/miraButtons'

interface Props {
  orgId: string
  existingMemberIds: string[]
  allUsers: UserProfile[]
}

const inputCls = miraField

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
      <button onClick={() => setOpen(true)} className={miraBtn.primary}>
        <UserPlus size={14} />
        Añadir miembro
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40" onClick={handleClose} />

          {/* Modal */}
          <div className="relative z-10 w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-base font-black text-mira-ink">Añadir miembro</h3>
              <button onClick={handleClose} className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-mira-canvas">
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
                  <label className={miraLabel}>
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
                  <label className={miraLabel}>
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
                  <button type="button" onClick={handleClose} className={miraBtn.ghost}>
                    Cancelar
                  </button>
                  <button type="submit" disabled={isPending} className={miraBtn.primary}>
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

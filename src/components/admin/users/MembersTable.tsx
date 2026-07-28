'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, ChevronDown } from 'lucide-react'
import { removeOrganizationMember, updateOrganizationMemberRole } from '@/lib/actions/users'
import { MiraStatusBadge } from '@/components/mira/MiraStatusBadge'
import type { OrgMember, OrgMemberRole } from '@/lib/actions/users'
import { organizationRoleLabel } from '@/lib/identity'

function fmt(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fullName(m: OrgMember) {
  const u = m.user
  return [u?.first_name, u?.last_name].filter(Boolean).join(' ') || '—'
}

function MemberRow({ member, onMutate }: { member: OrgMember; onMutate: () => void }) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleRoleChange(newRole: OrgMemberRole) {
    setError(null)
    startTransition(async () => {
      try {
        await updateOrganizationMemberRole(member.id, newRole)
        onMutate()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error al cambiar rol.')
      }
    })
  }

  function handleRemove() {
    if (!confirm(`¿Eliminar a ${fullName(member)} de la organización?`)) return
    setError(null)
    startTransition(async () => {
      try {
        await removeOrganizationMember(member.id)
        onMutate()
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Error al eliminar miembro.')
      }
    })
  }

  return (
    <>
      <tr className={`transition-colors hover:bg-mira-canvas/70 ${isPending ? 'opacity-50' : ''}`}>
        <td className="whitespace-nowrap px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-mira-magenta-soft text-xs font-bold text-mira-magenta">
              {(member.user?.first_name ?? member.user?.email)?.[0]?.toUpperCase() ?? '?'}
            </div>
            <span className="text-sm font-bold text-mira-ink">{fullName(member)}</span>
          </div>
        </td>
        <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">
          {member.user?.email || '—'}
        </td>
        <td className="whitespace-nowrap px-4 py-3">
          <div className="relative inline-flex items-center gap-1">
            <MiraStatusBadge status={member.role} kind="role" />
            <div className="relative group">
              <button
                className="rounded p-0.5 text-slate-400 transition-colors hover:text-slate-600"
                title="Cambiar rol"
                disabled={isPending}
              >
                <ChevronDown size={12} />
              </button>
              <div className="absolute left-0 top-full z-10 mt-1 hidden min-w-[130px] rounded-lg border border-mira-line bg-white shadow-lg group-focus-within:block">
                {(['client_owner', 'client_member'] as OrgMemberRole[]).map((r) => (
                  <button
                    key={r}
                    onClick={() => handleRoleChange(r)}
                    className={`w-full px-3 py-2 text-left text-xs transition-colors hover:bg-mira-canvas ${member.role === r ? 'font-bold text-mira-magenta' : 'text-slate-700'}`}
                  >
                    {organizationRoleLabel(r)}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </td>
        <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">{fmt(member.joined_at)}</td>
        <td className="whitespace-nowrap px-4 py-3">
          <button
            onClick={handleRemove}
            disabled={isPending}
            className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-40"
            title="Eliminar miembro"
          >
            <Trash2 size={14} />
          </button>
        </td>
      </tr>
      {error && (
        <tr>
          <td colSpan={5} className="px-4 pb-2">
            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded px-3 py-1.5">{error}</p>
          </td>
        </tr>
      )}
    </>
  )
}

export function MembersTable({ members, orgId }: { members: OrgMember[]; orgId: string }) {
  const router = useRouter()

  if (members.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-slate-400">
        Esta organización no tiene miembros todavía.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-mira-line bg-mira-canvas/60">
            {['Miembro', 'Email', 'Rol', 'Incorporación', ''].map((h) => (
              <th key={h} className="whitespace-nowrap px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-mira-line">
          {members.map((m) => (
            <MemberRow key={m.id} member={m} onMutate={() => router.refresh()} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

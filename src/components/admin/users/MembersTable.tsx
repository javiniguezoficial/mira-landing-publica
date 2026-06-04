'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, ChevronDown } from 'lucide-react'
import { removeOrganizationMember, updateOrganizationMemberRole } from '@/lib/actions/users'
import type { OrgMember, OrgMemberRole } from '@/lib/actions/users'

const ROLE_LABELS: Record<OrgMemberRole, string> = {
  client_owner:  'Owner',
  client_member: 'Member',
}

const ROLE_CLASSES: Record<OrgMemberRole, string> = {
  client_owner:  'bg-blue-50 text-blue-700 border-blue-200',
  client_member: 'bg-slate-100 text-slate-600 border-slate-200',
}

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
      <tr className={`hover:bg-slate-50 transition-colors ${isPending ? 'opacity-50' : ''}`}>
        <td className="px-4 py-3 whitespace-nowrap">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-full bg-mira-primary/10 flex items-center justify-center shrink-0 text-xs font-bold text-mira-primary">
              {(member.user?.first_name ?? member.user?.email)?.[0]?.toUpperCase() ?? '?'}
            </div>
            <span className="font-semibold text-slate-900 text-sm">{fullName(member)}</span>
          </div>
        </td>
        <td className="px-4 py-3 text-slate-600 text-sm whitespace-nowrap">
          {member.user?.email || '—'}
        </td>
        <td className="px-4 py-3 whitespace-nowrap">
          <div className="relative inline-flex items-center gap-1">
            <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold border ${ROLE_CLASSES[member.role]}`}>
              {ROLE_LABELS[member.role]}
            </span>
            <div className="relative group">
              <button
                className="p-0.5 rounded text-slate-400 hover:text-slate-600 transition-colors"
                title="Cambiar rol"
                disabled={isPending}
              >
                <ChevronDown size={12} />
              </button>
              <div className="absolute left-0 top-full mt-1 bg-white border border-slate-200 rounded-lg shadow-lg z-10 hidden group-focus-within:block min-w-[130px]">
                {(['client_owner', 'client_member'] as OrgMemberRole[]).map((r) => (
                  <button
                    key={r}
                    onClick={() => handleRoleChange(r)}
                    className={`w-full text-left px-3 py-2 text-xs hover:bg-slate-50 transition-colors ${member.role === r ? 'font-bold text-mira-primary' : 'text-slate-700'}`}
                  >
                    {ROLE_LABELS[r]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </td>
        <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">{fmt(member.joined_at)}</td>
        <td className="px-4 py-3 whitespace-nowrap">
          <button
            onClick={handleRemove}
            disabled={isPending}
            className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500 transition-colors disabled:opacity-40"
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
      <p className="text-sm text-slate-400 font-body text-center py-6">
        Esta organización no tiene miembros todavía.
      </p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-100 bg-slate-50">
            {['Miembro', 'Email', 'Rol', 'Incorporación', ''].map((h) => (
              <th key={h} className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {members.map((m) => (
            <MemberRow key={m.id} member={m} onMutate={() => router.refresh()} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

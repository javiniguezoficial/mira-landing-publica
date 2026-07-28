'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Eye, Users } from 'lucide-react'
import { MiraTable, MiraTr, MiraTd } from '@/components/mira/MiraTable'
import { MiraStatusBadge } from '@/components/mira/MiraStatusBadge'
import { MiraFilterBar } from '@/components/mira/MiraFilterBar'
import { MiraSearchInput } from '@/components/mira/MiraSearchInput'
import { EmptyState } from '@/components/shared/EmptyState'
import { miraField, miraBtn } from '@/lib/miraButtons'
import type { UserProfile, GlobalRole } from '@/lib/actions/users'

const ROLE_OPTIONS: { value: GlobalRole | ''; label: string }[] = [
  { value: '',               label: 'Todos los roles' },
  { value: 'platform_admin', label: 'Admin' },
  { value: 'user',           label: 'Usuario' },
]

function fmt(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
}

function fullName(u: UserProfile) {
  return [u.first_name, u.last_name].filter(Boolean).join(' ') || '—'
}

export function UsersTable({ users }: { users: UserProfile[] }) {
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState<GlobalRole | ''>('')

  const filtered = users.filter((u) => {
    const name = fullName(u).toLowerCase()
    const matchSearch =
      name.includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
    const matchRole = !roleFilter || u.role === roleFilter
    return matchSearch && matchRole
  })

  return (
    <div className="space-y-4">
      <MiraFilterBar>
        <MiraSearchInput
          value={search}
          onChange={setSearch}
          placeholder="Buscar por nombre o email…"
          className="flex-1 sm:max-w-sm"
        />
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as GlobalRole | '')}
          className={`${miraField} sm:w-52`}
        >
          {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </MiraFilterBar>

      {filtered.length === 0 ? (
        <div className="mira-card rounded-2xl">
          <EmptyState
            icon={Users}
            title={users.length === 0 ? 'Aún no hay usuarios' : 'Sin resultados'}
            description={users.length === 0 ? 'Los usuarios registrados aparecerán aquí.' : 'Prueba con otros términos de búsqueda.'}
          />
        </div>
      ) : (
        <MiraTable headers={['Nombre', 'Email', 'Rol', 'Alta', { label: '', align: 'right' }]}>
          {filtered.map((u) => (
            <MiraTr key={u.id}>
              <MiraTd>
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-mira-magenta-soft text-xs font-bold text-mira-magenta">
                    {(u.first_name ?? u.email)?.[0]?.toUpperCase() ?? '?'}
                  </div>
                  <span className="font-bold text-mira-ink">{fullName(u)}</span>
                </div>
              </MiraTd>
              <MiraTd className="text-slate-600">{u.email || '—'}</MiraTd>
              <MiraTd><MiraStatusBadge status={u.role} kind="role" /></MiraTd>
              <MiraTd className="text-xs text-slate-500">{fmt(u.created_at)}</MiraTd>
              <MiraTd align="right">
                <Link href={`/admin/usuarios/${u.id}`} className={miraBtn.icon} title="Ver detalle">
                  <Eye size={15} />
                </Link>
              </MiraTd>
            </MiraTr>
          ))}
        </MiraTable>
      )}

      <p className="text-xs text-slate-400">
        {filtered.length} {filtered.length === 1 ? 'usuario' : 'usuarios'}
        {roleFilter || search ? ` (de ${users.length} total)` : ''}
      </p>
    </div>
  )
}

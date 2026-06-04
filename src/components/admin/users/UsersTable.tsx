'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Eye, Search } from 'lucide-react'
import { UserRoleBadge } from './UserRoleBadge'
import type { UserProfile, GlobalRole } from '@/lib/actions/users'

const ROLE_OPTIONS: { value: GlobalRole | ''; label: string }[] = [
  { value: '',               label: 'Todos los roles' },
  { value: 'platform_admin', label: 'Admin' },
  { value: 'client_owner',   label: 'Client Owner' },
  { value: 'client_member',  label: 'Client Member' },
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
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por nombre o email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-mira-primary/30 focus:border-mira-primary"
          />
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as GlobalRole | '')}
          className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-mira-primary/30 focus:border-mira-primary"
        >
          {ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-400 text-sm font-body">
            {users.length === 0 ? 'No hay usuarios todavía.' : 'Sin resultados para esa búsqueda.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {['Nombre', 'Email', 'Rol', 'Alta', ''].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-mira-primary/10 flex items-center justify-center shrink-0 text-xs font-bold text-mira-primary">
                          {(u.first_name ?? u.email)?.[0]?.toUpperCase() ?? '?'}
                        </div>
                        <span className="font-semibold text-slate-900">{fullName(u)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{u.email || '—'}</td>
                    <td className="px-4 py-3 whitespace-nowrap"><UserRoleBadge role={u.role} /></td>
                    <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">{fmt(u.created_at)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <Link
                        href={`/admin/usuarios/${u.id}`}
                        className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors inline-flex"
                        title="Ver detalle"
                      >
                        <Eye size={15} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-slate-400 font-body">
        {filtered.length} {filtered.length === 1 ? 'usuario' : 'usuarios'}
        {roleFilter || search ? ` (de ${users.length} total)` : ''}
      </p>
    </div>
  )
}

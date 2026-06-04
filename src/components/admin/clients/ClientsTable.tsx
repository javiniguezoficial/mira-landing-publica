'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Eye, Pencil, Search } from 'lucide-react'
import { ClientStatusBadge } from './ClientStatusBadge'
import type { Organization, SubscriptionStatus } from '@/lib/actions/organizations'

const TYPE_LABEL: Record<string, string> = { fisica: 'Física', juridica: 'Jurídica' }

function fmt(dateStr: string) {
  return new Date(dateStr).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
}

const STATUS_OPTIONS: { value: SubscriptionStatus | ''; label: string }[] = [
  { value: '', label: 'Todos los estados' },
  { value: 'trial',     label: 'Trial' },
  { value: 'active',    label: 'Activo' },
  { value: 'past_due',  label: 'Vencido' },
  { value: 'cancelled', label: 'Cancelado' },
  { value: 'expired',   label: 'Expirado' },
]

export function ClientsTable({ orgs }: { orgs: Organization[] }) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<SubscriptionStatus | ''>('')

  const filtered = orgs.filter((o) => {
    const matchSearch =
      o.name.toLowerCase().includes(search.toLowerCase()) ||
      (o.cif_nif ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (o.email ?? '').toLowerCase().includes(search.toLowerCase())
    const matchStatus = !statusFilter || o.subscription_status === statusFilter
    return matchSearch && matchStatus
  })

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por nombre, CIF o email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-mira-primary/30 focus:border-mira-primary"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as SubscriptionStatus | '')}
          className="text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-mira-primary/30 focus:border-mira-primary"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {filtered.length === 0 ? (
          <div className="text-center py-16 text-slate-400 text-sm font-body">
            {orgs.length === 0 ? 'No hay organizaciones todavía.' : 'Sin resultados para esa búsqueda.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  {['Empresa', 'Tipo', 'CIF/NIF', 'Email', 'Ciudad / País', 'Plan', 'Estado', 'Alta', ''].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-wider whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((org) => (
                  <tr key={org.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-4 py-3 font-semibold text-slate-900 whitespace-nowrap">
                      {org.name}
                    </td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                      {TYPE_LABEL[org.type ?? ''] ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-600 font-mono text-xs whitespace-nowrap">
                      {org.cif_nif ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                      {org.email ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                      {[org.city, org.country].filter(Boolean).join(' / ') || '—'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {org.plan ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-mira-primary/10 text-mira-primary border border-mira-primary/20">
                          {org.plan.name}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <ClientStatusBadge status={org.subscription_status} />
                    </td>
                    <td className="px-4 py-3 text-slate-500 text-xs whitespace-nowrap">
                      {fmt(org.created_at)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/admin/clientes/${org.id}`}
                          className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                          title="Ver detalle"
                        >
                          <Eye size={15} />
                        </Link>
                        <Link
                          href={`/admin/clientes/${org.id}/editar`}
                          className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
                          title="Editar"
                        >
                          <Pencil size={15} />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-xs text-slate-400 font-body">
        {filtered.length} {filtered.length === 1 ? 'organización' : 'organizaciones'}
        {statusFilter || search ? ` (de ${orgs.length} total)` : ''}
      </p>
    </div>
  )
}

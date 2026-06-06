'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Eye, Pencil, Building2 } from 'lucide-react'
import { MiraTable, MiraTr, MiraTd } from '@/components/mira/MiraTable'
import { MiraStatusBadge } from '@/components/mira/MiraStatusBadge'
import { MiraFilterBar } from '@/components/mira/MiraFilterBar'
import { MiraSearchInput } from '@/components/mira/MiraSearchInput'
import { EmptyState } from '@/components/shared/EmptyState'
import { miraField, miraBtn } from '@/lib/miraButtons'
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
      <MiraFilterBar>
        <MiraSearchInput
          value={search}
          onChange={setSearch}
          placeholder="Buscar por nombre, CIF o email…"
          className="flex-1 sm:max-w-sm"
        />
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as SubscriptionStatus | '')}
          className={`${miraField} sm:w-52`}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </MiraFilterBar>

      {/* Tabla */}
      {filtered.length === 0 ? (
        <div className="mira-card rounded-2xl">
          <EmptyState
            icon={Building2}
            title={orgs.length === 0 ? 'Aún no hay organizaciones' : 'Sin resultados'}
            description={orgs.length === 0 ? 'Crea la primera organización para empezar.' : 'Prueba con otros términos de búsqueda.'}
            {...(orgs.length === 0 ? { action: { label: 'Nueva organización', href: '/admin/clientes/nuevo' } } : {})}
          />
        </div>
      ) : (
        <MiraTable
          headers={['Empresa', 'Tipo', 'CIF/NIF', 'Email', 'Ciudad / País', 'Plan', 'Estado', 'Alta', { label: '', align: 'right' }]}
        >
          {filtered.map((org) => (
            <MiraTr key={org.id}>
              <MiraTd className="font-bold text-mira-ink">{org.name}</MiraTd>
              <MiraTd className="text-slate-600">{TYPE_LABEL[org.type ?? ''] ?? '—'}</MiraTd>
              <MiraTd className="font-mono text-xs text-slate-600">{org.cif_nif ?? '—'}</MiraTd>
              <MiraTd className="text-slate-600">{org.email ?? '—'}</MiraTd>
              <MiraTd className="text-slate-600">{[org.city, org.country].filter(Boolean).join(' / ') || '—'}</MiraTd>
              <MiraTd>
                {org.plan ? (
                  <span className="inline-flex items-center rounded-lg bg-mira-magenta-soft px-2 py-0.5 text-xs font-bold text-mira-magenta">
                    {org.plan.name}
                  </span>
                ) : (
                  <span className="text-xs text-slate-400">—</span>
                )}
              </MiraTd>
              <MiraTd><MiraStatusBadge status={org.subscription_status} kind="sub" /></MiraTd>
              <MiraTd className="text-xs text-slate-500">{fmt(org.created_at)}</MiraTd>
              <MiraTd align="right">
                <div className="flex items-center justify-end gap-1">
                  <Link href={`/admin/clientes/${org.id}`} className={miraBtn.icon} title="Ver detalle">
                    <Eye size={15} />
                  </Link>
                  <Link href={`/admin/clientes/${org.id}/editar`} className={miraBtn.icon} title="Editar">
                    <Pencil size={15} />
                  </Link>
                </div>
              </MiraTd>
            </MiraTr>
          ))}
        </MiraTable>
      )}

      <p className="text-xs text-slate-400">
        {filtered.length} {filtered.length === 1 ? 'organización' : 'organizaciones'}
        {statusFilter || search ? ` (de ${orgs.length} total)` : ''}
      </p>
    </div>
  )
}

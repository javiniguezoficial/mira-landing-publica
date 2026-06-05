import { listAllRfqs, type RfqStatus } from '@/lib/actions/rfqs'
import { AdminRfqsTable } from '@/components/admin/rfqs/AdminRfqsTable'
import Link from 'next/link'

const STATUS_LABELS: Record<string, string> = {
  all:       'Todas',
  draft:     'Borrador',
  open:      'Abiertas',
  closed:    'Cerradas',
  awarded:   'Adjudicadas',
  cancelled: 'Canceladas',
}

export default async function AdminRfqsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const { status } = await searchParams
  const statusFilter = status && status !== 'all' ? (status as RfqStatus) : undefined
  const rfqs = await listAllRfqs(statusFilter)

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-heading font-bold text-slate-900">RFQs</h1>
        <p className="text-sm text-slate-500 mt-1">
          Todas las solicitudes de cotización de la plataforma
        </p>
      </div>

      {/* Filtros de estado */}
      <div className="flex items-center gap-2 mb-6 flex-wrap">
        {Object.entries(STATUS_LABELS).map(([key, label]) => {
          const isActive = (key === 'all' && !statusFilter) || key === statusFilter
          return (
            <Link
              key={key}
              href={`/admin/rfqs${key === 'all' ? '' : `?status=${key}`}`}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                isActive
                  ? 'bg-mira-primary text-white border-mira-primary'
                  : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'
              }`}
            >
              {label}
            </Link>
          )
        })}
        <span className="ml-auto text-xs text-slate-400">{rfqs.length} resultados</span>
      </div>

      <AdminRfqsTable rfqs={rfqs} />
    </div>
  )
}

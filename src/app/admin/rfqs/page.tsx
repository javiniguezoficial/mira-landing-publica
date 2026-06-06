import Link from 'next/link'
import { FileText } from 'lucide-react'
import { listAllRfqs, type RfqStatus } from '@/lib/actions/rfqs'
import { AdminRfqsTable } from '@/components/admin/rfqs/AdminRfqsTable'
import { MiraPageHeader } from '@/components/mira/MiraPageHeader'

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
    <div className="mx-auto w-full max-w-6xl space-y-6 p-4 md:p-6 xl:p-8">
      <MiraPageHeader
        icon={FileText}
        title="RFQs"
        subtitle="Todas las solicitudes de cotización de la plataforma"
      />

      {/* Filtros de estado */}
      <div className="flex flex-wrap items-center gap-2">
        {Object.entries(STATUS_LABELS).map(([key, label]) => {
          const isActive = (key === 'all' && !statusFilter) || key === statusFilter
          return (
            <Link
              key={key}
              href={`/admin/rfqs${key === 'all' ? '' : `?status=${key}`}`}
              className={`rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
                isActive
                  ? 'bg-mira-magenta text-white shadow-lg shadow-mira-magenta/25'
                  : 'border border-mira-line bg-white text-slate-600 hover:border-mira-magenta/30 hover:text-mira-magenta'
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

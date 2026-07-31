import Link from 'next/link'
import { ArrowLeft, Trash2, History, ShieldAlert } from 'lucide-react'
import { PriceDeletionWizard } from '@/components/admin/prices/PriceDeletionWizard'
import { listDeletionBatches } from '@/lib/actions/price-deletions'
import { listImportBatches } from '@/lib/actions/market-imports'
import { getPricingTree } from '@/lib/actions/prices'
import {
  DELETION_BATCH_STATUS_LABELS,
  DELETION_MODE_LABELS,
  describeDeletionFilters,
  type DeletionBatchStatus,
} from '@/lib/prices/deletion'
import { MiraPageHeader } from '@/components/mira/MiraPageHeader'
import { MiraTable, MiraTr, MiraTd } from '@/components/mira/MiraTable'
import { miraBtn } from '@/lib/miraButtons'

export const dynamic = 'force-dynamic'

// El acceso lo corta `AdminLayout` con `requirePlatformAdmin` antes de
// renderizar nada. Aquí no se repite: las acciones y RLS vuelven a cortarlo por
// su cuenta en cada operación.

const CURRENCIES = ['EUR', 'USD', 'GBP']

const ESTILO: Record<DeletionBatchStatus, string> = {
  ready: 'bg-blue-50 text-blue-700',
  completed: 'bg-emerald-50 text-emerald-700',
  completed_with_errors: 'bg-amber-50 text-amber-700',
  cancelled: 'bg-slate-100 text-slate-500',
  failed: 'bg-red-50 text-red-700',
}

export default async function EliminarPreciosPage() {
  const [tree, imports, historial] = await Promise.all([
    getPricingTree(),
    listImportBatches(25),
    listDeletionBatches(10),
  ])

  return (
    <div className="w-full max-w-5xl space-y-6 p-4 md:p-6 xl:p-8">
      <MiraPageHeader
        icon={Trash2}
        title="Eliminar precios"
        subtitle="Retira precios mal cargados y deja el histórico limpio, con copia de seguridad"
        actions={
          <Link href="/admin/precios" className={miraBtn.ghost}>
            <ArrowLeft size={14} /> Volver a precios
          </Link>
        }
      />

      <section className="rounded-2xl border border-red-200 bg-red-50/60 p-5">
        <div className="mb-2 flex items-center gap-2">
          <ShieldAlert size={15} className="text-red-600" />
          <h2 className="text-sm font-black text-mira-ink">Antes de empezar</h2>
        </div>
        <div className="space-y-1.5 text-xs leading-relaxed text-slate-600">
          <p>
            · Cada precio se <span className="font-bold">copia entero</span> antes de borrarlo. La copia
            queda en el registro de auditoría de la operación, así que siempre se puede saber qué
            había y reconstruirlo.
          </p>
          <p>
            · <span className="font-bold">No se tocan</span> productos, referencias, mercados, unidades
            configuradas ni la lonja de la ficha. Solo se borran registros de precio.
          </p>
          <p>
            · Al eliminar una importación completa se borra también su registro, de modo que puedes
            volver a subir el mismo archivo corregido sin que quede señalado como repetido.
          </p>
          <p>
            · El borrado no se puede deshacer desde esta pantalla.
          </p>
        </div>
      </section>

      <PriceDeletionWizard
        markets={tree.markets.map((m) => ({ id: m.id, name: m.name }))}
        products={tree.products.map((p) => ({ id: p.id, name: p.name, market_id: p.market_id }))}
        lonjas={tree.facets.lonjas}
        currencies={CURRENCIES}
        units={tree.facets.units}
        imports={imports.map((b) => ({
          id: b.id,
          filename: b.filename,
          periodLabel: b.periodLabel,
          status: b.status,
          importedRows: b.importedRows,
          createdAt: b.createdAt,
        }))}
      />

      {/* Historial de borrados: la auditoría, visible */}
      <section className="mira-card overflow-hidden rounded-2xl">
        <div className="flex items-center gap-2 border-b border-mira-line px-5 py-3.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-mira-magenta-soft">
            <History size={14} className="text-mira-magenta" />
          </div>
          <h2 className="text-sm font-black text-mira-ink">Borrados recientes</h2>
        </div>

        {historial.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-400">
            Todavía no se ha eliminado ningún precio.
          </p>
        ) : (
          <MiraTable headers={['Tipo', 'Criterios', 'Estado', 'Eliminados', 'Fecha', 'Usuario']}>
            {historial.map((b) => (
              <MiraTr key={b.id}>
                <MiraTd>
                  <span className="text-xs font-semibold text-mira-ink">{DELETION_MODE_LABELS[b.mode]}</span>
                </MiraTd>
                <MiraTd>
                  <span className="text-xs text-slate-500">
                    {b.mode === 'import'
                      ? ((b.metadata?.sourceImportBatch as { filename?: string })?.filename ?? '—')
                      : b.mode === 'all'
                        ? 'Todo el histórico'
                        : describeDeletionFilters(b.filters)}
                  </span>
                </MiraTd>
                <MiraTd>
                  <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${ESTILO[b.status]}`}>
                    {DELETION_BATCH_STATUS_LABELS[b.status]}
                  </span>
                </MiraTd>
                <MiraTd>
                  <span className="font-bold text-slate-700">{b.deletedRows}</span>
                  <span className="ml-1 text-[10px] text-slate-400">de {b.totalRows}</span>
                </MiraTd>
                <MiraTd>
                  <span className="text-xs text-slate-500">
                    {new Date(b.createdAt).toLocaleDateString('es-ES', {
                      day: '2-digit', month: 'short', year: 'numeric',
                    })}
                  </span>
                </MiraTd>
                <MiraTd>
                  <span className="text-xs text-slate-500">{b.createdByName ?? '—'}</span>
                </MiraTd>
              </MiraTr>
            ))}
          </MiraTable>
        )}
      </section>
    </div>
  )
}

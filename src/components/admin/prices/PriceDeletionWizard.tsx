'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Trash2, AlertTriangle, Loader2, Eye, ShieldAlert, CheckCircle2, FileSpreadsheet,
} from 'lucide-react'
import {
  applyDeletion,
  cancelDeletion,
  createDeletionPreview,
} from '@/lib/actions/price-deletions'
import {
  DELETION_MODE_LABELS,
  DELETION_PREVIEW_PAGE_SIZE,
  confirmPhraseFor,
  describeDeletionFilters,
  isConfirmPhraseValid,
  type DeletionBatchSummary,
  type DeletionMode,
  type DeletionPreviewRow,
  type PriceDeletionFilters,
} from '@/lib/prices/deletion'
import { miraBtn, miraField, miraLabel } from '@/lib/miraButtons'
import { cn } from '@/lib/utils'

export interface ImportBatchOption {
  id: string
  filename: string
  periodLabel: string
  status: string
  importedRows: number
  createdAt: string
}

interface Props {
  markets: { id: string; name: string }[]
  products: { id: string; name: string; market_id: string }[]
  lonjas: string[]
  currencies: string[]
  units: string[]
  imports: ImportBatchOption[]
}

/**
 * Asistente de borrado de precios (035).
 *
 * Tres pasos y ninguno se puede saltar: elegir → revisar → escribir la frase.
 *
 * ── Qué NO viaja por aquí ───────────────────────────────────────────────────
 *
 * Los identificadores de los precios. La vista previa los guarda en servidor
 * junto con una copia completa de cada fila, y la confirmación solo manda el
 * identificador de la operación. Aunque alguien reescribiera el estado de React
 * desde la consola del navegador, lo único que llegaría al servidor sería un
 * uuid de lote.
 */
export function PriceDeletionWizard({ markets, products, lonjas, currencies, units, imports }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [mode, setMode] = useState<DeletionMode>('filters')
  const [filters, setFilters] = useState<PriceDeletionFilters>({})
  const [importId, setImportId] = useState('')

  const [batch, setBatch] = useState<DeletionBatchSummary | null>(null)
  const [rows, setRows] = useState<DeletionPreviewRow[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)

  const [frase, setFrase] = useState('')
  const [entendido, setEntendido] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resultado, setResultado] = useState<{ deleted: number; skipped: number; importBatch: number } | null>(null)

  const productosDelMercado = filters.market_id
    ? products.filter((p) => p.market_id === filters.market_id)
    : products

  function set(campo: keyof PriceDeletionFilters, valor: string) {
    setFilters((prev) => {
      const siguiente = { ...prev, [campo]: valor || undefined }
      // Cambiar de mercado invalida la referencia elegida: seguiría apuntando a
      // un producto de otro mercado y el filtro no devolvería nada.
      if (campo === 'market_id') delete siguiente.product_id
      return siguiente
    })
  }

  async function cargarFilas(batchId: string, nuevaPagina: number) {
    const res = await fetch(`/api/admin/price-deletion-rows?batchId=${encodeURIComponent(batchId)}&page=${nuevaPagina}`)
    if (!res.ok) return
    const data = (await res.json()) as { rows: DeletionPreviewRow[]; total: number }
    setRows(data.rows)
    setTotal(data.total)
  }

  function previsualizar() {
    setError(null)
    setResultado(null)
    setFrase('')
    setEntendido(false)

    startTransition(async () => {
      const res = await createDeletionPreview({
        mode,
        filters: mode === 'filters' ? filters : undefined,
        sourceImportBatchId: mode === 'import' ? importId : undefined,
      })

      if (res.error) { setError(res.error); return }
      if (!res.batchId) { setError('No se ha podido preparar el borrado.'); return }

      const detalle = await fetch(`/api/admin/price-deletion-batch?batchId=${encodeURIComponent(res.batchId)}`)
      if (detalle.ok) setBatch((await detalle.json()) as DeletionBatchSummary)
      setPage(1)
      await cargarFilas(res.batchId, 1)
    })
  }

  function confirmar() {
    // Triple cierre para el doble clic: el `disabled` del botón, este retorno
    // temprano y —el único que de verdad cuenta— el `for update` sobre el lote
    // dentro de `apply_price_deletion`.
    if (!batch || pending || batch.status !== 'ready') return
    if (!isConfirmPhraseValid(frase, batch.mode, batch.totalRows)) return

    setError(null)
    startTransition(async () => {
      const res = await applyDeletion(batch.id)
      if (res.error) {
        setError(res.error)
        return
      }
      setResultado({
        deleted: res.deletedRows ?? 0,
        skipped: res.skippedRows ?? 0,
        importBatch: res.importBatchDeleted ?? 0,
      })
      const detalle = await fetch(`/api/admin/price-deletion-batch?batchId=${encodeURIComponent(batch.id)}`)
      if (detalle.ok) setBatch((await detalle.json()) as DeletionBatchSummary)
      router.refresh()
    })
  }

  function descartar() {
    if (!batch) return
    startTransition(async () => {
      const res = await cancelDeletion(batch.id)
      if (res.error) { setError(res.error); return }
      reiniciar()
      router.refresh()
    })
  }

  function reiniciar() {
    setBatch(null); setRows([]); setTotal(0); setPage(1)
    setFrase(''); setEntendido(false); setError(null); setResultado(null)
  }

  const totalPaginas = Math.max(1, Math.ceil(total / DELETION_PREVIEW_PAGE_SIZE))
  const yaBorrado = batch?.status === 'completed' || batch?.status === 'completed_with_errors'
  const fraseEsperada = batch ? confirmPhraseFor(batch.mode, batch.totalRows) : ''
  const fraseOk = batch ? isConfirmPhraseValid(frase, batch.mode, batch.totalRows) : false
  const puedeConfirmar = batch?.status === 'ready' && entendido && fraseOk

  return (
    <div className="space-y-6">
      {/* ── PASO 1 · Qué borrar ────────────────────────────────────────────── */}
      {!batch && (
        <div className="mira-card space-y-5 rounded-2xl p-5 sm:p-6">
          <div>
            <h2 className="text-sm font-black text-mira-ink">1 · Qué quieres eliminar</h2>
            <p className="mt-1 text-xs text-slate-500">
              Nada se borra en este paso. Primero se prepara una vista previa con una copia de
              seguridad de cada precio.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {(['filters', 'import', 'all'] as DeletionMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => { setMode(m); setError(null) }}
                aria-pressed={mode === m}
                className={cn(
                  'rounded-xl border px-4 py-2 text-sm font-bold transition-colors',
                  mode === m
                    ? m === 'all'
                      ? 'border-red-300 bg-red-50 text-red-700'
                      : 'border-mira-magenta/30 bg-mira-magenta-soft text-mira-magenta'
                    : 'border-mira-line bg-white text-slate-600 hover:border-mira-magenta/30',
                )}
              >
                {DELETION_MODE_LABELS[m]}
              </button>
            ))}
          </div>

          {mode === 'filters' && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className={miraLabel}>Mercado</label>
                <select value={filters.market_id ?? ''} onChange={(e) => set('market_id', e.target.value)} className={miraField}>
                  <option value="">Todos</option>
                  {markets.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
              <div>
                <label className={miraLabel}>Referencia</label>
                <select value={filters.product_id ?? ''} onChange={(e) => set('product_id', e.target.value)} className={miraField}>
                  <option value="">Todas</option>
                  {productosDelMercado.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className={miraLabel}>Lonja</label>
                <select value={filters.lonja ?? ''} onChange={(e) => set('lonja', e.target.value)} className={miraField}>
                  <option value="">Todas</option>
                  {lonjas.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div>
                <label className={miraLabel}>Moneda</label>
                <select value={filters.currency ?? ''} onChange={(e) => set('currency', e.target.value)} className={miraField}>
                  <option value="">Todas</option>
                  {currencies.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className={miraLabel}>Unidad</label>
                <select value={filters.unit ?? ''} onChange={(e) => set('unit', e.target.value)} className={miraField}>
                  <option value="">Todas</option>
                  {units.map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
              <div>
                <label className={miraLabel}>Fecha desde</label>
                <input type="date" value={filters.date_from ?? ''} onChange={(e) => set('date_from', e.target.value)} className={miraField} />
              </div>
              <div>
                <label className={miraLabel}>Fecha hasta</label>
                <input type="date" value={filters.date_to ?? ''} onChange={(e) => set('date_to', e.target.value)} className={miraField} />
              </div>
            </div>
          )}

          {mode === 'import' && (
            <div>
              <label className={miraLabel}>Importación</label>
              {imports.length === 0 ? (
                <p className="text-sm text-slate-400">No hay ninguna importación registrada.</p>
              ) : (
                <select value={importId} onChange={(e) => setImportId(e.target.value)} className={miraField}>
                  <option value="">Selecciona una importación…</option>
                  {imports.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.filename} · {b.periodLabel} · {b.importedRows} importadas ·{' '}
                      {new Date(b.createdAt).toLocaleDateString('es-ES')}
                    </option>
                  ))}
                </select>
              )}
              <p className="mt-2 text-xs text-slate-500">
                Se eliminarán sus precios, sus filas técnicas y el propio registro de importación.
                Después podrás volver a subir el mismo archivo corregido.
              </p>
            </div>
          )}

          {mode === 'all' && (
            <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <ShieldAlert size={16} className="mt-0.5 shrink-0" />
              <span>
                Vas a preparar el borrado de <span className="font-bold">todo el histórico de precios</span> de
                Market Intelligence. Los productos, mercados y referencias no se tocan: solo los
                precios. Se guardará una copia de cada uno antes de borrarlo.
              </span>
            </div>
          )}

          <button
            type="button"
            onClick={previsualizar}
            disabled={pending || (mode === 'import' && !importId)}
            className={`${miraBtn.primary} disabled:opacity-40`}
          >
            {pending
              ? <><Loader2 size={14} className="animate-spin" /> Preparando…</>
              : <><Eye size={14} /> Ver qué se va a eliminar</>}
          </button>
        </div>
      )}

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      )}

      {/* ── PASO 2 · Revisar y confirmar ───────────────────────────────────── */}
      {batch && (
        <>
          <div className="mira-card rounded-2xl p-5 sm:p-6">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-sm font-black text-mira-ink">
                  {yaBorrado ? 'Borrado completado' : '2 · Revisa antes de confirmar'}
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  {DELETION_MODE_LABELS[batch.mode]} · {describeDeletionFilters(batch.filters)}
                </p>
              </div>
              {!yaBorrado && (
                <button type="button" onClick={descartar} disabled={pending} className={miraBtn.ghost}>
                  Descartar
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <div className="rounded-xl border border-mira-line bg-mira-canvas/40 px-4 py-3">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                  {yaBorrado ? 'Eliminados' : 'Se eliminarán'}
                </p>
                <p className={cn('text-xl font-black', yaBorrado ? 'text-slate-600' : 'text-red-700')}>
                  {yaBorrado ? batch.deletedRows : batch.totalRows}
                </p>
              </div>
              {batch.mode === 'import' && (
                <div className="rounded-xl border border-mira-line bg-mira-canvas/40 px-4 py-3">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Archivo</p>
                  <p className="truncate text-sm font-bold text-mira-ink">
                    {(batch.metadata?.sourceImportBatch as { filename?: string })?.filename ?? '—'}
                  </p>
                </div>
              )}
            </div>

            {resultado && (
              <div className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
                <div>
                  <p className="font-bold">
                    Se {resultado.deleted === 1 ? 'ha eliminado' : 'han eliminado'} {resultado.deleted}{' '}
                    {resultado.deleted === 1 ? 'precio' : 'precios'}.
                  </p>
                  <p className="mt-0.5 text-xs">
                    La copia de seguridad de cada uno queda guardada en esta operación.
                    {resultado.importBatch > 0 && ' La importación de origen también se ha eliminado.'}
                    {resultado.skipped > 0 && ` ${resultado.skipped} ya no existían al confirmar.`}
                  </p>
                </div>
              </div>
            )}

            {/* ── Confirmación destructiva ─────────────────────────────────── */}
            {!yaBorrado && batch.status === 'ready' && (
              <div className="mt-5 space-y-3 rounded-xl border border-red-200 bg-red-50/60 p-4">
                <p className="flex items-start gap-2 text-sm font-bold text-red-800">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0" />
                  Vas a eliminar {batch.totalRows} {batch.totalRows === 1 ? 'precio' : 'precios'}.
                  Esta acción no se puede deshacer desde la interfaz.
                </p>

                <label className="flex cursor-pointer items-start gap-2 text-xs text-red-800">
                  <input
                    type="checkbox"
                    checked={entendido}
                    onChange={(e) => setEntendido(e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-red-600"
                  />
                  <span>
                    Entiendo que los precios se eliminan de Market Intelligence y que la única copia
                    quedará en el registro de auditoría de esta operación.
                  </span>
                </label>

                <div>
                  <label htmlFor="frase-borrado" className="mb-1 block text-xs font-bold text-red-800">
                    Escribe <span className="font-mono">{fraseEsperada}</span> para habilitar el botón
                  </label>
                  <input
                    id="frase-borrado"
                    value={frase}
                    onChange={(e) => setFrase(e.target.value)}
                    autoComplete="off"
                    placeholder={fraseEsperada}
                    className={`${miraField} font-mono`}
                  />
                </div>

                <button
                  type="button"
                  onClick={confirmar}
                  disabled={pending || !puedeConfirmar}
                  className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {pending
                    ? <><Loader2 size={14} className="animate-spin" /> Eliminando…</>
                    : <><Trash2 size={14} /> {fraseEsperada}</>}
                </button>
              </div>
            )}

            {yaBorrado && (
              <button type="button" onClick={reiniciar} className={`${miraBtn.ghost} mt-5`}>
                Preparar otro borrado
              </button>
            )}
          </div>

          {/* Vista previa paginada — nunca se cargan miles de filas de golpe */}
          <div className="mira-card overflow-hidden rounded-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-mira-line px-5 py-3.5">
              <h3 className="text-sm font-black text-mira-ink">
                {yaBorrado ? 'Precios eliminados' : 'Precios que se eliminarán'}
              </h3>
              <span className="text-xs text-slate-500">{total} en total</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-left text-xs">
                <thead className="border-b border-mira-line bg-mira-canvas/40">
                  <tr className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    <th className="px-4 py-2.5">Referencia</th>
                    <th className="px-4 py-2.5">Mercado</th>
                    <th className="px-4 py-2.5">Lonja</th>
                    <th className="px-4 py-2.5">Fecha</th>
                    <th className="px-4 py-2.5">Precio</th>
                    <th className="px-4 py-2.5">Importación</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-mira-line">
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                        Esta operación no afecta a ningún precio.
                      </td>
                    </tr>
                  ) : rows.map((r) => (
                    <tr key={r.originalPriceId}>
                      <td className="px-4 py-2.5 font-semibold text-mira-ink">{r.productName ?? '—'}</td>
                      <td className="px-4 py-2.5 text-slate-600">{r.marketName ?? '—'}</td>
                      <td className="px-4 py-2.5 text-slate-600">{r.lonja ?? '—'}</td>
                      <td className="px-4 py-2.5 font-mono text-slate-600">{r.recordedAt ?? '—'}</td>
                      <td className="px-4 py-2.5 font-mono text-slate-600">
                        {r.price !== null ? `${r.price} ${r.currency ?? ''}/${r.unit ?? ''}` : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-slate-400">
                        {r.sourceImportBatchId ? <FileSpreadsheet size={13} /> : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPaginas > 1 && (
              <div className="flex items-center justify-between border-t border-mira-line px-5 py-3">
                <span className="text-xs text-slate-500">Página {page} de {totalPaginas}</span>
                <div className="flex gap-2">
                  <button
                    type="button" disabled={page <= 1 || pending}
                    onClick={() => { const p = page - 1; setPage(p); startTransition(async () => { await cargarFilas(batch.id, p) }) }}
                    className={`${miraBtn.ghost} disabled:opacity-40`}
                  >
                    Anterior
                  </button>
                  <button
                    type="button" disabled={page >= totalPaginas || pending}
                    onClick={() => { const p = page + 1; setPage(p); startTransition(async () => { await cargarFilas(batch.id, p) }) }}
                    className={`${miraBtn.ghost} disabled:opacity-40`}
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

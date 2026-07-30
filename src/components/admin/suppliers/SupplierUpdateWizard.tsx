'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Upload, CheckCircle2, AlertTriangle, XCircle, Copy, Download,
  Loader2, ArrowRight, FileSpreadsheet,
} from 'lucide-react'
import {
  applySupplierUpdateBatch,
  cancelSupplierUpdateBatch,
  validateSupplierUpdateFile,
  type HeaderIssues,
  type UpdateRowView,
} from '@/lib/actions/supplier-updates'
// Los tipos viven en el módulo puro, no en el de acciones: un fichero
// `'use server'` solo puede exportar funciones asíncronas.
import {
  MAX_UPDATE_FILE_BYTES,
  MAX_UPDATE_ROWS,
  ROW_STATUS_LABELS,
  UPDATE_PREVIEW_PAGE_SIZE,
  fieldSpec,
  type NormalizedValue,
  type UpdatableField,
  type UpdateBatchSummary,
  type UpdateRowStatus,
} from '@/lib/suppliers/bulk-update/types'
import { displayValue } from '@/lib/suppliers/bulk-update/validation'
import { miraBtn } from '@/lib/miraButtons'
import { cn } from '@/lib/utils'

type RowFilter = 'all' | UpdateRowStatus

const ESTILO_FILA: Record<UpdateRowStatus, string> = {
  valid: 'bg-emerald-50 text-emerald-700',
  unchanged: 'bg-slate-100 text-slate-500',
  invalid: 'bg-red-50 text-red-700',
  duplicate_id: 'bg-amber-50 text-amber-700',
  updated: 'bg-emerald-50 text-emerald-700',
  skipped: 'bg-amber-50 text-amber-700',
  failed: 'bg-red-50 text-red-700',
}

const FILTROS: [RowFilter, string][] = [
  ['all', 'Todas'],
  ['valid', 'Se actualizarán'],
  ['unchanged', 'Sin cambios'],
  ['invalid', 'Inválidas'],
  ['duplicate_id', 'ID repetido'],
  ['updated', 'Actualizadas'],
  ['skipped', 'Omitidas'],
  ['failed', 'Fallidas'],
]

function etiquetaCampo(campo: string): string {
  try {
    return fieldSpec(campo as UpdatableField).label
  } catch {
    return campo
  }
}

/** «Correo: (vacío) → ana@x.com» — el antes y el después, en la misma línea. */
function CambiosDeFila({
  campos,
  actuales,
  nuevos,
}: {
  campos: string[]
  actuales: Record<string, NormalizedValue>
  nuevos: Record<string, NormalizedValue>
}) {
  if (campos.length === 0) return <span className="text-slate-300">—</span>

  return (
    <ul className="space-y-1">
      {campos.map((campo) => (
        <li key={campo} className="flex flex-wrap items-baseline gap-1 text-[11px]">
          <span className="font-bold text-slate-500">{etiquetaCampo(campo)}:</span>
          <span className="text-slate-400 line-through">{displayValue(actuales[campo])}</span>
          <ArrowRight size={10} className="shrink-0 text-slate-300" />
          <span className="font-semibold text-mira-ink">{displayValue(nuevos[campo])}</span>
        </li>
      ))}
    </ul>
  )
}

/**
 * Asistente de actualización masiva de proveedores (Fase 3.2).
 *
 * Tres pasos y el del medio no se puede saltar: subir → revisar → confirmar.
 * La vista previa es el punto de no retorno, y por eso existe: reescribir a
 * ciegas la taxonomía de 4.000 proveedores es exactamente lo que hay que
 * impedir.
 *
 * ── Qué NO viaja por aquí ───────────────────────────────────────────────────
 *
 * Las filas validadas nunca vuelven al servidor desde este componente. Se
 * quedan en la base de datos y la confirmación solo manda el identificador del
 * batch. Este componente no puede alterar ni un UUID ni un valor: aunque
 * alguien reescribiera el estado de React desde la consola del navegador, lo
 * único que llegaría al servidor sería un `batch_id`.
 */
export function SupplierUpdateWizard() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [headerIssues, setHeaderIssues] = useState<HeaderIssues | null>(null)
  const [duplicateWarning, setDuplicateWarning] = useState<{ appliedAt: string | null } | null>(null)

  const [batch, setBatch] = useState<UpdateBatchSummary | null>(null)
  const [rows, setRows] = useState<UpdateRowView[]>([])
  const [totalRows, setTotalRows] = useState(0)
  const [filter, setFilter] = useState<RowFilter>('all')
  const [page, setPage] = useState(1)
  const [resultado, setResultado] = useState<{ updated: number; skipped: number; failed: number } | null>(null)

  async function cargarFilas(batchId: string, nuevoFiltro: RowFilter, nuevaPagina: number) {
    const res = await fetch(
      `/api/admin/supplier-update-rows?batchId=${encodeURIComponent(batchId)}&status=${nuevoFiltro}&page=${nuevaPagina}`,
    )
    if (!res.ok) return
    const data = (await res.json()) as { rows: UpdateRowView[]; total: number }
    setRows(data.rows)
    setTotalRows(data.total)
  }

  async function refrescarBatch(batchId: string) {
    const res = await fetch(`/api/admin/supplier-update-batch?batchId=${encodeURIComponent(batchId)}`)
    if (res.ok) setBatch((await res.json()) as UpdateBatchSummary)
  }

  function validar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!file) {
      setError('Selecciona un archivo .xlsx.')
      return
    }
    if (file.size > MAX_UPDATE_FILE_BYTES) {
      setError(`El archivo supera el límite de ${MAX_UPDATE_FILE_BYTES / 1024 / 1024} MB.`)
      return
    }

    setError(null)
    setHeaderIssues(null)
    setDuplicateWarning(null)
    setResultado(null)

    const formData = new FormData()
    formData.set('file', file)

    startTransition(async () => {
      const res = await validateSupplierUpdateFile(formData)

      if (res.error) { setError(res.error); return }
      if (res.headerIssues) { setHeaderIssues(res.headerIssues); return }
      if (!res.batchId) { setError('No se ha podido validar el archivo.'); return }

      if (res.duplicateFileWarning) {
        setDuplicateWarning({ appliedAt: res.duplicateFileWarning.appliedAt })
      }

      await refrescarBatch(res.batchId)
      setFilter('all')
      setPage(1)
      await cargarFilas(res.batchId, 'all', 1)
    })
  }

  function confirmar() {
    // Triple cierre para el doble clic: el `disabled` de abajo, este retorno
    // temprano, y —el único que de verdad cuenta— el `for update` sobre el
    // batch dentro de `apply_supplier_update`. Los dos primeros son comodidad;
    // el tercero es lo que hace imposible aplicar dos veces desde dos pestañas.
    if (!batch || pending || batch.status !== 'ready') return

    setError(null)
    startTransition(async () => {
      const res = await applySupplierUpdateBatch(batch.id)
      if (res.error) {
        setError(res.error)
        await refrescarBatch(batch.id)
        return
      }
      setResultado({
        updated: res.updatedRows ?? 0,
        skipped: res.skippedRows ?? 0,
        failed: res.failedRows ?? 0,
      })
      await refrescarBatch(batch.id)
      await cargarFilas(batch.id, filter, page)
      router.refresh()
    })
  }

  function descartar() {
    if (!batch) return
    startTransition(async () => {
      const res = await cancelSupplierUpdateBatch(batch.id)
      if (res.error) { setError(res.error); return }
      reiniciar()
      router.refresh()
    })
  }

  function reiniciar() {
    setBatch(null)
    setRows([])
    setTotalRows(0)
    setFile(null)
    setResultado(null)
    setError(null)
    setHeaderIssues(null)
    setDuplicateWarning(null)
    setPage(1)
    setFilter('all')
  }

  const totalPaginas = Math.max(1, Math.ceil(totalRows / UPDATE_PREVIEW_PAGE_SIZE))
  const yaAplicado = batch?.status === 'completed' || batch?.status === 'completed_with_errors'
  const puedeConfirmar = batch?.status === 'ready'

  return (
    <div className="space-y-6">
      {/* ── PASO 1 · Archivo ───────────────────────────────────────────────── */}
      {!batch && (
        <form onSubmit={validar} className="mira-card space-y-5 rounded-2xl p-5 sm:p-6">
          <div>
            <h2 className="text-sm font-black text-mira-ink">1 · Archivo de actualización</h2>
            <p className="mt-1 text-xs text-slate-500">
              Solo <span className="font-mono font-bold">.xlsx</span>, una sola hoja, máximo{' '}
              {MAX_UPDATE_FILE_BYTES / 1024 / 1024} MB y {MAX_UPDATE_ROWS.toLocaleString('es-ES')} filas.
              Cada fila debe conservar su <span className="font-bold">ID interno</span>.
            </p>
          </div>

          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(null) }}
            aria-label="Archivo XLSX de actualización de proveedores"
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-xl file:border-0 file:bg-mira-magenta-soft file:px-4 file:py-2 file:text-sm file:font-bold file:text-mira-magenta hover:file:bg-mira-magenta/15"
          />

          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={pending || !file} className={`${miraBtn.primary} disabled:opacity-40`}>
              {pending
                ? <><Loader2 size={14} className="animate-spin" /> Validando…</>
                : <><Upload size={14} /> Validar archivo</>}
            </button>
            <a href="/api/admin/supplier-update-template" download className={miraBtn.ghost}>
              <Download size={14} /> Descargar plantilla
            </a>
          </div>

          {headerIssues && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <p className="font-bold">La cabecera del archivo no es correcta.</p>
              {headerIssues.missingId && (
                <p className="mt-1 text-xs">
                  Falta la columna <span className="font-mono font-bold">ID interno</span>. Es
                  obligatoria: sin ella no hay forma segura de saber a qué proveedor se refiere cada
                  fila, y este bloque no adivina por nombre ni por NIF.
                </p>
              )}
              {headerIssues.ambiguous && headerIssues.ambiguous.length > 0 && (
                <p className="mt-1 text-xs">
                  Hay columnas repetidas y no se puede decidir cuál manda:{' '}
                  <span className="font-mono">{headerIssues.ambiguous.join(', ')}</span>. Deja una sola
                  de cada.
                </p>
              )}
            </div>
          )}
        </form>
      )}

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      )}

      {/* ── PASO 2 · Resumen y vista previa ────────────────────────────────── */}
      {batch && (
        <>
          <div className="mira-card rounded-2xl p-5 sm:p-6">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-sm font-black text-mira-ink">
                  {yaAplicado ? 'Actualización completada' : '2 · Revisa antes de confirmar'}
                </h2>
                <p className="mt-1 truncate text-xs text-slate-500">
                  <span className="font-mono">{batch.filename}</span> · {batch.totalRows} filas leídas
                </p>
              </div>
              {!yaAplicado && (
                <button type="button" onClick={descartar} disabled={pending} className={miraBtn.ghost}>
                  Descartar
                </button>
              )}
            </div>

            {duplicateWarning && !yaAplicado && (
              <p className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                <Copy size={14} className="mt-0.5 shrink-0" />
                <span>
                  Este mismo archivo ya se aplicó
                  {duplicateWarning.appliedAt
                    ? ` el ${new Date(duplicateWarning.appliedAt).toLocaleDateString('es-ES')}`
                    : ' anteriormente'}
                  . Puedes continuar: las filas cuyo contenido ya coincide con lo guardado aparecen
                  como «sin cambios» y no se vuelven a escribir.
                </span>
              </p>
            )}

            {(batch.ignoredColumns.length > 0 || batch.unknownColumns.length > 0) && !yaAplicado && (
              <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs text-slate-600">
                <p className="font-bold">Columnas que no se van a escribir</p>
                {batch.ignoredColumns.length > 0 && (
                  <p className="mt-1">
                    Solo informativas: <span className="font-mono">{batch.ignoredColumns.join(', ')}</span>.
                  </p>
                )}
                {batch.unknownColumns.length > 0 && (
                  <p className="mt-1">
                    No reconocidas: <span className="font-mono">{batch.unknownColumns.join(', ')}</span>.
                  </p>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
              {[
                { label: 'Filas', value: batch.totalRows, tone: 'text-mira-ink' },
                {
                  label: yaAplicado ? 'Actualizadas' : 'Se actualizarán',
                  value: yaAplicado ? batch.updatedRows : batch.validRows,
                  tone: 'text-emerald-700',
                },
                { label: 'Sin cambios', value: batch.unchangedRows, tone: 'text-slate-500' },
                { label: 'ID repetido', value: batch.duplicateRows, tone: 'text-amber-700' },
                { label: 'Inválidas', value: batch.invalidRows, tone: 'text-red-700' },
              ].map((k) => (
                <div key={k.label} className="rounded-xl border border-mira-line bg-mira-canvas/40 px-4 py-3">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{k.label}</p>
                  <p className={cn('text-xl font-black', k.tone)}>{k.value}</p>
                </div>
              ))}
            </div>

            {yaAplicado && (batch.skippedRows > 0 || batch.failedRows > 0) && (
              <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-5">
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-amber-600">Omitidas</p>
                  <p className="text-xl font-black text-amber-700">{batch.skippedRows}</p>
                </div>
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-red-500">Fallidas</p>
                  <p className="text-xl font-black text-red-700">{batch.failedRows}</p>
                </div>
              </div>
            )}

            {resultado && (
              <div className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
                <div>
                  <p className="font-bold">
                    Se {resultado.updated === 1 ? 'ha actualizado' : 'han actualizado'} {resultado.updated}{' '}
                    {resultado.updated === 1 ? 'proveedor' : 'proveedores'}.
                  </p>
                  <p className="mt-0.5 text-xs">
                    No se ha creado ningún proveedor. Las filas sin cambios, inválidas y con ID
                    repetido no se han tocado.
                  </p>
                </div>
              </div>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-3">
              {puedeConfirmar && (
                <button
                  type="button"
                  onClick={confirmar}
                  disabled={pending}
                  className={`${miraBtn.primary} disabled:opacity-40`}
                >
                  {pending
                    ? <><Loader2 size={14} className="animate-spin" /> Actualizando…</>
                    : <>Actualizar {batch.validRows} {batch.validRows === 1 ? 'proveedor' : 'proveedores'} <ArrowRight size={14} /></>}
                </button>
              )}

              {!yaAplicado && batch.status === 'no_changes' && (
                <p className="flex items-center gap-2 text-sm font-semibold text-slate-500">
                  <CheckCircle2 size={15} /> El archivo no cambia nada: todo coincide ya con lo guardado.
                </p>
              )}

              {!yaAplicado && batch.status === 'invalid' && (
                <p className="flex items-center gap-2 text-sm font-semibold text-red-700">
                  <XCircle size={15} /> Ninguna fila de este archivo se puede aplicar.
                </p>
              )}

              <a
                href={`/api/admin/supplier-update-report?batchId=${encodeURIComponent(batch.id)}`}
                download
                className={miraBtn.ghost}
              >
                <Download size={14} /> Descargar informe
              </a>

              {yaAplicado && (
                <button type="button" onClick={reiniciar} className={miraBtn.ghost}>
                  Actualizar otro archivo
                </button>
              )}
            </div>
          </div>

          {/* Vista previa paginada — nunca se cargan miles de filas de golpe */}
          <div className="mira-card overflow-hidden rounded-2xl">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-mira-line px-5 py-3.5">
              <h3 className="text-sm font-black text-mira-ink">Vista previa</h3>
              <div className="flex flex-wrap gap-1.5">
                {FILTROS.map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setFilter(value); setPage(1)
                      startTransition(async () => { await cargarFilas(batch.id, value, 1) })
                    }}
                    aria-pressed={filter === value}
                    className={cn(
                      'rounded-lg px-2.5 py-1.5 text-xs font-bold transition-colors',
                      filter === value
                        ? 'bg-mira-magenta text-white'
                        : 'text-slate-500 hover:bg-mira-magenta-soft hover:text-mira-magenta',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-xs">
                <thead className="border-b border-mira-line bg-mira-canvas/40">
                  <tr className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    <th className="px-4 py-2.5">Fila</th>
                    <th className="px-4 py-2.5">Proveedor</th>
                    <th className="px-4 py-2.5">Estado</th>
                    <th className="px-4 py-2.5">Actual → nuevo</th>
                    <th className="px-4 py-2.5">Errores</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-mira-line">
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                        No hay filas con este filtro.
                      </td>
                    </tr>
                  ) : rows.map((r) => (
                    <tr key={r.line} className="align-top">
                      <td className="px-4 py-2.5 font-mono text-slate-400">{r.line}</td>
                      <td className="px-4 py-2.5">
                        <p className="font-semibold text-mira-ink">{r.supplierName ?? '—'}</p>
                        <p className="font-mono text-[10px] text-slate-400">{r.supplierId ?? '—'}</p>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={cn('whitespace-nowrap rounded-md px-2 py-0.5 text-[10px] font-bold uppercase', ESTILO_FILA[r.status])}>
                          {ROW_STATUS_LABELS[r.status] ?? r.status}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <CambiosDeFila
                          campos={r.updatedFields}
                          actuales={r.currentValues}
                          nuevos={r.changes}
                        />
                      </td>
                      <td className="px-4 py-2.5">
                        {r.errors.length === 0 ? (
                          <span className="text-slate-300">—</span>
                        ) : (
                          <ul className="space-y-0.5">
                            {r.errors.map((e, i) => (
                              <li key={i} className="flex items-start gap-1 text-[11px] text-red-700">
                                <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                                <span>
                                  {e.column ? <span className="font-mono font-bold">{e.column}: </span> : null}
                                  {e.message}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {totalPaginas > 1 && (
              <div className="flex items-center justify-between border-t border-mira-line px-5 py-3">
                <span className="text-xs text-slate-500">
                  Página {page} de {totalPaginas} · {totalRows} filas
                </span>
                <div className="flex gap-2">
                  <button
                    type="button" disabled={page <= 1 || pending}
                    onClick={() => {
                      const p = page - 1; setPage(p)
                      startTransition(async () => { await cargarFilas(batch.id, filter, p) })
                    }}
                    className={`${miraBtn.ghost} disabled:opacity-40`}
                  >
                    Anterior
                  </button>
                  <button
                    type="button" disabled={page >= totalPaginas || pending}
                    onClick={() => {
                      const p = page + 1; setPage(p)
                      startTransition(async () => { await cargarFilas(batch.id, filter, p) })
                    }}
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

      {!batch && !headerIssues && (
        <p className="flex items-center gap-2 text-xs text-slate-400">
          <FileSpreadsheet size={13} />
          El archivo se valida entero antes de escribir nada. Verás cada fila con su valor actual y
          el nuevo, y decidirás después.
        </p>
      )}
    </div>
  )
}

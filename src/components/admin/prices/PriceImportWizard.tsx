'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, XCircle,
  Copy, Download, Loader2, ArrowRight,
} from 'lucide-react'
import {
  cancelImportBatch,
  commitImportBatch,
  validateImportFile,
  type ImportRowView,
} from '@/lib/actions/market-imports'
// `ImportBatchSummary` vive en el módulo de tipos, no en el de acciones: un
// fichero `'use server'` solo puede exportar funciones asíncronas.
import type { ImportBatchSummary } from '@/lib/imports/types'
import {
  IMPORT_PERIOD_LABELS,
  IMPORT_PERIOD_TYPES,
  MAX_IMPORT_YEAR,
  MIN_IMPORT_YEAR,
  isoWeeksInYear,
  type ImportPeriodType,
} from '@/lib/imports/period'
import { MAX_IMPORT_FILE_BYTES, MAX_IMPORT_ROWS } from '@/lib/imports/types'
import { miraBtn, miraField, miraLabel } from '@/lib/miraButtons'
import { cn } from '@/lib/utils'

interface Props {
  currentYear: number
  currentWeek: number
  currentMonth: number
}

type RowFilter = 'all' | 'valid' | 'invalid' | 'duplicate'

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

const ESTADO_FILA: Record<string, { label: string; className: string }> = {
  valid:     { label: 'Válida',    className: 'bg-emerald-50 text-emerald-700' },
  invalid:   { label: 'Inválida',  className: 'bg-red-50 text-red-700' },
  duplicate: { label: 'Duplicada', className: 'bg-amber-50 text-amber-700' },
  imported:  { label: 'Importada', className: 'bg-emerald-50 text-emerald-700' },
}

/**
 * Asistente de importación de precios (Fase 2.5, MVP).
 *
 * Tres pasos, y el del medio no se puede saltar: subir → revisar → confirmar.
 * La previsualización es el punto de no retorno, y por eso existe: importar a
 * ciegas 500 precios con la unidad equivocada es exactamente lo que hay que
 * impedir.
 *
 * ── Qué NO viaja por aquí ───────────────────────────────────────────────────
 *
 * Las filas validadas nunca vuelven al servidor desde este componente. Se
 * quedan en la base de datos y la confirmación solo manda el identificador del
 * batch. Este componente no puede alterar ni un precio ni un producto.
 */
export function PriceImportWizard({ currentYear, currentWeek, currentMonth }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  const [periodType, setPeriodType] = useState<ImportPeriodType>('week')
  const [year, setYear] = useState(currentYear)
  const [week, setWeek] = useState(currentWeek)
  const [month, setMonth] = useState(currentMonth)
  const [file, setFile] = useState<File | null>(null)

  const [error, setError] = useState<string | null>(null)
  const [headerIssues, setHeaderIssues] = useState<{ missing: string[]; unknown: string[] } | null>(null)
  const [duplicateWarning, setDuplicateWarning] = useState<{ importedAt: string | null } | null>(null)

  const [batch, setBatch] = useState<ImportBatchSummary | null>(null)
  const [rows, setRows] = useState<ImportRowView[]>([])
  const [totalRows, setTotalRows] = useState(0)
  const [filter, setFilter] = useState<RowFilter>('all')
  const [page, setPage] = useState(1)
  const [resultado, setResultado] = useState<{ importedRows: number; status?: string } | null>(null)

  const semanas = isoWeeksInYear(year)

  async function cargarFilas(batchId: string, nuevoFiltro: RowFilter, nuevaPagina: number) {
    const res = await fetch(
      `/api/admin/import-rows?batchId=${encodeURIComponent(batchId)}&status=${nuevoFiltro}&page=${nuevaPagina}`,
    )
    if (!res.ok) return
    const data = (await res.json()) as { rows: ImportRowView[]; total: number }
    setRows(data.rows)
    setTotalRows(data.total)
  }

  function validar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!file) {
      setError('Selecciona un archivo CSV.')
      return
    }
    if (file.size > MAX_IMPORT_FILE_BYTES) {
      setError(`El archivo supera el límite de ${MAX_IMPORT_FILE_BYTES / 1024 / 1024} MB.`)
      return
    }

    setError(null)
    setHeaderIssues(null)
    setDuplicateWarning(null)
    setResultado(null)

    const formData = new FormData()
    formData.set('file', file)
    formData.set('periodType', periodType)
    formData.set('year', String(year))
    if (periodType === 'week') formData.set('week', String(week))
    if (periodType === 'month') formData.set('month', String(month))

    startTransition(async () => {
      const res = await validateImportFile(formData)

      if (res.error) { setError(res.error); return }
      if (res.headerIssues) { setHeaderIssues(res.headerIssues); return }
      if (!res.batchId) { setError('No se ha podido validar el archivo.'); return }

      if (res.duplicateFileWarning) {
        setDuplicateWarning({ importedAt: res.duplicateFileWarning.importedAt })
      }

      const detalle = await fetch(`/api/admin/import-batch?batchId=${encodeURIComponent(res.batchId)}`)
      if (detalle.ok) setBatch((await detalle.json()) as ImportBatchSummary)

      setFilter('all')
      setPage(1)
      await cargarFilas(res.batchId, 'all', 1)
    })
  }

  function confirmar() {
    if (!batch) return
    setError(null)
    startTransition(async () => {
      const res = await commitImportBatch(batch.id)
      if (res.error) { setError(res.error); return }
      setResultado({ importedRows: res.importedRows ?? 0, status: res.status })
      setBatch({ ...batch, status: (res.status as ImportBatchSummary['status']) ?? 'completed' })
      router.refresh()
    })
  }

  function cancelar() {
    if (!batch) return
    startTransition(async () => {
      const res = await cancelImportBatch(batch.id)
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
  }

  const totalPaginas = Math.max(1, Math.ceil(totalRows / 50))
  const yaImportado = batch?.status === 'completed' || batch?.status === 'completed_with_errors'

  return (
    <div className="space-y-6">
      {/* ── PASO 1 · Periodo y archivo ─────────────────────────────────────── */}
      {!batch && (
        <form onSubmit={validar} className="mira-card space-y-5 rounded-2xl p-5 sm:p-6">
          <div>
            <h2 className="text-sm font-black text-mira-ink">1 · Periodo que vas a importar</h2>
            <p className="mt-1 text-xs text-slate-500">
              Todas las fechas del archivo deben caer dentro del periodo. Una fila fuera de rango se
              rechaza; nunca se corrige la fecha automáticamente.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {IMPORT_PERIOD_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setPeriodType(t)}
                aria-pressed={periodType === t}
                className={cn(
                  'rounded-xl border px-4 py-2 text-sm font-bold transition-colors',
                  periodType === t
                    ? 'border-mira-magenta/30 bg-mira-magenta-soft text-mira-magenta'
                    : 'border-mira-line bg-white text-slate-600 hover:border-mira-magenta/30',
                )}
              >
                {IMPORT_PERIOD_LABELS[t]}
              </button>
            ))}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="import-year" className={miraLabel}>Año</label>
              <input
                id="import-year" type="number" value={year}
                min={MIN_IMPORT_YEAR} max={MAX_IMPORT_YEAR}
                onChange={(e) => setYear(Number(e.target.value))}
                className={miraField}
              />
            </div>

            {periodType === 'week' && (
              <div>
                <label htmlFor="import-week" className={miraLabel}>Semana ISO (1–{semanas})</label>
                <input
                  id="import-week" type="number" value={week} min={1} max={semanas}
                  onChange={(e) => setWeek(Number(e.target.value))}
                  className={miraField}
                />
              </div>
            )}

            {periodType === 'month' && (
              <div>
                <label htmlFor="import-month" className={miraLabel}>Mes</label>
                <select
                  id="import-month" value={month}
                  onChange={(e) => setMonth(Number(e.target.value))}
                  className={miraField}
                >
                  {MESES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                </select>
              </div>
            )}
          </div>

          <div className="border-t border-mira-line pt-5">
            <h2 className="mb-1 text-sm font-black text-mira-ink">2 · Archivo CSV</h2>
            <p className="mb-3 text-xs text-slate-500">
              Máximo {MAX_IMPORT_FILE_BYTES / 1024 / 1024} MB y{' '}
              {MAX_IMPORT_ROWS.toLocaleString('es-ES')} filas. Descarga la plantilla si es tu primera vez.
            </p>

            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => { setFile(e.target.files?.[0] ?? null); setError(null) }}
              aria-label="Archivo CSV de precios"
              className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-xl file:border-0 file:bg-mira-magenta-soft file:px-4 file:py-2 file:text-sm file:font-bold file:text-mira-magenta hover:file:bg-mira-magenta/15"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={pending || !file} className={`${miraBtn.primary} disabled:opacity-40`}>
              {pending ? <><Loader2 size={14} className="animate-spin" /> Validando…</> : <><Upload size={14} /> Validar archivo</>}
            </button>
            <a href="/api/admin/import-template" download className={miraBtn.ghost}>
              <Download size={14} /> Descargar plantilla CSV
            </a>
          </div>

          {headerIssues && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <p className="font-bold">La cabecera del archivo no es correcta.</p>
              {headerIssues.missing.length > 0 && (
                <p className="mt-1 text-xs">
                  Faltan columnas obligatorias:{' '}
                  <span className="font-mono font-bold">{headerIssues.missing.join(', ')}</span>
                </p>
              )}
              {headerIssues.unknown.length > 0 && (
                <p className="mt-1 text-xs">
                  Columnas no reconocidas (se ignorarían):{' '}
                  <span className="font-mono">{headerIssues.unknown.join(', ')}</span>
                </p>
              )}
            </div>
          )}
        </form>
      )}

      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      )}

      {/* ── PASO 2 · Resumen y previsualización ────────────────────────────── */}
      {batch && (
        <>
          <div className="mira-card rounded-2xl p-5 sm:p-6">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-sm font-black text-mira-ink">
                  {yaImportado ? 'Importación completada' : '3 · Revisa antes de confirmar'}
                </h2>
                <p className="mt-1 truncate text-xs text-slate-500">
                  <span className="font-mono">{batch.filename}</span> · {batch.periodLabel}
                </p>
              </div>
              {!yaImportado && (
                <button type="button" onClick={cancelar} disabled={pending} className={miraBtn.ghost}>
                  Descartar
                </button>
              )}
            </div>

            {duplicateWarning && !yaImportado && (
              <p className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                <Copy size={14} className="mt-0.5 shrink-0" />
                <span>
                  Este archivo ya se importó
                  {duplicateWarning.importedAt
                    ? ` el ${new Date(duplicateWarning.importedAt).toLocaleDateString('es-ES')}`
                    : ' anteriormente'}
                  . Puedes continuar: los precios que ya existan se marcarán como duplicados y no se
                  volverán a insertar.
                </span>
              </p>
            )}

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                { label: 'Filas totales', value: batch.totalRows, tone: 'text-mira-ink' },
                { label: yaImportado ? 'Importadas' : 'Válidas', value: yaImportado ? batch.importedRows : batch.validRows, tone: 'text-emerald-700' },
                { label: 'Duplicadas', value: batch.duplicateRows, tone: 'text-amber-700' },
                { label: 'Inválidas', value: batch.invalidRows, tone: 'text-red-700' },
              ].map((k) => (
                <div key={k.label} className="rounded-xl border border-mira-line bg-mira-canvas/40 px-4 py-3">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{k.label}</p>
                  <p className={cn('text-xl font-black', k.tone)}>{k.value}</p>
                </div>
              ))}
            </div>

            {resultado && (
              <div className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                <CheckCircle2 size={16} className="mt-0.5 shrink-0" />
                <div>
                  <p className="font-bold">
                    Se han importado {resultado.importedRows}{' '}
                    {resultado.importedRows === 1 ? 'precio' : 'precios'}.
                  </p>
                  {(batch.invalidRows > 0 || batch.duplicateRows > 0) && (
                    <p className="mt-0.5 text-xs">
                      Las filas inválidas y duplicadas no se han insertado. Puedes descargarlas para revisarlas.
                    </p>
                  )}
                </div>
              </div>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-3">
              {!yaImportado && batch.validRows > 0 && (
                <button
                  type="button"
                  onClick={confirmar}
                  disabled={pending}
                  className={`${miraBtn.primary} disabled:opacity-40`}
                >
                  {pending
                    ? <><Loader2 size={14} className="animate-spin" /> Importando…</>
                    : <>Importar {batch.validRows} {batch.validRows === 1 ? 'fila válida' : 'filas válidas'} <ArrowRight size={14} /></>}
                </button>
              )}

              {!yaImportado && batch.validRows === 0 && (
                <p className="flex items-center gap-2 text-sm font-semibold text-red-700">
                  <XCircle size={15} /> No hay ninguna fila importable en este archivo.
                </p>
              )}

              {(batch.invalidRows > 0 || batch.duplicateRows > 0) && (
                <a
                  href={`/api/admin/import-errors?batchId=${encodeURIComponent(batch.id)}`}
                  download
                  className={miraBtn.ghost}
                >
                  <Download size={14} /> Descargar filas rechazadas
                </a>
              )}

              {yaImportado && (
                <button type="button" onClick={reiniciar} className={miraBtn.ghost}>
                  Importar otro archivo
                </button>
              )}
            </div>
          </div>

          {/* Previsualización paginada — nunca se cargan miles de filas de golpe */}
          <div className="mira-card overflow-hidden rounded-2xl">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-mira-line px-5 py-3.5">
              <h3 className="text-sm font-black text-mira-ink">Previsualización</h3>
              <div className="flex flex-wrap gap-1.5">
                {([
                  ['all', 'Todas'], ['valid', 'Válidas'],
                  ['invalid', 'Inválidas'], ['duplicate', 'Duplicadas'],
                ] as [RowFilter, string][]).map(([value, label]) => (
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
                    <th className="px-4 py-2.5">Línea</th>
                    <th className="px-4 py-2.5">Estado</th>
                    <th className="px-4 py-2.5">Mercado</th>
                    <th className="px-4 py-2.5">Producto</th>
                    <th className="px-4 py-2.5">Lonja</th>
                    <th className="px-4 py-2.5">Fecha</th>
                    <th className="px-4 py-2.5">Precio</th>
                    <th className="px-4 py-2.5">Errores</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-mira-line">
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-slate-400">
                        No hay filas con este filtro.
                      </td>
                    </tr>
                  ) : rows.map((r) => {
                    const estado = ESTADO_FILA[r.status] ?? ESTADO_FILA.invalid
                    return (
                      <tr key={r.line} className="align-top">
                        <td className="px-4 py-2.5 font-mono text-slate-400">{r.line}</td>
                        <td className="px-4 py-2.5">
                          <span className={cn('rounded-md px-2 py-0.5 text-[10px] font-bold uppercase', estado.className)}>
                            {estado.label}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-slate-600">{r.marketName ?? '—'}</td>
                        <td className="px-4 py-2.5 font-semibold text-mira-ink">{r.productName ?? '—'}</td>
                        <td className="px-4 py-2.5 text-slate-500">{r.lonja ?? '—'}</td>
                        <td className="px-4 py-2.5 font-mono text-slate-600">{r.recordedAt ?? '—'}</td>
                        <td className="px-4 py-2.5 font-mono text-slate-600">
                          {r.price !== null ? `${r.price} ${r.currency ?? ''}/${r.unit ?? ''}` : '—'}
                        </td>
                        <td className="px-4 py-2.5">
                          {r.errors.length === 0 ? (
                            <span className="text-slate-300">—</span>
                          ) : (
                            <ul className="space-y-0.5">
                              {r.errors.map((e, i) => (
                                <li key={i} className="flex items-start gap-1 text-[11px] text-red-700">
                                  <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                                  <span>{e.column ? <span className="font-mono font-bold">{e.column}: </span> : null}{e.message}</span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    )
                  })}
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
          El archivo se valida entero antes de importar nada. Podrás revisar cada fila y decidir.
        </p>
      )}
    </div>
  )
}

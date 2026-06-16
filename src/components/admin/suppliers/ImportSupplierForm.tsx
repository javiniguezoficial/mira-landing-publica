'use client'

import { useState, useRef } from 'react'
import { Upload, AlertTriangle, CheckCircle, XCircle, Info } from 'lucide-react'
import { parseAndValidateSupplierFile, importSuppliers } from '@/lib/actions/import-suppliers'
import type { ValidatedSupplierRow, ParseResult } from '@/lib/types/import-suppliers'
import { miraBtn } from '@/lib/miraButtons'

type State =
  | { phase: 'idle' }
  | { phase: 'parsing' }
  | { phase: 'preview'; result: ParseResult }
  | { phase: 'importing' }
  | { phase: 'done'; inserted: number; skipped: number }
  | { phase: 'error'; message: string }

function fmt(v: string | number | null | undefined) {
  if (v == null || v === '') return '—'
  return String(v)
}

export function ImportSupplierForm() {
  const [state, setState] = useState<State>({ phase: 'idle' })
  const inputRef = useRef<HTMLInputElement>(null)

  // ── Upload & parse ──────────────────────────────────────────────────────
  const handleFile = async (file: File) => {
    setState({ phase: 'parsing' })
    try {
      const fd = new FormData()
      fd.append('file', file)
      const result = await parseAndValidateSupplierFile(fd)
      setState({ phase: 'preview', result })
    } catch (err) {
      setState({ phase: 'error', message: err instanceof Error ? err.message : 'Error al procesar el archivo.' })
    }
  }

  const onInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
    e.target.value = ''
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  // ── Confirm import ──────────────────────────────────────────────────────
  const handleImport = async (rows: ValidatedSupplierRow[]) => {
    setState({ phase: 'importing' })
    try {
      const res = await importSuppliers(rows)
      setState({ phase: 'done', inserted: res.inserted, skipped: res.skipped })
    } catch (err) {
      setState({ phase: 'error', message: err instanceof Error ? err.message : 'Error al importar.' })
    }
  }

  const reset = () => {
    setState({ phase: 'idle' })
    if (inputRef.current) inputRef.current.value = ''
  }

  // ── Render: idle / parsing ────────────────────────────────────────────────
  if (state.phase === 'idle' || state.phase === 'parsing') {
    return (
      <div
        onDrop={onDrop}
        onDragOver={e => e.preventDefault()}
        onClick={() => inputRef.current?.click()}
        className="group cursor-pointer rounded-2xl border-2 border-dashed border-mira-line p-10 text-center transition-all hover:border-mira-magenta/40 hover:bg-mira-magenta-soft/40"
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,.xls"
          className="hidden"
          onChange={onInputChange}
        />
        {state.phase === 'parsing' ? (
          <div className="flex flex-col items-center gap-3">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-mira-magenta border-t-transparent" />
            <p className="text-sm text-slate-500">Procesando archivo…</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <Upload size={28} className="text-slate-300 transition-colors group-hover:text-mira-magenta" />
            <div>
              <p className="text-sm font-bold text-slate-700">Arrastra tu archivo aquí o haz clic para seleccionar</p>
              <p className="text-xs text-slate-400 mt-1">CSV o XLSX · Máximo 5 MB · Máximo 5.000 filas</p>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ── Render: error ─────────────────────────────────────────────────────────
  if (state.phase === 'error') {
    return (
      <div className="space-y-4">
        <div className="bg-red-50 border border-red-200 rounded-xl p-5 flex items-start gap-3">
          <XCircle size={20} className="text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-red-700">Error al procesar el archivo</p>
            <p className="text-sm text-red-600 mt-1">{state.message}</p>
          </div>
        </div>
        <button onClick={reset} className={miraBtn.ghost}>Intentar de nuevo</button>
      </div>
    )
  }

  // ── Render: done ──────────────────────────────────────────────────────────
  if (state.phase === 'done') {
    return (
      <div className="space-y-4">
        <div className="bg-green-50 border border-green-200 rounded-xl p-5 flex items-start gap-3">
          <CheckCircle size={20} className="text-green-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-green-700">Importación completada</p>
            <p className="text-sm text-green-600 mt-1">
              <strong>{state.inserted}</strong> proveedores insertados.
              {state.skipped > 0 && <> <strong>{state.skipped}</strong> ignorados (duplicados).</>}
            </p>
          </div>
        </div>
        <button onClick={reset} className={miraBtn.ghost}>Importar otro archivo</button>
      </div>
    )
  }

  // ── Render: importing ─────────────────────────────────────────────────────
  if (state.phase === 'importing') {
    return (
      <div className="flex items-center gap-3 p-6">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-mira-magenta border-t-transparent" />
        <p className="text-sm text-slate-500">Insertando proveedores…</p>
      </div>
    )
  }

  // ── Render: preview ───────────────────────────────────────────────────────
  const { result } = state
  const { valid, errors, columnIssues, totalRows } = result
  const insertable  = valid.filter(r => !r.isDuplicate)
  const duplicates  = valid.filter(r => r.isDuplicate)
  const withWarnings = valid.filter(r => r.warnings.length > 0)
  const blockedByColumns = !!columnIssues && columnIssues.missing.length > 0

  return (
    <div className="space-y-6">

      {/* Column issues */}
      {columnIssues && (columnIssues.missing.length > 0 || columnIssues.extra.length > 0) && (
        <div className={`rounded-xl border p-4 flex items-start gap-3 ${columnIssues.missing.length > 0 ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
          <AlertTriangle size={18} className={columnIssues.missing.length > 0 ? 'text-red-500 shrink-0 mt-0.5' : 'text-amber-500 shrink-0 mt-0.5'} />
          <div className="text-sm space-y-1">
            {columnIssues.missing.length > 0 && (
              <p className="font-bold text-red-700">
                Columnas obligatorias no encontradas: <code className="font-mono">{columnIssues.missing.join(', ')}</code>
              </p>
            )}
            {columnIssues.extra.length > 0 && (
              <p className="font-bold text-amber-700">
                Columnas desconocidas ignoradas: <code className="font-mono">{columnIssues.extra.join(', ')}</code>
              </p>
            )}
            {columnIssues.missing.length > 0 && (
              <p className="text-red-600">Descarga la plantilla, corrige el archivo y vuelve a subirlo.</p>
            )}
          </div>
        </div>
      )}

      {/* Summary */}
      {!blockedByColumns && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: 'Total filas', value: totalRows, color: 'text-slate-700' },
            { label: 'Insertables', value: insertable.length, color: 'text-green-700' },
            { label: 'Con avisos', value: withWarnings.length, color: 'text-amber-600' },
            { label: 'Duplicadas', value: duplicates.length, color: 'text-amber-600' },
            { label: 'Con errores', value: errors.length, color: 'text-red-600' },
          ].map(s => (
            <div key={s.label} className="bg-white border border-slate-200 rounded-lg p-3 text-center">
              <p className={`text-2xl font-display font-bold ${s.color}`}>{s.value}</p>
              <p className="text-xs text-slate-400 mt-0.5">{s.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Duplicate warning banner */}
      {duplicates.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
          <p className="text-sm text-amber-700">
            <strong>{duplicates.length} filas</strong> coinciden con un proveedor existente (mismo nombre + provincia/localidad) y <strong>no se insertarán</strong>.
          </p>
        </div>
      )}

      {/* Row errors */}
      {errors.length > 0 && (
        <div className="bg-white border border-red-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 bg-red-50 border-b border-red-100">
            <p className="text-sm font-bold text-red-700">{errors.length} filas con errores — no se importarán</p>
          </div>
          <div className="divide-y divide-red-50 max-h-48 overflow-y-auto">
            {errors.map(e => (
              <div key={e.rowIndex} className="px-4 py-2.5 flex items-start gap-3">
                <span className="text-xs font-mono text-slate-400 shrink-0 mt-0.5">Fila {e.rowIndex}</span>
                <span className="text-xs text-red-600">{e.errors.join(' · ')}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Row warnings */}
      {withWarnings.length > 0 && !blockedByColumns && (
        <div className="bg-white border border-amber-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 bg-amber-50 border-b border-amber-100">
            <p className="text-sm font-bold text-amber-700">{withWarnings.length} filas con avisos</p>
          </div>
          <div className="divide-y divide-amber-50 max-h-48 overflow-y-auto">
            {withWarnings.map(r => (
              <div key={r.rowIndex} className="px-4 py-2.5 flex items-start gap-3">
                <span className="text-xs font-mono text-slate-400 shrink-0 mt-0.5">Fila {r.rowIndex}</span>
                <div className="min-w-0">
                  <span className="text-xs font-semibold text-slate-700">{r.name}</span>
                  <span className="text-xs text-amber-700"> — {r.warnings.join(' · ')}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Insertable rows preview */}
      {insertable.length > 0 && !blockedByColumns && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
            <p className="text-sm font-bold text-slate-700">{insertable.length} filas insertables — previsualización</p>
            <p className="text-xs text-slate-400">(primeras 20)</p>
          </div>
          <div className="overflow-x-auto max-h-64">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-100">
                  {['Fila', 'Nombre', 'Provincia', 'Localidad', 'Mercado', 'Familia', 'Activo'].map(h => (
                    <th key={h} className="text-left px-3 py-2 font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {insertable.slice(0, 20).map(r => (
                  <tr key={r.rowIndex} className="border-b border-slate-50 hover:bg-slate-50/50">
                    <td className="px-3 py-2 font-mono text-slate-400">{r.rowIndex}</td>
                    <td className="px-3 py-2 font-semibold text-slate-800 whitespace-nowrap">{r.name}</td>
                    <td className="px-3 py-2 text-slate-500">{fmt(r.region)}</td>
                    <td className="px-3 py-2 text-slate-500">{fmt(r.city)}</td>
                    <td className="px-3 py-2 text-slate-500">
                      {r.market_id ? fmt(r.market_input) : <span className="text-amber-500">{r.market_input ? 'no encontrado' : '—'}</span>}
                    </td>
                    <td className="px-3 py-2 text-slate-500">{fmt(r.family)}</td>
                    <td className="px-3 py-2">
                      {r.is_active
                        ? <span className="text-green-600 font-semibold">Sí</span>
                        : <span className="text-slate-400">No</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 items-center">
        {insertable.length > 0 && !blockedByColumns ? (
          <>
            <button onClick={() => handleImport(valid)} className={miraBtn.primary}>
              Confirmar e importar {insertable.length} {insertable.length === 1 ? 'proveedor' : 'proveedores'}
            </button>
            {(errors.length > 0 || duplicates.length > 0) && (
              <p className="text-xs text-slate-400 flex items-center gap-1">
                <Info size={12} />
                {errors.length + duplicates.length} filas no se importarán
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-slate-500">No hay filas insertables.</p>
        )}
        <button onClick={reset} className={`${miraBtn.ghost} ml-auto`}>Cancelar</button>
      </div>

    </div>
  )
}

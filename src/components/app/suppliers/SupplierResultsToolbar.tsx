'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Search, X, ArrowUpDown, Download, Loader2 } from 'lucide-react'
import {
  DEFAULT_SUPPLIER_SORT,
  SUPPLIER_PARAM,
  SUPPLIER_SORTS,
  SUPPLIER_SORT_LABELS,
  SUPPLIER_SORT_NOTES,
  buildSupplierUrl,
  parseSupplierSort,
  type SupplierListParams,
  type SupplierSort,
} from '@/lib/suppliers/list-params'
import { miraBtn, miraField } from '@/lib/miraButtons'
import { formatNumber } from '@/lib/utils'

interface Props {
  basePath: string
  params: SupplierListParams
  total: number
  /** Identificadores marcados en la página actual. */
  selectedIds: string[]
  onClearSelection: () => void
  /**
   * 039 — ¿se ofrece la descarga XLSX?
   *
   * Solo `platform_admin`. Lo decide la PÁGINA, que es servidor; este
   * componente se limita a pintar o no el botón.
   *
   * Es una comodidad, NO la protección: la ruta `/api/admin/suppliers-export`
   * y la propia Server Action comprueban el rol por su cuenta y responden 403.
   * Ocultar el botón evita ofrecer algo que va a fallar; no impide nada.
   *
   * Por defecto `false`: si alguien añade una superficie nueva y se olvida de
   * pasarlo, no aparece un botón de descarga sin querer.
   */
  canExport?: boolean
}

/**
 * Barra de acciones sobre los resultados (3.1 y 3.4).
 *
 * Reúne búsqueda secundaria, ordenación, recuento y exportación en una sola
 * fila compacta, encima de la tabla. La comparten administración y área de
 * cliente: los permisos los resuelve el servidor, no este componente.
 */
export function SupplierResultsToolbar({
  basePath,
  params,
  total,
  selectedIds,
  onClearSelection,
  canExport = false,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [termino, setTermino] = useState(params.qr ?? '')
  const [exportando, setExportando] = useState<'filtered' | 'selected' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const sortActual = parseSupplierSort(params.sort)
  const nota = SUPPLIER_SORT_NOTES[sortActual]

  function buscar(e: React.FormEvent) {
    e.preventDefault()
    const limpio = termino.trim()
    startTransition(() => {
      router.push(
        buildSupplierUrl(basePath, params, {
          [SUPPLIER_PARAM.secondarySearch]: limpio || undefined,
        }),
        { scroll: false },
      )
    })
  }

  function limpiarBusqueda() {
    setTermino('')
    startTransition(() => {
      router.push(
        buildSupplierUrl(basePath, params, { [SUPPLIER_PARAM.secondarySearch]: undefined }),
        { scroll: false },
      )
    })
  }

  function ordenar(sort: SupplierSort) {
    startTransition(() => {
      router.push(buildSupplierUrl(basePath, params, { [SUPPLIER_PARAM.sort]: sort }), {
        scroll: false,
      })
    })
  }

  /**
   * Descarga el XLSX.
   *
   * Se hace con `fetch` en lugar de un enlace directo para poder mostrar el
   * error del servidor —límite superado, sin resultados— en vez de dejar al
   * navegador abrir una pestaña con un JSON de error.
   */
  async function exportar(mode: 'filtered' | 'selected') {
    setError(null)
    setExportando(mode)
    try {
      const qs = new URLSearchParams()
      for (const [key, value] of Object.entries(params)) {
        if (typeof value === 'string' && value && key !== SUPPLIER_PARAM.page) qs.set(key, value)
      }
      qs.set('mode', mode)
      if (mode === 'selected') qs.set('ids', selectedIds.join(','))

      const res = await fetch(`/api/admin/suppliers-export?${qs.toString()}`)

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null
        setError(data?.error ?? 'No se ha podido generar la exportación.')
        return
      }

      if (res.headers.get('X-Mira-Export-Truncated') === '1') {
        setError('La exportación se ha recortado al límite. Acota los filtros para obtenerla completa.')
      }

      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download =
        res.headers.get('Content-Disposition')?.match(/filename="(.+)"/)?.[1] ?? 'proveedores.xlsx'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      setError('No se ha podido generar la exportación.')
    } finally {
      setExportando(null)
    }
  }

  return (
    <div className="space-y-3">
      <div className="mira-card flex flex-col gap-3 rounded-2xl p-3 sm:p-4 lg:flex-row lg:items-end">
        {/* Búsqueda dentro de los resultados */}
        <form onSubmit={buscar} className="flex-1">
          <label
            htmlFor="mira-supplier-secondary-search"
            className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-slate-400"
          >
            Buscar en los resultados
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                id="mira-supplier-secondary-search"
                type="search"
                value={termino}
                onChange={(e) => setTermino(e.target.value)}
                placeholder="Nombre, localidad, provincia, país…"
                aria-describedby="mira-supplier-secondary-help"
                className={`${miraField} pl-8`}
              />
            </div>
            <button type="submit" disabled={pending} className={`${miraBtn.primary} shrink-0`}>
              Buscar
            </button>
            {params.qr && (
              <button
                type="button"
                onClick={limpiarBusqueda}
                disabled={pending}
                title="Limpiar solo la búsqueda"
                className={`${miraBtn.ghost} shrink-0`}
              >
                <X size={14} />
                <span className="hidden sm:inline">Limpiar búsqueda</span>
              </button>
            )}
          </div>
          <p id="mira-supplier-secondary-help" className="mt-1 text-[11px] text-slate-400">
            Busca dentro de los resultados ya filtrados. No sustituye a los filtros de arriba.
          </p>
        </form>

        {/* Ordenación */}
        <div className="lg:w-56">
          <label
            htmlFor="mira-supplier-sort"
            className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400"
          >
            <ArrowUpDown size={12} aria-hidden="true" />
            Ordenar por
          </label>
          <select
            id="mira-supplier-sort"
            value={sortActual}
            onChange={(e) => ordenar(e.target.value as SupplierSort)}
            disabled={pending}
            className={miraField}
          >
            {SUPPLIER_SORTS.map((s) => (
              <option key={s} value={s}>
                {SUPPLIER_SORT_LABELS[s]}
              </option>
            ))}
          </select>
        </div>

        {/* Exportación — 039: solo administración. */}
        {canExport && (
          <div className="shrink-0">
            <button
              type="button"
              onClick={() => exportar('filtered')}
              disabled={exportando !== null || total === 0}
              className={`${miraBtn.ghost} w-full disabled:opacity-40 lg:w-auto`}
            >
              {exportando === 'filtered' ? (
                <><Loader2 size={14} className="animate-spin" /> Generando…</>
              ) : (
                <><Download size={14} /> Exportar {formatNumber(total, 0)}</>
              )}
            </button>
          </div>
        )}
      </div>

      {nota && sortActual !== DEFAULT_SUPPLIER_SORT && (
        <p className="text-[11px] text-slate-400">{nota}</p>
      )}

      {/* Barra de acciones masivas: solo con algo seleccionado */}
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-mira-magenta/20 bg-mira-magenta-soft/50 px-4 py-3">
          <span className="text-sm font-bold text-mira-magenta">
            {selectedIds.length} seleccionado{selectedIds.length !== 1 ? 's' : ''}
          </span>

          {canExport && (
            <button
              type="button"
              onClick={() => exportar('selected')}
              disabled={exportando !== null}
              className={`${miraBtn.ghost} disabled:opacity-40`}
            >
              {exportando === 'selected' ? (
                <><Loader2 size={14} className="animate-spin" /> Generando…</>
              ) : (
                <><Download size={14} /> Exportar seleccionados</>
              )}
            </button>
          )}

          <button type="button" onClick={onClearSelection} className={miraBtn.ghost}>
            <X size={14} /> Limpiar selección
          </button>
        </div>
      )}

      {error && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
          {error}
        </p>
      )}
    </div>
  )
}

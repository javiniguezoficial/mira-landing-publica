'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useState } from 'react'
import { MapPin, List, Building2, Mail, Phone, Tag, Search, X, ChevronLeft, ChevronRight, ListTree } from 'lucide-react'
import type { Supplier } from '@/lib/actions/suppliers'
import type { SupplierMarketNode } from '@/lib/actions/supplier-taxonomy'
import type { MapSupplier } from './SupplierMap'
import { MiraViewToggle } from '@/components/mira/MiraViewToggle'
import { SupplierTaxonomyFilterSelects } from '@/components/admin/suppliers/SupplierTaxonomyFilterSelects'
import { miraField, miraLabel, miraBtn } from '@/lib/miraButtons'

// Breadcrumb de la taxonomía propia de proveedores, o null si no está clasificado.
function taxonomyBreadcrumb(s: Supplier): string | null {
  if (!s.supplier_market) return null
  return [s.supplier_market?.name, s.supplier_category?.name, s.supplier_family?.name, s.supplier_subfamily?.name]
    .filter(Boolean).join(' › ')
}

// Clasificación legacy (Pricing / texto libre), o null si no hay nada.
function legacyLabel(s: Supplier): string | null {
  const parts = [s.market?.name, s.category, s.family, s.subfamily].filter(Boolean)
  return parts.length ? parts.join(' · ') : null
}

// Dynamic import con ssr:false — Leaflet usa window/document directamente
const SupplierMap = dynamic(
  () => import('./SupplierMap').then((m) => m.SupplierMap),
  { ssr: false, loading: () => <div className="flex h-[400px] items-center justify-center rounded-2xl bg-mira-canvas text-sm text-slate-400">Cargando mapa…</div> }
)

interface FilterValues {
  q?: string
  country?: string
  region?: string
  produccion?: string
  supplier_market_id?: string
  supplier_category_id?: string
  supplier_family_id?: string
  supplier_subfamily_id?: string
}

interface Props {
  suppliers: Supplier[]
  total: number
  hasMore: boolean
  page: number
  totalPages: number
  prevUrl: string | null
  nextUrl: string | null
  filters: FilterValues
  countries: string[]
  regions: string[]
  taxonomyTree: SupplierMarketNode[]
}

export function SupplierListClient({
  suppliers,
  total,
  hasMore,
  page,
  totalPages,
  prevUrl,
  nextUrl,
  filters,
  countries,
  regions,
  taxonomyTree,
}: Props) {
  // Solo el toggle mapa/lista es estado local — el filtrado es 100% server-side
  const [view, setView] = useState<'list' | 'map'>('map')

  const hasActiveFilters = Object.values(filters).some(Boolean)

  const withCoords = suppliers.filter(
    (s): s is Supplier & { latitude: number; longitude: number } =>
      s.latitude != null && s.longitude != null
  )

  const mapSuppliers: MapSupplier[] = withCoords.map((s) => ({
    id: s.id,
    name: s.name,
    email: s.email,
    phone: s.phone,
    website: s.website,
    city: s.city,
    region: s.region,
    country: s.country,
    category: s.category,
    market: s.market ?? null,
    family: s.family,
    subfamily: s.subfamily,
    produccion: s.produccion,
    medida: s.medida,
    latitude: s.latitude,
    longitude: s.longitude,
    taxonomy: taxonomyBreadcrumb(s),
    legacy: legacyLabel(s),
  }))

  return (
    <div className="space-y-5">
      {/* Formulario de filtros — GET → server render.
          key=JSON.stringify(filters): fuerza el remonte de los <input>/<select>
          no controlados cuando cambian los filtros (incluido "Limpiar filtros"),
          para que defaultValue se re-sincronice y no queden valores visuales
          obsoletos (p. ej. el mercado seleccionado tras limpiar). */}
      <form
        key={JSON.stringify(filters)}
        method="GET"
        action="/app/proveedores"
        className="mira-card space-y-4 rounded-2xl p-4"
      >
        {/* Fila superior */}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className={miraLabel}>Nombre del proveedor</label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                name="q"
                defaultValue={filters.q ?? ''}
                placeholder="Nombre del proveedor…"
                className={`${miraField} pl-8`}
              />
            </div>
          </div>

          <div>
            <label className={miraLabel}>País</label>
            <select name="country" defaultValue={filters.country ?? ''} className={miraField}>
              <option value="">Todos</option>
              {countries.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={miraLabel}>Provincia</label>
            <select name="region" defaultValue={filters.region ?? ''} className={miraField}>
              <option value="">Todas</option>
              {regions.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          <div>
            <label className={miraLabel}>Producción</label>
            <input
              name="produccion"
              defaultValue={filters.produccion ?? ''}
              placeholder="Ej. 5000"
              className={miraField}
            />
            <p className="mt-1 text-[11px] text-slate-400">Búsqueda por texto — no es un rango exacto.</p>
          </div>
        </div>

        {/* Fila inferior — taxonomía propia de proveedores (selects encadenados) */}
        <div className="border-t border-mira-line pt-4">
          {taxonomyTree.length === 0 ? (
            <p className="text-xs text-slate-400">
              Todavía no hay taxonomía de proveedores disponible para filtrar.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <SupplierTaxonomyFilterSelects tree={taxonomyTree} values={filters} />
            </div>
          )}
        </div>

        {/* Acciones del formulario */}
        <div className="flex items-center gap-2 pt-1">
          <button type="submit" className={miraBtn.primary}>
            <Search size={14} /> Buscar
          </button>
          {hasActiveFilters && (
            <Link href="/app/proveedores" className={miraBtn.ghost}>
              <X size={14} /> Limpiar filtros
            </Link>
          )}
        </div>
      </form>

      {/* Aviso cuando hay más resultados que la página actual */}
      {hasMore && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          Hay más proveedores disponibles. Usa los filtros para afinar la búsqueda o navega entre páginas.
        </div>
      )}

      {/* Contador + toggle vista */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-500">
          <span className="font-black text-mira-ink">{suppliers.length}</span>{' '}
          {suppliers.length === 1 ? 'proveedor' : 'proveedores'} en esta página
          {total > suppliers.length && (
            <span className="ml-1 text-slate-400">· {total} en total</span>
          )}
          {withCoords.length > 0 && (
            <span className="ml-2 text-slate-400">· {withCoords.length} en el mapa</span>
          )}
        </p>
        <MiraViewToggle
          value={view}
          onChange={setView}
          options={[
            { value: 'list', label: 'Lista', icon: List },
            { value: 'map', label: 'Mapa', icon: MapPin },
          ]}
        />
      </div>

      {suppliers.length === 0 && (
        <div className="mira-card rounded-2xl p-8 text-center text-sm text-slate-400">
          {hasActiveFilters
            ? 'No hay proveedores que coincidan con los filtros seleccionados.'
            : 'No hay proveedores disponibles en este momento.'}
        </div>
      )}

      {/* Vista mapa */}
      {view === 'map' && suppliers.length > 0 && (
        <div>
          {withCoords.length === 0 ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              Ninguno de los proveedores de esta página tiene coordenadas. Puedes verlos en la vista de lista.
            </div>
          ) : (
            <>
              {withCoords.length < suppliers.length && (
                <div className="mb-3 rounded-xl border border-mira-line bg-mira-canvas px-4 py-2 text-xs text-slate-500">
                  {suppliers.length - withCoords.length}{' '}
                  {suppliers.length - withCoords.length === 1 ? 'proveedor no tiene' : 'proveedores no tienen'} coordenadas y no
                  {suppliers.length - withCoords.length === 1 ? ' aparece' : ' aparecen'} en el mapa.
                </div>
              )}
              <div className="mira-card overflow-hidden rounded-2xl p-1.5">
                <SupplierMap suppliers={mapSuppliers} />
              </div>
            </>
          )}
        </div>
      )}

      {/* Vista listado */}
      {view === 'list' && suppliers.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {suppliers.map((s) => {
            const onMap = s.latitude != null && s.longitude != null
            return (
              <div
                key={s.id}
                className="mira-card flex items-start gap-3.5 rounded-2xl p-4 transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-mira-ink/10"
              >
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-mira-magenta-soft">
                  <Building2 size={20} className="text-mira-magenta" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-bold text-mira-ink">{s.name}</p>
                    {onMap && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                        <MapPin size={9} /> En el mapa
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    {taxonomyBreadcrumb(s) ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-mira-magenta-soft px-2 py-0.5 text-[11px] font-semibold text-mira-magenta">
                        <ListTree size={10} /> {taxonomyBreadcrumb(s)}
                      </span>
                    ) : legacyLabel(s) ? (
                      <span className="inline-flex items-center gap-1 rounded-md bg-mira-canvas px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                        <Tag size={10} /> {legacyLabel(s)}
                      </span>
                    ) : null}
                    {(s.city || s.country) && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                        <MapPin size={10} />
                        {[s.city, s.region, s.postal_code, s.country].filter(Boolean).join(', ')}
                      </span>
                    )}
                  </div>
                  {s.produccion && (
                    <p className="mt-1 text-[11px] text-slate-400">
                      Producción: {s.produccion}{s.medida ? ` · ${s.medida}` : ''}
                    </p>
                  )}
                  {(s.email || s.phone) && (
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-mira-line pt-2">
                      {s.email && (
                        <a
                          href={`mailto:${s.email}`}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-mira-magenta hover:underline"
                        >
                          <Mail size={11} /> {s.email}
                        </a>
                      )}
                      {s.phone && (
                        <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                          <Phone size={11} /> {s.phone}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Paginación */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 pt-2">
          {prevUrl ? (
            <Link href={prevUrl} className={miraBtn.ghost}>
              <ChevronLeft size={14} /> Anterior
            </Link>
          ) : (
            <span className="cursor-not-allowed rounded-xl px-4 py-2 text-sm text-slate-300">
              <ChevronLeft size={14} className="inline" /> Anterior
            </span>
          )}
          <span className="text-sm text-slate-500">
            Página <span className="font-bold text-mira-ink">{page}</span> de {totalPages}
          </span>
          {nextUrl ? (
            <Link href={nextUrl} className={miraBtn.ghost}>
              Siguiente <ChevronRight size={14} />
            </Link>
          ) : (
            <span className="cursor-not-allowed rounded-xl px-4 py-2 text-sm text-slate-300">
              Siguiente <ChevronRight size={14} className="inline" />
            </span>
          )}
        </div>
      )}
    </div>
  )
}

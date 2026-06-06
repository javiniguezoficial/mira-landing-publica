'use client'

import dynamic from 'next/dynamic'
import { useState, useMemo } from 'react'
import { MapPin, List, Building2, Mail, Phone, Tag } from 'lucide-react'
import type { Supplier } from '@/lib/actions/suppliers'
import type { MapSupplier } from './SupplierMap'
import { MiraFilterBar } from '@/components/mira/MiraFilterBar'
import { MiraViewToggle } from '@/components/mira/MiraViewToggle'
import { miraField, miraLabel } from '@/lib/miraButtons'

// Dynamic import con ssr:false — Leaflet usa window/document directamente
const SupplierMap = dynamic(
  () => import('./SupplierMap').then((m) => m.SupplierMap),
  { ssr: false, loading: () => <div className="flex h-[400px] items-center justify-center rounded-2xl bg-mira-canvas text-sm text-slate-400">Cargando mapa…</div> }
)

function unique(arr: (string | null)[]): string[] {
  return Array.from(new Set(arr.filter((v): v is string => !!v))).sort()
}

interface Props {
  suppliers: Supplier[]
}

export function SupplierListClient({ suppliers }: Props) {
  const [country,  setCountry]  = useState('')
  const [region,   setRegion]   = useState('')
  const [city,     setCity]     = useState('')
  const [category, setCategory] = useState('')
  const [view,     setView]     = useState<'list' | 'map'>('list')

  const countries  = useMemo(() => unique(suppliers.map((s) => s.country)),  [suppliers])
  const regions    = useMemo(() => unique(suppliers.map((s) => s.region)),    [suppliers])
  const cities     = useMemo(() => unique(suppliers.map((s) => s.city)),      [suppliers])
  const categories = useMemo(() => unique(suppliers.map((s) => s.category)), [suppliers])

  const filtered = useMemo(() => suppliers.filter((s) => {
    if (country  && s.country   !== country)  return false
    if (region   && s.region    !== region)   return false
    if (city     && s.city      !== city)     return false
    if (category && s.category  !== category) return false
    return true
  }), [suppliers, country, region, city, category])

  const withCoords = useMemo(
    () => filtered.filter((s): s is Supplier & { latitude: number; longitude: number } =>
      s.latitude != null && s.longitude != null
    ),
    [filtered]
  )

  const mapSuppliers: MapSupplier[] = withCoords.map((s) => ({
    id: s.id, name: s.name, email: s.email, phone: s.phone,
    city: s.city, country: s.country, category: s.category,
    latitude: s.latitude, longitude: s.longitude,
  }))

  const hasActiveFilters = country || region || city || category

  function clearFilters() {
    setCountry(''); setRegion(''); setCity(''); setCategory('')
  }

  return (
    <div className="space-y-5">
      {/* Filtros */}
      <MiraFilterBar>
        {countries.length > 1 && (
          <div className="flex-1 sm:max-w-[180px]">
            <label className={miraLabel}>País</label>
            <select value={country} onChange={(e) => setCountry(e.target.value)} className={miraField}>
              <option value="">Todos</option>
              {countries.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        )}
        {regions.length > 0 && (
          <div className="flex-1 sm:max-w-[180px]">
            <label className={miraLabel}>Región</label>
            <select value={region} onChange={(e) => setRegion(e.target.value)} className={miraField}>
              <option value="">Todas</option>
              {regions.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        )}
        {cities.length > 0 && (
          <div className="flex-1 sm:max-w-[180px]">
            <label className={miraLabel}>Ciudad</label>
            <select value={city} onChange={(e) => setCity(e.target.value)} className={miraField}>
              <option value="">Todas</option>
              {cities.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        )}
        {categories.length > 0 && (
          <div className="flex-1 sm:max-w-[180px]">
            <label className={miraLabel}>Categoría</label>
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={miraField}>
              <option value="">Todas</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
        )}
        {hasActiveFilters && (
          <button onClick={clearFilters} className="rounded-xl px-3 py-2.5 text-xs font-semibold text-mira-magenta hover:underline">
            Limpiar filtros
          </button>
        )}
      </MiraFilterBar>

      {/* Contador + toggle vista */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-500">
          <span className="font-black text-mira-ink">{filtered.length}</span>{' '}
          {filtered.length === 1 ? 'proveedor encontrado' : 'proveedores encontrados'}
          {withCoords.length > 0 && <span className="ml-2 text-slate-400">· {withCoords.length} en el mapa</span>}
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

      {filtered.length === 0 && (
        <div className="mira-card rounded-2xl p-8 text-center text-sm text-slate-400">
          No hay proveedores que coincidan con los filtros seleccionados.
        </div>
      )}

      {/* Vista mapa */}
      {view === 'map' && filtered.length > 0 && (
        <div>
          {withCoords.length === 0 ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
              Ninguno de los proveedores filtrados tiene coordenadas. Puedes verlos en la vista de lista.
            </div>
          ) : (
            <>
              {withCoords.length < filtered.length && (
                <div className="mb-3 rounded-xl border border-mira-line bg-mira-canvas px-4 py-2 text-xs text-slate-500">
                  {filtered.length - withCoords.length} {filtered.length - withCoords.length === 1 ? 'proveedor no tiene' : 'proveedores no tienen'} coordenadas y no aparece{filtered.length - withCoords.length === 1 ? '' : 'n'} en el mapa.
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
      {view === 'list' && filtered.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {filtered.map((s) => {
            const onMap = s.latitude != null && s.longitude != null
            return (
              <div key={s.id} className="mira-card flex items-start gap-3.5 rounded-2xl p-4 transition-all hover:-translate-y-0.5 hover:shadow-lg hover:shadow-mira-ink/10">
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
                    {s.category && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-mira-canvas px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                        <Tag size={10} /> {s.category}
                      </span>
                    )}
                    {(s.city || s.country) && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-slate-400">
                        <MapPin size={10} /> {[s.city, s.region, s.country].filter(Boolean).join(', ')}
                      </span>
                    )}
                  </div>
                  {(s.email || s.phone) && (
                    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-mira-line pt-2">
                      {s.email && (
                        <a href={`mailto:${s.email}`} className="inline-flex items-center gap-1 text-xs font-semibold text-mira-magenta hover:underline">
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
    </div>
  )
}

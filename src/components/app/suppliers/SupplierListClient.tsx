'use client'

import dynamic from 'next/dynamic'
import { useState, useMemo } from 'react'
import { MapPin, List } from 'lucide-react'
import type { Supplier } from '@/lib/actions/suppliers'
import type { MapSupplier } from './SupplierMap'

// Dynamic import con ssr:false — Leaflet usa window/document directamente
const SupplierMap = dynamic(
  () => import('./SupplierMap').then((m) => m.SupplierMap),
  { ssr: false, loading: () => <div className="h-[400px] rounded-xl bg-slate-100 flex items-center justify-center text-sm text-slate-400">Cargando mapa…</div> }
)

function unique(arr: (string | null)[]): string[] {
  return Array.from(new Set(arr.filter((v): v is string => !!v))).sort()
}

const selectCls = 'border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-mira-primary'

interface Props {
  suppliers: Supplier[]
}

export function SupplierListClient({ suppliers }: Props) {
  const [country,  setCountry]  = useState('')
  const [region,   setRegion]   = useState('')
  const [city,     setCity]     = useState('')
  const [category, setCategory] = useState('')
  const [view,     setView]     = useState<'list' | 'map'>('list')

  // Filter options derived from full list
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
    id:        s.id,
    name:      s.name,
    email:     s.email,
    phone:     s.phone,
    city:      s.city,
    country:   s.country,
    category:  s.category,
    latitude:  s.latitude,
    longitude: s.longitude,
  }))

  const hasActiveFilters = country || region || city || category

  function clearFilters() {
    setCountry(''); setRegion(''); setCity(''); setCategory('')
  }

  return (
    <div>
      {/* Filtros */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 mb-5">
        <div className="flex flex-wrap gap-3 items-end">
          {countries.length > 1 && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">País</label>
              <select value={country} onChange={(e) => setCountry(e.target.value)} className={selectCls}>
                <option value="">Todos</option>
                {countries.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}
          {regions.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Región</label>
              <select value={region} onChange={(e) => setRegion(e.target.value)} className={selectCls}>
                <option value="">Todas</option>
                {regions.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
          )}
          {cities.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Ciudad</label>
              <select value={city} onChange={(e) => setCity(e.target.value)} className={selectCls}>
                <option value="">Todas</option>
                {cities.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}
          {categories.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Categoría</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)} className={selectCls}>
                <option value="">Todas</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}
          {hasActiveFilters && (
            <button onClick={clearFilters} className="px-3 py-2 text-xs text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors">
              Limpiar filtros
            </button>
          )}
        </div>
      </div>

      {/* Contador + toggle vista */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-slate-500">
          <span className="font-semibold text-slate-800">{filtered.length}</span>{' '}
          {filtered.length === 1 ? 'proveedor encontrado' : 'proveedores encontrados'}
          {withCoords.length > 0 && (
            <span className="text-slate-400 ml-2">· {withCoords.length} en el mapa</span>
          )}
        </p>
        <div className="flex items-center gap-1 border border-slate-200 rounded-lg p-1 bg-white">
          <button
            onClick={() => setView('list')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${view === 'list' ? 'bg-mira-primary text-white' : 'text-slate-500 hover:bg-slate-100'}`}
          >
            <List size={13} /> Lista
          </button>
          <button
            onClick={() => setView('map')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${view === 'map' ? 'bg-mira-primary text-white' : 'text-slate-500 hover:bg-slate-100'}`}
          >
            <MapPin size={13} /> Mapa
          </button>
        </div>
      </div>

      {filtered.length === 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-sm text-slate-400">
          No hay proveedores que coincidan con los filtros seleccionados.
        </div>
      )}

      {/* Vista mapa */}
      {view === 'map' && filtered.length > 0 && (
        <div className="mb-5">
          {withCoords.length === 0 ? (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
              Ninguno de los proveedores filtrados tiene coordenadas. Puedes verlos en la vista de lista.
            </div>
          ) : (
            <>
              {withCoords.length < filtered.length && (
                <div className="mb-3 bg-slate-50 border border-slate-200 rounded-lg px-4 py-2 text-xs text-slate-500">
                  {filtered.length - withCoords.length} {filtered.length - withCoords.length === 1 ? 'proveedor no tiene' : 'proveedores no tienen'} coordenadas y no aparece{filtered.length - withCoords.length === 1 ? '' : 'n'} en el mapa.
                </div>
              )}
              <SupplierMap suppliers={mapSuppliers} />
            </>
          )}
        </div>
      )}

      {/* Vista listado */}
      {view === 'list' && filtered.length > 0 && (
        <div className="grid gap-3">
          {filtered.map((s) => (
            <div key={s.id} className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-slate-800">{s.name}</p>
                    {s.latitude != null && s.longitude != null && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-green-100 text-green-700 text-xs">
                        <MapPin size={9} /> En el mapa
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                    {s.category && <span className="text-xs text-slate-500">{s.category}</span>}
                    {(s.city || s.country) && (
                      <span className="text-xs text-slate-400">
                        {[s.city, s.region, s.country].filter(Boolean).join(', ')}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  {s.email && (
                    <a href={`mailto:${s.email}`} className="text-xs text-mira-primary hover:underline block">
                      {s.email}
                    </a>
                  )}
                  {s.phone && <p className="text-xs text-slate-400 mt-0.5">{s.phone}</p>}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

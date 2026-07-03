'use client'

// leaflet.css must be imported here, inside a client component, to avoid SSR build errors
import 'leaflet/dist/leaflet.css'

import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import { Hand } from 'lucide-react'

// Fix default marker icons broken by webpack asset hashing
const icon = L.icon({
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  iconSize:    [25, 41],
  iconAnchor:  [12, 41],
  popupAnchor: [1, -34],
  shadowSize:  [41, 41],
})

export interface MapSupplier {
  id: string
  name: string
  email: string | null
  phone: string | null
  website: string | null
  city: string | null
  region: string | null
  country: string
  category: string | null
  market: { id: string; name: string } | null
  family: string | null
  subfamily: string | null
  produccion: string | null
  medida: string | null
  latitude: number
  longitude: number
}

interface Props {
  suppliers: MapSupplier[]
}

// Encuadra el mapa a los marcadores visibles (o centra+zoom si solo hay uno).
// Sustituye el centro-medio + zoom fijo anterior, que dejaba España cortada
// o con proporción rara cuando los proveedores filtrados quedaban dispersos
// hacia un extremo del encuadre.
function FitBounds({ suppliers }: { suppliers: MapSupplier[] }) {
  const map = useMap()

  useEffect(() => {
    if (suppliers.length === 0) return

    // invalidateSize corrige mediciones si el contenedor cambió de tamaño
    // justo tras el montaje (p. ej. al alternar entre vista lista/mapa).
    map.invalidateSize()

    if (suppliers.length === 1) {
      map.setView([suppliers[0].latitude, suppliers[0].longitude], 10)
      return
    }

    const bounds = L.latLngBounds(suppliers.map((s) => [s.latitude, s.longitude] as [number, number]))
    map.fitBounds(bounds, { padding: [32, 32], maxZoom: 9 })
  }, [suppliers, map])

  return null
}

// Activa/desactiva la interacción táctil/rueda del mapa. Por defecto el mapa
// está "inerte" (no captura scroll ni gestos táctiles), así la página nunca
// se queda bloqueada al pasar el cursor/dedo por encima. Un primer clic o
// toque activa la interacción completa (arrastrar, zoom con rueda/pellizco).
function GestureGate({ active }: { active: boolean }) {
  const map = useMap()

  useEffect(() => {
    if (active) {
      map.dragging.enable()
      map.scrollWheelZoom.enable()
      map.touchZoom.enable()
      map.doubleClickZoom.enable()
    } else {
      map.dragging.disable()
      map.scrollWheelZoom.disable()
      map.touchZoom.disable()
      map.doubleClickZoom.disable()
    }
  }, [active, map])

  return null
}

export function SupplierMap({ suppliers }: Props) {
  const [active, setActive] = useState(false)

  if (suppliers.length === 0) return null

  const avgLat = suppliers.reduce((s, p) => s + p.latitude, 0) / suppliers.length
  const avgLng = suppliers.reduce((s, p) => s + p.longitude, 0) / suppliers.length

  return (
    <div className="relative">
      <MapContainer
        center={[avgLat, avgLng]}
        zoom={suppliers.length === 1 ? 10 : 6}
        className="h-[420px] w-full rounded-xl sm:h-[480px] lg:h-[560px]"
        scrollWheelZoom={false}
        dragging={false}
        touchZoom={false}
        doubleClickZoom={false}
      >
        <FitBounds suppliers={suppliers} />
        <GestureGate active={active} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {suppliers.map((s) => (
          <Marker key={s.id} position={[s.latitude, s.longitude]} icon={icon}>
            <Popup>
              <div className="min-w-[190px] space-y-1.5 py-0.5">
                {/* Nombre */}
                <p className="text-sm font-bold text-slate-800 leading-tight">{s.name}</p>

                {/* Mercado / Categoría */}
                {(s.market?.name || s.category) && (
                  <p className="text-xs text-mira-magenta font-semibold">
                    {[s.market?.name, s.category].filter(Boolean).join(' · ')}
                  </p>
                )}

                {/* Familia / Subfamilia */}
                {(s.family || s.subfamily) && (
                  <p className="text-xs text-slate-500">
                    {[s.family, s.subfamily].filter(Boolean).join(' · ')}
                  </p>
                )}

                {/* Localidad / Provincia */}
                {(s.city || s.region) && (
                  <p className="text-xs text-slate-600">
                    {[s.city, s.region].filter(Boolean).join(', ')}
                  </p>
                )}

                {/* Producción · Medida */}
                {s.produccion && (
                  <p className="text-xs text-slate-500">
                    {s.produccion}{s.medida ? ` · ${s.medida}` : ''}
                  </p>
                )}

                {/* Contacto */}
                {(s.email || s.phone || s.website) && (
                  <div className="border-t border-slate-100 pt-1.5 space-y-0.5">
                    {s.email && (
                      <a
                        href={`mailto:${s.email}`}
                        className="block text-xs text-mira-magenta hover:underline truncate"
                      >
                        {s.email}
                      </a>
                    )}
                    {s.phone && (
                      <p className="text-xs text-slate-500">{s.phone}</p>
                    )}
                    {s.website && (
                      <a
                        href={s.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block text-xs text-slate-400 hover:underline truncate"
                      >
                        {s.website.replace(/^https?:\/\//, '')}
                      </a>
                    )}
                  </div>
                )}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {/* Overlay "click para interactuar" — evita que un scroll/gesto de página
          que pase por encima del mapa quede capturado por Leaflet. */}
      {!active && (
        <button
          type="button"
          onClick={() => setActive(true)}
          className="absolute inset-0 z-[1000] flex cursor-pointer items-center justify-center rounded-xl bg-mira-ink/0 transition-colors hover:bg-mira-ink/5"
          aria-label="Activar interacción con el mapa"
        >
          <span className="flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-xs font-semibold text-slate-600 shadow-md">
            <Hand size={13} /> Haz clic para mover y hacer zoom
          </span>
        </button>
      )}
    </div>
  )
}

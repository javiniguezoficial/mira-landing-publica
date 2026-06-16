'use client'

// leaflet.css must be imported here, inside a client component, to avoid SSR build errors
import 'leaflet/dist/leaflet.css'

import { useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet'
import L from 'leaflet'

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

export function SupplierMap({ suppliers }: Props) {
  if (suppliers.length === 0) return null

  // Center on the average of all coordinates, fallback to Spain
  const avgLat = suppliers.reduce((s, p) => s + p.latitude, 0) / suppliers.length
  const avgLng = suppliers.reduce((s, p) => s + p.longitude, 0) / suppliers.length

  return (
    <MapContainer
      center={[avgLat, avgLng]}
      zoom={suppliers.length === 1 ? 10 : 6}
      style={{ height: '400px', width: '100%', borderRadius: '12px' }}
      scrollWheelZoom={false}
    >
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
  )
}

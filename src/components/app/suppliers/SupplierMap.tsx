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
  city: string | null
  country: string
  category: string | null
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
            <div className="min-w-[160px]">
              <p className="font-semibold text-slate-800 text-sm">{s.name}</p>
              {s.category && <p className="text-xs text-slate-500 mt-0.5">{s.category}</p>}
              {s.city && <p className="text-xs text-slate-600 mt-1">{s.city}, {s.country}</p>}
              {s.email && (
                <a href={`mailto:${s.email}`} className="text-xs text-mira-primary block mt-1 hover:underline">
                  {s.email}
                </a>
              )}
              {s.phone && <p className="text-xs text-slate-500 mt-0.5">{s.phone}</p>}
            </div>
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  )
}

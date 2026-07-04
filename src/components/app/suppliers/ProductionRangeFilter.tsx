'use client'

import { useState } from 'react'
import { formatNumber } from '@/lib/utils'

interface Props {
  // Tope superior disponible (calculado desde datos). El inferior es 0.
  max: number
  // Valores iniciales desde la URL (strings de searchParams) o vacío.
  initialMin?: string
  initialMax?: string
  labelClassName?: string
}

// Slider doble (mín/máx) para el filtro de Producción, estilo rango tipo Booking.
// Sin librerías: dos <input type="range"> superpuestos + inputs OCULTOS que son
// los que envían el formulario GET (produccion_min / produccion_max).
//
// Clave: si un extremo está en su tope (mín=0 o máx=absoluteMax) NO se envía ese
// parámetro (queda ''), para no excluir a proveedores sin produccion_value.
export function ProductionRangeFilter({ max, initialMin, initialMax, labelClassName = 'block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5' }: Props) {
  const ABS_MIN = 0
  const ABS_MAX = max > 0 ? max : 100000
  const step = Math.max(1, Math.round(ABS_MAX / 100))

  const clamp = (n: number) => Math.min(ABS_MAX, Math.max(ABS_MIN, n))
  const parse = (s: string | undefined, fallback: number) => {
    if (!s || s.trim() === '') return fallback
    const n = parseFloat(s.replace(',', '.'))
    return Number.isNaN(n) ? fallback : clamp(n)
  }

  const [minVal, setMinVal] = useState(() => parse(initialMin, ABS_MIN))
  const [maxVal, setMaxVal] = useState(() => parse(initialMax, ABS_MAX))

  // Solo se envían como filtro si el usuario ha movido el extremo respecto al tope.
  const submitMin = minVal > ABS_MIN ? String(minVal) : ''
  const submitMax = maxVal < ABS_MAX ? String(maxVal) : ''

  const isFull = minVal === ABS_MIN && maxVal === ABS_MAX
  const minPct = ((minVal - ABS_MIN) / (ABS_MAX - ABS_MIN)) * 100
  const maxPct = ((maxVal - ABS_MIN) / (ABS_MAX - ABS_MIN)) * 100

  return (
    <div>
      <label className={labelClassName}>Producción (rango)</label>

      {/* Inputs ocultos: lo que realmente envía el formulario GET */}
      <input type="hidden" name="produccion_min" value={submitMin} />
      <input type="hidden" name="produccion_max" value={submitMax} />

      <div className="rounded-xl border border-mira-line bg-white px-3 py-2.5">
        <p className="mb-2 text-xs font-semibold text-slate-600">
          {isFull ? 'Todos los volúmenes' : `Producción: ${formatNumber(minVal)} – ${formatNumber(maxVal)}`}
        </p>

        <div className="relative h-6">
          {/* Pista base */}
          <div className="prf-track absolute top-1/2 h-1.5 w-full -translate-y-1/2 rounded-full bg-mira-line" />
          {/* Segmento seleccionado */}
          <div
            className="prf-fill absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-mira-magenta"
            style={{ left: `${minPct}%`, right: `${100 - maxPct}%` }}
          />
          <input
            type="range"
            className="prf-range"
            min={ABS_MIN}
            max={ABS_MAX}
            step={step}
            value={minVal}
            aria-label="Producción mínima"
            onChange={(e) => setMinVal(Math.min(parseFloat(e.target.value), maxVal))}
          />
          <input
            type="range"
            className="prf-range"
            min={ABS_MIN}
            max={ABS_MAX}
            step={step}
            value={maxVal}
            aria-label="Producción máxima"
            onChange={(e) => setMaxVal(Math.max(parseFloat(e.target.value), minVal))}
          />
        </div>

        <div className="mt-1 flex justify-between text-[10px] text-slate-400">
          <span>{formatNumber(ABS_MIN)}</span>
          <span>{formatNumber(ABS_MAX)}</span>
        </div>
      </div>

      {/* Estilos del slider doble (sin librerías). Scoped por la clase .prf-range. */}
      <style>{`
        .prf-range {
          position: absolute;
          top: 0; left: 0;
          width: 100%; height: 24px; margin: 0;
          background: transparent;
          pointer-events: none;
          -webkit-appearance: none;
          appearance: none;
        }
        .prf-range::-webkit-slider-thumb {
          pointer-events: auto;
          -webkit-appearance: none;
          height: 18px; width: 18px;
          border-radius: 9999px;
          background: #fff;
          border: 2px solid #d6006e;
          cursor: pointer;
          box-shadow: 0 1px 3px rgba(0,0,0,.25);
        }
        .prf-range::-moz-range-thumb {
          pointer-events: auto;
          height: 18px; width: 18px;
          border-radius: 9999px;
          background: #fff;
          border: 2px solid #d6006e;
          cursor: pointer;
          box-shadow: 0 1px 3px rgba(0,0,0,.25);
        }
        .prf-range::-webkit-slider-runnable-track { background: transparent; }
        .prf-range::-moz-range-track { background: transparent; }
      `}</style>
    </div>
  )
}

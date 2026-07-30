'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Globe2, Search } from 'lucide-react'
import {
  setOrganizationDisabledMarkets,
  type OrganizationMarketOption,
} from '@/lib/actions/organization-markets'
import { miraBtn, miraField } from '@/lib/miraButtons'

interface Props {
  organizationId: string
  markets: OrganizationMarketOption[]
  /** Si el módulo Market Intelligence está apagado para esta organización (1.4). */
  moduleEnabled: boolean
}

/**
 * Mercados disponibles para un cliente (2.2).
 *
 * ── Por qué está separado de «Módulos disponibles» ──────────────────────────
 *
 * Son dos decisiones distintas y confundirlas lleva a errores caros:
 *
 *   · el MÓDULO decide si la organización tiene Market Intelligence;
 *   · esta tarjeta decide QUÉ MERCADOS ve dentro del módulo.
 *
 * Con el módulo apagado, lo que se configure aquí no cambia nada de lo que la
 * persona usuaria ve —no ve nada—, así que se avisa en lugar de dejar que
 * alguien crea que ha resuelto un problema de acceso tocando esta lista.
 *
 * ── Un solo guardado, no 127 ────────────────────────────────────────────────
 *
 * El estado vive en el cliente y se envía COMPLETO al pulsar guardar. Una
 * Server Action por casilla serían hasta 127 peticiones y un estado a medias si
 * alguna fallara. La acción calcula la diferencia contra lo ya almacenado, así
 * que los mercados que no cambian conservan su `disabled_at` y su `disabled_by`.
 */
export function OrganizationMarketsCard({ organizationId, markets, moduleEnabled }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [guardado, setGuardado] = useState<number | null>(null)
  const [busqueda, setBusqueda] = useState('')

  const inicial = useMemo(
    () => new Set(markets.filter((m) => m.disabled).map((m) => m.id)),
    [markets],
  )
  const [deshabilitados, setDeshabilitados] = useState<Set<string>>(() => new Set(inicial))

  const hayCambios =
    deshabilitados.size !== inicial.size ||
    [...deshabilitados].some((id) => !inicial.has(id))

  const visibles = useMemo(() => {
    const q = busqueda.trim().toLowerCase()
    if (!q) return markets
    return markets.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.categoryName.toLowerCase().includes(q) ||
        (m.strategicMarketName ?? '').toLowerCase().includes(q),
    )
  }, [markets, busqueda])

  function alternar(id: string) {
    setGuardado(null)
    setDeshabilitados((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function guardar() {
    setError(null)
    setGuardado(null)
    startTransition(async () => {
      const resultado = await setOrganizationDisabledMarkets(organizationId, [...deshabilitados])
      if (resultado?.error) {
        setError(resultado.error)
        return
      }
      setGuardado(resultado.saved ?? 0)
      router.refresh()
    })
  }

  const habilitados = markets.length - deshabilitados.size

  return (
    <section className="mira-card rounded-2xl p-5 sm:p-6">
      <div className="mb-5 flex items-center gap-2">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-mira-magenta-soft">
          <Globe2 size={14} className="text-mira-magenta" />
        </div>
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-400">
          Mercados disponibles
        </h2>
      </div>

      <p className="mb-4 text-xs text-slate-500">
        Controla qué mercados concretos puede ver esta organización dentro de Market Intelligence.
        Desmarcar un mercado lo retira de los listados, el panel, los selectores y los gráficos, y
        una URL directa deja de mostrar sus datos. No se borra ningún dato ni se pierden los
        favoritos de sus usuarios: vuelven a aparecer si lo rehabilitas.
      </p>

      {!moduleEnabled && (
        <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
          El módulo <strong>Market Intelligence</strong> está desactivado para esta organización, así
          que ahora mismo no ve ningún mercado. Lo que configures aquí solo tendrá efecto cuando
          actives el módulo en <strong>Módulos disponibles</strong>.
        </p>
      )}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs font-bold text-slate-600">
          {habilitados} de {markets.length} mercados habilitados
        </span>
        <div className="relative min-w-[220px] flex-1 sm:max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar mercado…"
            aria-label="Buscar mercado"
            className={`${miraField} pl-8`}
          />
        </div>
      </div>

      <div className="mira-scroll max-h-[360px] space-y-1.5 overflow-y-auto rounded-xl border border-mira-line bg-mira-canvas/40 p-2">
        {visibles.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-slate-400">
            Ningún mercado coincide con «{busqueda}».
          </p>
        ) : (
          visibles.map((market) => {
            const activo = !deshabilitados.has(market.id)
            return (
              <label
                key={market.id}
                className="flex cursor-pointer items-start gap-3 rounded-lg bg-white px-3 py-2 transition-colors hover:bg-mira-magenta-soft/40"
              >
                <input
                  type="checkbox"
                  checked={activo}
                  disabled={pending}
                  onChange={() => alternar(market.id)}
                  aria-label={`${activo ? 'Deshabilitar' : 'Habilitar'} ${market.name}`}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-mira-magenta"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-mira-ink">{market.name}</span>
                    <span className="rounded-md bg-mira-canvas px-1.5 py-0.5 text-[10px] font-bold text-slate-500">
                      {market.countryScope}
                    </span>
                    {!activo && (
                      <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-500">
                        Deshabilitado
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block truncate text-[11px] text-slate-400">
                    {market.strategicMarketName
                      ? `${market.strategicMarketName} · ${market.categoryName}`
                      : market.categoryName}
                  </span>
                </span>
              </label>
            )
          })
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={pending || !hayCambios}
          onClick={guardar}
          className={`${miraBtn.primary} disabled:opacity-40`}
        >
          {pending ? 'Guardando…' : 'Guardar mercados'}
        </button>

        {hayCambios && !pending && (
          <button
            type="button"
            onClick={() => {
              setDeshabilitados(new Set(inicial))
              setError(null)
            }}
            className={miraBtn.ghost}
          >
            Descartar cambios
          </button>
        )}

        {guardado !== null && !hayCambios && (
          <span className="text-xs font-semibold text-emerald-700">
            {guardado === 0 ? 'Sin cambios que guardar.' : `Mercados actualizados (${guardado}).`}
          </span>
        )}
      </div>

      {error && (
        <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      )}
    </section>
  )
}

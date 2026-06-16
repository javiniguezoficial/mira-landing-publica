import Link from 'next/link'
import { Plus, Truck, Search, X } from 'lucide-react'
import { listSuppliersFiltered, type SupplierFilters } from '@/lib/actions/suppliers'
import { getMarkets } from '@/lib/actions/markets'
import { ToggleActiveSupplier } from './ToggleActiveSupplier'
import { MiraPageHeader } from '@/components/mira/MiraPageHeader'
import { MiraTable, MiraTr, MiraTd } from '@/components/mira/MiraTable'
import { EmptyState } from '@/components/shared/EmptyState'
import { miraBtn, miraField } from '@/lib/miraButtons'

export const dynamic = 'force-dynamic'

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default async function AdminSuppliersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; region?: string; market_id?: string; family?: string }>
}) {
  const sp = await searchParams
  const filters: SupplierFilters = {
    search: sp.q || undefined,
    region: sp.region || undefined,
    market_id: sp.market_id || undefined,
    family: sp.family || undefined,
  }

  const [{ suppliers, total, hasMore }, markets] = await Promise.all([
    listSuppliersFiltered(filters),
    getMarkets(),
  ])

  const hasActiveFilters = !!(sp.q || sp.region || sp.market_id || sp.family)

  return (
    <div className="w-full space-y-6 p-4 md:p-6 xl:p-8">
      <MiraPageHeader
        icon={Truck}
        title="Proveedores"
        subtitle={
          hasActiveFilters
            ? `${total} resultado${total !== 1 ? 's' : ''} · filtrando`
            : `${total} proveedor${total !== 1 ? 'es' : ''} en total`
        }
        actions={
          <Link href="/admin/proveedores/nuevo" className={miraBtn.primary}>
            <Plus size={14} /> Nuevo proveedor
          </Link>
        }
      />

      {/* Filtros */}
      <form method="GET" action="/admin/proveedores" className="mira-card rounded-2xl p-4">
        <div className="flex flex-wrap items-end gap-3">
          {/* Búsqueda por nombre */}
          <div className="flex-1 min-w-[180px]">
            <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-400">Buscar</label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                name="q"
                defaultValue={sp.q ?? ''}
                placeholder="Nombre del proveedor…"
                className={`${miraField} pl-8`}
              />
            </div>
          </div>

          {/* Provincia */}
          <div className="flex-1 min-w-[140px]">
            <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-400">Provincia</label>
            <input
              name="region"
              defaultValue={sp.region ?? ''}
              placeholder="Todas"
              className={miraField}
            />
          </div>

          {/* Familia */}
          <div className="flex-1 min-w-[140px]">
            <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-400">Familia</label>
            <input
              name="family"
              defaultValue={sp.family ?? ''}
              placeholder="Todas"
              className={miraField}
            />
          </div>

          {/* Mercado */}
          {markets.length > 0 && (
            <div className="flex-1 min-w-[160px]">
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-slate-400">Mercado</label>
              <select name="market_id" defaultValue={sp.market_id ?? ''} className={miraField}>
                <option value="">Todos</option>
                {markets.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Acciones */}
          <div className="flex items-center gap-2">
            <button type="submit" className={miraBtn.primary}>
              <Search size={14} /> Buscar
            </button>
            {hasActiveFilters && (
              <Link href="/admin/proveedores" className={miraBtn.ghost}>
                <X size={14} /> Limpiar
              </Link>
            )}
          </div>
        </div>
      </form>

      {/* Indicador de límite */}
      {hasMore && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
          Mostrando los primeros 500 de {total} proveedores. Usa los filtros para afinar la búsqueda.
        </div>
      )}

      {suppliers.length === 0 ? (
        <div className="mira-card rounded-2xl">
          <EmptyState
            icon={Truck}
            title={hasActiveFilters ? 'Sin resultados' : 'Aún no hay proveedores'}
            description={
              hasActiveFilters
                ? 'Ningún proveedor coincide con los filtros aplicados.'
                : 'Registra el primer proveedor del catálogo.'
            }
            action={hasActiveFilters ? undefined : { label: 'Crear proveedor', href: '/admin/proveedores/nuevo' }}
          />
        </div>
      ) : (
        <MiraTable
          headers={[
            'Nombre',
            'Mercado / Categoría',
            'Provincia · Localidad',
            'Familia / Subfamilia',
            'Contacto',
            'Alta',
            'Estado',
            { label: '', align: 'right' },
          ]}
        >
          {suppliers.map((s) => (
            <MiraTr key={s.id}>
              <MiraTd>
                <Link
                  href={`/admin/proveedores/${s.id}`}
                  className="font-bold text-mira-ink hover:text-mira-magenta"
                >
                  {s.name}
                </Link>
                {s.tax_id && <p className="text-xs text-slate-400">{s.tax_id}</p>}
              </MiraTd>
              <MiraTd>
                <div className="text-sm text-slate-700">{s.market?.name ?? '—'}</div>
                {s.category && <div className="text-xs text-slate-400">{s.category}</div>}
              </MiraTd>
              <MiraTd>
                <div className="text-sm text-slate-600">{s.region ?? '—'}</div>
                {s.city && <div className="text-xs text-slate-400">{s.city}</div>}
              </MiraTd>
              <MiraTd>
                {(s.family || s.subfamily) ? (
                  <div className="text-sm text-slate-600">
                    {[s.family, s.subfamily].filter(Boolean).join(' · ')}
                  </div>
                ) : (
                  <span className="text-slate-300">—</span>
                )}
              </MiraTd>
              <MiraTd>
                <div className="text-sm text-slate-600">{s.email || '—'}</div>
                {s.phone && <div className="text-xs text-slate-400">{s.phone}</div>}
              </MiraTd>
              <MiraTd className="text-slate-500">{formatDate(s.created_at)}</MiraTd>
              <MiraTd>
                <ToggleActiveSupplier id={s.id} isActive={s.is_active} />
              </MiraTd>
              <MiraTd align="right">
                <div className="flex items-center justify-end gap-2">
                  <Link
                    href={`/admin/proveedores/${s.id}`}
                    className="whitespace-nowrap text-xs font-bold text-mira-magenta hover:underline"
                  >
                    Ver →
                  </Link>
                </div>
              </MiraTd>
            </MiraTr>
          ))}
        </MiraTable>
      )}
    </div>
  )
}

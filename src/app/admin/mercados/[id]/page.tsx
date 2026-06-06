import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Plus, Pencil, ArrowLeft, Package } from 'lucide-react'
import { getMarketById, getProductsByMarket, toggleProduct } from '@/lib/actions/markets'
import { ToggleButton } from '@/components/admin/markets/ToggleButton'
import { MiraPageHeader } from '@/components/mira/MiraPageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { miraBtn } from '@/lib/miraButtons'

export const dynamic = 'force-dynamic'

export default async function MercadoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [market, products] = await Promise.all([
    getMarketById(id),
    getProductsByMarket(id),
  ])
  if (!market) notFound()

  return (
    <div className="w-full space-y-6 p-4 md:p-6 xl:p-8">
      <div>
        <Link
          href="/admin/mercados"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-mira-magenta"
        >
          <ArrowLeft size={14} /> Mercados
        </Link>
        <MiraPageHeader
          icon={Package}
          title={market.name}
          subtitle={`${market.category?.name} · ${market.country_scope} · ${products.length} productos`}
          actions={
            <>
              <Link href={`/admin/mercados/${id}/editar`} className={miraBtn.ghost}>
                <Pencil size={14} /> Editar mercado
              </Link>
              <Link href={`/admin/mercados/${id}/productos/nuevo`} className={miraBtn.primary}>
                <Plus size={15} /> Producto
              </Link>
            </>
          }
        />
      </div>

      {products.length === 0 ? (
        <div className="mira-card rounded-2xl">
          <EmptyState
            icon={Package}
            title="Aún no hay productos"
            description="Añade el primer producto a este mercado."
            action={{ label: 'Añadir producto', href: `/admin/mercados/${id}/productos/nuevo` }}
          />
        </div>
      ) : (
        <div className="mira-card overflow-hidden rounded-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-mira-line bg-mira-canvas/60">
                  <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500 sm:px-6">Producto</th>
                  <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500 sm:px-6">Unidad</th>
                  <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500 sm:px-6">Slug</th>
                  <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-500 sm:px-6">Descripción</th>
                  <th className="px-5 py-3 text-right text-xs font-bold uppercase tracking-wider text-slate-500 sm:px-6">Activo</th>
                  <th className="px-5 py-3 text-right text-xs font-bold uppercase tracking-wider text-slate-500 sm:px-6">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-mira-line">
                {products.map(product => (
                  <tr key={product.id} className="transition-colors hover:bg-mira-canvas/70">
                    <td className="px-5 py-3 font-bold text-mira-ink sm:px-6">{product.name}</td>
                    <td className="px-5 py-3 sm:px-6">
                      <span className="rounded-lg bg-slate-100 px-2 py-0.5 font-mono text-xs font-bold text-slate-600">
                        {product.unit}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-slate-400 sm:px-6">{product.slug}</td>
                    <td className="max-w-xs truncate px-5 py-3 text-xs text-slate-500 sm:px-6">{product.description ?? '—'}</td>
                    <td className="px-5 py-3 text-right sm:px-6">
                      <ToggleButton id={product.id} isActive={product.is_active} onToggle={toggleProduct} />
                    </td>
                    <td className="px-5 py-3 text-right sm:px-6">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/admin/mercados/${id}/productos/${product.id}/precios`}
                          className="text-xs font-bold text-mira-magenta hover:underline"
                        >
                          Precios
                        </Link>
                        <Link
                          href={`/admin/mercados/${id}/productos/${product.id}/editar`}
                          className={miraBtn.icon}
                        >
                          <Pencil size={14} />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

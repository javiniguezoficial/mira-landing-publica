import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Plus, Pencil, ArrowLeft } from 'lucide-react'
import { getMarketById, getProductsByMarket, toggleProduct } from '@/lib/actions/markets'
import { ToggleButton } from '@/components/admin/markets/ToggleButton'

export const dynamic = 'force-dynamic'

export default async function MercadoDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const [market, products] = await Promise.all([
    getMarketById(id),
    getProductsByMarket(id),
  ])
  if (!market) notFound()

  return (
    <div className="p-8">
      <div className="mb-6">
        <Link
          href="/admin/mercados"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4"
        >
          <ArrowLeft size={14} /> Mercados
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-heading font-bold text-slate-900">{market.name}</h1>
            <p className="text-slate-500 font-body text-sm mt-1">
              {market.category?.name} · {market.country_scope} · {products.length} productos
            </p>
          </div>
          <div className="flex gap-2">
            <Link
              href={`/admin/mercados/${id}/editar`}
              className="inline-flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 text-sm font-bold rounded-lg hover:bg-slate-50 transition-colors"
            >
              <Pencil size={14} /> Editar mercado
            </Link>
            <Link
              href={`/admin/mercados/${id}/productos/nuevo`}
              className="inline-flex items-center gap-2 px-4 py-2 bg-mira-primary text-white text-sm font-bold rounded-lg hover:bg-mira-primary/90 transition-colors"
            >
              <Plus size={15} /> Producto
            </Link>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {products.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">
            No hay productos en este mercado.{' '}
            <Link href={`/admin/mercados/${id}/productos/nuevo`} className="text-mira-primary font-bold hover:underline">
              Añade el primero.
            </Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="text-left px-6 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Producto</th>
                <th className="text-left px-6 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Unidad</th>
                <th className="text-left px-6 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Slug</th>
                <th className="text-left px-6 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Descripción</th>
                <th className="px-6 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Activo</th>
                <th className="px-6 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {products.map(product => (
                <tr key={product.id} className="border-b border-slate-50 hover:bg-slate-50/50 transition-colors">
                  <td className="px-6 py-3 font-semibold text-slate-800">{product.name}</td>
                  <td className="px-6 py-3">
                    <span className="text-xs font-bold px-2 py-0.5 bg-slate-100 text-slate-600 rounded font-mono">
                      {product.unit}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-slate-400 font-mono text-xs">{product.slug}</td>
                  <td className="px-6 py-3 text-slate-500 text-xs max-w-xs truncate">{product.description ?? '—'}</td>
                  <td className="px-6 py-3 text-right">
                    <ToggleButton id={product.id} isActive={product.is_active} onToggle={toggleProduct} />
                  </td>
                  <td className="px-6 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/admin/mercados/${id}/productos/${product.id}/precios`}
                        className="text-xs font-bold text-blue-600 hover:underline"
                      >
                        Precios
                      </Link>
                      <Link
                        href={`/admin/mercados/${id}/productos/${product.id}/editar`}
                        className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors inline-flex"
                      >
                        <Pencil size={14} />
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

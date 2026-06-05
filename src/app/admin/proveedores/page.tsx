import Link from 'next/link'
import { Plus } from 'lucide-react'
import { listSuppliers } from '@/lib/actions/suppliers'
import { ToggleActiveSupplier } from './ToggleActiveSupplier'

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default async function AdminSuppliersPage() {
  const suppliers = await listSuppliers()

  return (
    <div className="p-8">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-heading font-bold text-slate-900">Proveedores</h1>
          <p className="text-sm text-slate-500 mt-1">Catálogo de proveedores de la plataforma</p>
        </div>
        <Link
          href="/admin/proveedores/nuevo"
          className="inline-flex items-center gap-1.5 px-4 py-2 bg-mira-primary text-white rounded-lg text-sm font-semibold hover:bg-mira-primary/90 transition-colors"
        >
          <Plus size={14} />
          Nuevo proveedor
        </Link>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {suppliers.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-400">
            No hay proveedores registrados todavía.{' '}
            <Link href="/admin/proveedores/nuevo" className="text-mira-primary hover:underline">Crear el primero</Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-slate-100 bg-slate-50">
              <tr>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-6 py-3">Nombre</th>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Categoría</th>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">País / Ciudad</th>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Contacto</th>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Alta</th>
                <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-4 py-3">Estado</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {suppliers.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-6 py-3">
                    <Link href={`/admin/proveedores/${s.id}`} className="font-medium text-slate-800 hover:text-mira-primary">
                      {s.name}
                    </Link>
                    {s.tax_id && <p className="text-xs text-slate-400">{s.tax_id}</p>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{s.category || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {[s.city, s.country].filter(Boolean).join(', ') || '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    <div>{s.email || '—'}</div>
                    {s.phone && <div className="text-xs text-slate-400">{s.phone}</div>}
                  </td>
                  <td className="px-4 py-3 text-slate-500">{formatDate(s.created_at)}</td>
                  <td className="px-4 py-3">
                    <ToggleActiveSupplier id={s.id} isActive={s.is_active} />
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/admin/proveedores/${s.id}`} className="text-xs text-mira-primary hover:underline whitespace-nowrap">
                      Ver →
                    </Link>
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

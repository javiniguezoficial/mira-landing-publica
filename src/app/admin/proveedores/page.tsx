import Link from 'next/link'
import { Plus, Truck } from 'lucide-react'
import { listSuppliers } from '@/lib/actions/suppliers'
import { ToggleActiveSupplier } from './ToggleActiveSupplier'
import { MiraPageHeader } from '@/components/mira/MiraPageHeader'
import { MiraTable, MiraTr, MiraTd } from '@/components/mira/MiraTable'
import { EmptyState } from '@/components/shared/EmptyState'
import { miraBtn } from '@/lib/miraButtons'

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
}

export default async function AdminSuppliersPage() {
  const suppliers = await listSuppliers()

  return (
    <div className="w-full space-y-6 p-4 md:p-6 xl:p-8">
      <MiraPageHeader
        icon={Truck}
        title="Proveedores"
        subtitle="Catálogo de proveedores de la plataforma"
        actions={
          <Link href="/admin/proveedores/nuevo" className={miraBtn.primary}>
            <Plus size={14} /> Nuevo proveedor
          </Link>
        }
      />

      {suppliers.length === 0 ? (
        <div className="mira-card rounded-2xl">
          <EmptyState
            icon={Truck}
            title="Aún no hay proveedores"
            description="Registra el primer proveedor del catálogo."
            action={{ label: 'Crear proveedor', href: '/admin/proveedores/nuevo' }}
          />
        </div>
      ) : (
        <MiraTable
          headers={['Nombre', 'Categoría', 'País / Ciudad', 'Contacto', 'Alta', 'Estado', { label: '', align: 'right' }]}
        >
          {suppliers.map((s) => (
            <MiraTr key={s.id}>
              <MiraTd>
                <Link href={`/admin/proveedores/${s.id}`} className="font-bold text-mira-ink hover:text-mira-magenta">
                  {s.name}
                </Link>
                {s.tax_id && <p className="text-xs text-slate-400">{s.tax_id}</p>}
              </MiraTd>
              <MiraTd className="text-slate-600">{s.category || '—'}</MiraTd>
              <MiraTd className="text-slate-600">{[s.city, s.country].filter(Boolean).join(', ') || '—'}</MiraTd>
              <MiraTd className="text-slate-600">
                <div>{s.email || '—'}</div>
                {s.phone && <div className="text-xs text-slate-400">{s.phone}</div>}
              </MiraTd>
              <MiraTd className="text-slate-500">{formatDate(s.created_at)}</MiraTd>
              <MiraTd><ToggleActiveSupplier id={s.id} isActive={s.is_active} /></MiraTd>
              <MiraTd align="right">
                <Link href={`/admin/proveedores/${s.id}`} className="whitespace-nowrap text-xs font-bold text-mira-magenta hover:underline">
                  Ver →
                </Link>
              </MiraTd>
            </MiraTr>
          ))}
        </MiraTable>
      )}
    </div>
  )
}

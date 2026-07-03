import Link from 'next/link'
import { ArrowLeft, ListTree } from 'lucide-react'
import { getSupplierTaxonomyTree } from '@/lib/actions/supplier-taxonomy'
import { SupplierTaxonomyManager } from '@/components/admin/suppliers/SupplierTaxonomyManager'
import { MiraPageHeader } from '@/components/mira/MiraPageHeader'

export const dynamic = 'force-dynamic'

export default async function SupplierTaxonomyPage() {
  const tree = await getSupplierTaxonomyTree()

  return (
    <div className="w-full max-w-4xl space-y-6 p-4 md:p-6 xl:p-8">
      <div>
        <Link href="/admin/proveedores" className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-mira-magenta">
          <ArrowLeft size={14} />
          Volver a proveedores
        </Link>
        <MiraPageHeader
          icon={ListTree}
          title="Taxonomía de proveedores"
          subtitle="Mercado → Categoría → Familia → Subfamilia — clasificación propia, independiente de Pricing"
        />
      </div>

      <SupplierTaxonomyManager tree={tree} />
    </div>
  )
}

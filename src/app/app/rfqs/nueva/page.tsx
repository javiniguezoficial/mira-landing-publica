import { listActiveProducts, createDraftRfq } from '@/lib/actions/rfqs'
import { RfqForm } from '@/components/app/rfqs/RfqForm'
import { ArrowLeft } from 'lucide-react'
import Link from 'next/link'

export default async function NewRfqPage() {
  const products = await listActiveProducts()

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="mb-6">
        <Link
          href="/app/rfqs"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 mb-4"
        >
          <ArrowLeft size={14} />
          Volver a cotizaciones
        </Link>
        <h1 className="text-2xl font-heading font-bold text-slate-900">Nueva solicitud de cotización</h1>
        <p className="text-sm text-slate-500 mt-1">
          Se guardará como borrador. Puedes publicarla cuando esté lista.
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <RfqForm
          products={products}
          onSubmit={createDraftRfq}
          submitLabel="Guardar borrador"
          cancelHref="/app/rfqs"
        />
      </div>
    </div>
  )
}

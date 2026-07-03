import { createDraftRfq } from '@/lib/actions/rfqs'
import { RfqForm } from '@/components/app/rfqs/RfqForm'
import { MiraFormCard } from '@/components/mira/MiraFormCard'
import { ArrowLeft, FileText } from 'lucide-react'
import Link from 'next/link'

export default function NewRfqPage() {
  return (
    <div className="w-full max-w-2xl space-y-6 p-4 md:p-6 xl:p-8">
      <div>
        <Link href="/app/rfqs" className="mb-4 inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 transition-colors hover:text-mira-magenta">
          <ArrowLeft size={14} /> Volver a cotizaciones
        </Link>
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-mira-magenta to-mira-magenta-deep shadow-lg shadow-mira-magenta/30">
            <FileText size={22} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight text-mira-ink md:text-2xl">Nueva solicitud de cotización</h1>
            <p className="mt-0.5 text-sm text-slate-500">Se guardará como borrador. Puedes publicarla cuando esté lista.</p>
          </div>
        </div>
      </div>

      <MiraFormCard>
        <RfqForm onSubmit={createDraftRfq} submitLabel="Guardar borrador" cancelHref="/app/rfqs" />
      </MiraFormCard>
    </div>
  )
}

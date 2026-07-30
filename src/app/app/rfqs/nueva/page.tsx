import { redirect } from 'next/navigation'
import { createDraftRfq } from '@/lib/actions/rfqs'
import { getRfqAccess } from '@/lib/queries/rfq-capability'
import { RfqForm } from '@/components/app/rfqs/RfqForm'
import { MiraFormCard } from '@/components/mira/MiraFormCard'
import { MiraPageHeader } from '@/components/mira/MiraPageHeader'
import { ModuleDisabledNotice } from '@/components/shared/ModuleDisabledNotice'
import { ArrowLeft, FileText } from 'lucide-react'
import Link from 'next/link'

export default async function NewRfqPage() {
  // Ocultar el botón no basta: esta URL se puede escribir a mano. La comprobación
  // ocurre ANTES de devolver nada, así que el formulario no llega a renderizarse
  // ni parcialmente.
  const { canRead, canCreate, moduleEnabled } = await getRfqAccess()

  // 1.4 — con el módulo apagado NO se redirige: se explica. Mandar al Dashboard
  // a quien escribe esta URL es exactamente la redirección confusa que hay que
  // evitar; la persona se quedaría sin saber qué ha pasado ni a quién preguntar.
  if (!moduleEnabled) {
    return (
      <div className="w-full max-w-2xl space-y-6 p-4 md:p-6 xl:p-8">
        <MiraPageHeader
          icon={FileText}
          title="Nueva cotización"
          subtitle="Módulo no disponible para tu organización"
        />
        <ModuleDisabledNotice module="quotes" />
      </div>
    )
  }

  // Sin capacidad pero con lectura, el destino natural es el histórico. Sin
  // acceso siquiera a la organización —pertenencia u organización suspendida—,
  // `/app/rfqs` sería otra pantalla vacía: se sale al panel.
  if (!canCreate) redirect(canRead ? '/app/rfqs' : '/app/dashboard')

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

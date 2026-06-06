import { HelpCircle, Mail, MessageSquarePlus, ChevronDown, Clock, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SupportForm } from '@/components/app/support/SupportForm'
import { getMyTickets } from '@/lib/queries/support'
import { MiraPageHeader } from '@/components/mira/MiraPageHeader'
import { MiraSectionCard } from '@/components/mira/MiraSectionCard'
import { MiraStatusBadge } from '@/components/mira/MiraStatusBadge'

export const dynamic = 'force-dynamic'

const CATEGORY_LABELS: Record<string, string> = {
  account: 'Cuenta', data: 'Datos', prices: 'Precios',
  rfq: 'Cotizaciones', suppliers: 'Proveedores', billing: 'Facturación', other: 'Otro',
}

const FAQ = [
  { q: '¿Cómo puedo invitar a un compañero a mi organización?', a: 'Actualmente el alta de nuevos miembros se gestiona a través del equipo de soporte. Estamos desarrollando el flujo de invitaciones propio.' },
  { q: '¿Cómo se actualizan los precios de mercado?', a: 'Los precios se actualizan periódicamente por el equipo de MIRA a partir de fuentes oficiales y de mercado. Puedes consultar el histórico en la sección de Market Intelligence.' },
  { q: '¿Qué es una RFQ?', a: 'Una RFQ (Request for Quotation) es una solicitud de cotización que envías a proveedores para que te hagan una oferta. Puedes crearlas desde la sección "Cotizaciones".' },
  { q: '¿Puedo cambiar mi plan desde la plataforma?', a: 'Los cambios de plan se gestionan actualmente a través del equipo de soporte. Envía una solicitud y te contactaremos.' },
  { q: '¿Cómo cambio mi contraseña?', a: 'Ve a Configuración → Seguridad y pulsa "Enviar email de cambio de contraseña". Recibirás un enlace en tu correo.' },
]

export default async function AyudaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: settings } = await supabase
    .from('platform_settings')
    .select('support_email')
    .limit(1)
    .maybeSingle()

  const supportEmail = settings?.support_email ?? null
  const myTickets = await getMyTickets()

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6 p-4 md:p-6 xl:p-8">
      <MiraPageHeader icon={HelpCircle} title="Ayuda y soporte" subtitle="Encuentra respuestas o envíanos una solicitud." />

      {/* FAQ */}
      <MiraSectionCard title="Preguntas frecuentes" icon={HelpCircle}>
        <div className="divide-y divide-mira-line">
          {FAQ.map((item, i) => (
            <details key={i} className="group cursor-pointer px-6 py-4">
              <summary className="flex list-none select-none items-center justify-between gap-3">
                <span className="text-sm font-semibold text-slate-800 transition-colors group-open:text-mira-magenta">{item.q}</span>
                <ChevronDown size={16} className="shrink-0 text-slate-400 transition-transform group-open:rotate-180" />
              </summary>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{item.a}</p>
            </details>
          ))}
        </div>
      </MiraSectionCard>

      {/* Contacto */}
      {supportEmail && (
        <div className="flex items-start gap-4 rounded-2xl border border-mira-magenta/20 bg-mira-magenta-soft/50 px-6 py-5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white">
            <Mail size={18} className="text-mira-magenta" />
          </div>
          <div>
            <p className="mb-0.5 text-sm font-bold text-mira-ink">¿Necesitas ayuda directa?</p>
            <p className="text-sm text-slate-600">
              Escríbenos a <a href={`mailto:${supportEmail}`} className="font-bold text-mira-magenta hover:underline">{supportEmail}</a> o usa el formulario de abajo.
            </p>
          </div>
        </div>
      )}

      {/* Formulario */}
      <MiraSectionCard title="Enviar solicitud de soporte" icon={MessageSquarePlus}>
        <div className="p-6">
          <SupportForm />
        </div>
      </MiraSectionCard>

      {/* Mis solicitudes */}
      <MiraSectionCard title="Mis solicitudes recientes" icon={Clock}>
        {myTickets.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
            <AlertCircle size={32} className="mb-3 text-slate-300" />
            <p className="text-sm font-bold text-slate-500">No tienes solicitudes todavía</p>
            <p className="mt-1 text-xs text-slate-400">Usa el formulario de arriba para enviar tu primera consulta.</p>
          </div>
        ) : (
          <div className="divide-y divide-mira-line">
            {myTickets.map(ticket => (
              <div key={ticket.id} className="flex items-start gap-4 px-6 py-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-mira-ink">{ticket.subject}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <MiraStatusBadge status={ticket.status} kind="ticket" />
                    <MiraStatusBadge status={ticket.priority} kind="priority" />
                    <span className="text-xs text-slate-400">{CATEGORY_LABELS[ticket.category] ?? ticket.category}</span>
                  </div>
                </div>
                <p className="mt-0.5 shrink-0 text-xs text-slate-400">
                  {new Date(ticket.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                </p>
              </div>
            ))}
          </div>
        )}
      </MiraSectionCard>
    </div>
  )
}

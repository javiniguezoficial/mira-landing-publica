import { HelpCircle, Mail, MessageSquarePlus, ChevronDown, Clock, Tag, AlertCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SupportForm } from '@/components/app/support/SupportForm'
import { getMyTickets } from '@/lib/queries/support'

export const dynamic = 'force-dynamic'

const CATEGORY_LABELS: Record<string, string> = {
  account: 'Cuenta', data: 'Datos', prices: 'Precios',
  rfq: 'Cotizaciones', suppliers: 'Proveedores', billing: 'Facturación', other: 'Otro',
}

const PRIORITY_LABELS: Record<string, string> = {
  low: 'Baja', normal: 'Normal', high: 'Alta',
}

const STATUS_STYLES: Record<string, string> = {
  open:        'bg-blue-50 text-blue-700 border-blue-200',
  in_progress: 'bg-amber-50 text-amber-700 border-amber-200',
  resolved:    'bg-emerald-50 text-emerald-700 border-emerald-200',
  closed:      'bg-slate-100 text-slate-500 border-slate-200',
}

const STATUS_LABELS: Record<string, string> = {
  open: 'Abierto', in_progress: 'En proceso', resolved: 'Resuelto', closed: 'Cerrado',
}

const PRIORITY_STYLES: Record<string, string> = {
  low:    'bg-slate-100 text-slate-500',
  normal: 'bg-blue-50 text-blue-600',
  high:   'bg-red-50 text-red-600',
}

const FAQ = [
  {
    q: '¿Cómo puedo invitar a un compañero a mi organización?',
    a: 'Actualmente el alta de nuevos miembros se gestiona a través del equipo de soporte. Estamos desarrollando el flujo de invitaciones propio.',
  },
  {
    q: '¿Cómo se actualizan los precios de mercado?',
    a: 'Los precios se actualizan periódicamente por el equipo de MIRA a partir de fuentes oficiales y de mercado. Puedes consultar el histórico en la sección de Market Intelligence.',
  },
  {
    q: '¿Qué es una RFQ?',
    a: 'Una RFQ (Request for Quotation) es una solicitud de cotización que envías a proveedores para que te hagan una oferta. Puedes crearlas desde la sección "Cotizaciones".',
  },
  {
    q: '¿Puedo cambiar mi plan desde la plataforma?',
    a: 'Los cambios de plan se gestionan actualmente a través del equipo de soporte. Envía una solicitud y te contactaremos.',
  },
  {
    q: '¿Cómo cambio mi contraseña?',
    a: 'Ve a Configuración → Seguridad y pulsa "Enviar email de cambio de contraseña". Recibirás un enlace en tu correo.',
  },
]

export default async function AyudaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Leer support_email de platform_settings
  const { data: settings } = await supabase
    .from('platform_settings')
    .select('support_email')
    .limit(1)
    .maybeSingle()

  const supportEmail = settings?.support_email ?? null

  // Mis solicitudes recientes
  const myTickets = await getMyTickets()

  return (
    <div className="p-8 max-w-4xl mx-auto">
      {/* Cabecera */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-lg bg-mira-primary/10 flex items-center justify-center">
          <HelpCircle size={20} className="text-mira-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-heading font-bold text-slate-900">Ayuda y soporte</h1>
          <p className="text-sm text-slate-500">Encuentra respuestas o envíanos una solicitud.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8">
        {/* ── Preguntas frecuentes ─────────────────────────────────────────── */}
        <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center gap-2.5 px-6 py-4 border-b border-slate-100">
            <HelpCircle size={16} className="text-slate-500" />
            <h2 className="text-base font-heading font-semibold text-slate-800">Preguntas frecuentes</h2>
          </div>
          <div className="divide-y divide-slate-100">
            {FAQ.map((item, i) => (
              <details key={i} className="group px-6 py-4 cursor-pointer">
                <summary className="flex items-center justify-between gap-3 list-none select-none">
                  <span className="text-sm font-semibold text-slate-800 group-open:text-mira-primary transition-colors">
                    {item.q}
                  </span>
                  <ChevronDown size={16} className="text-slate-400 shrink-0 group-open:rotate-180 transition-transform" />
                </summary>
                <p className="mt-2 text-sm text-slate-600 leading-relaxed">{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* ── Información de contacto ──────────────────────────────────────── */}
        {supportEmail && (
          <section className="bg-mira-primary/5 border border-mira-primary/20 rounded-xl px-6 py-5 flex items-start gap-4">
            <div className="w-9 h-9 rounded-lg bg-mira-primary/10 flex items-center justify-center shrink-0">
              <Mail size={18} className="text-mira-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800 mb-0.5">¿Necesitas ayuda directa?</p>
              <p className="text-sm text-slate-600">
                Escríbenos a{' '}
                <a href={`mailto:${supportEmail}`} className="text-mira-primary font-semibold hover:underline">
                  {supportEmail}
                </a>{' '}
                o usa el formulario de abajo.
              </p>
            </div>
          </section>
        )}

        {/* ── Formulario de soporte ────────────────────────────────────────── */}
        <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center gap-2.5 px-6 py-4 border-b border-slate-100">
            <MessageSquarePlus size={16} className="text-slate-500" />
            <h2 className="text-base font-heading font-semibold text-slate-800">Enviar solicitud de soporte</h2>
          </div>
          <div className="p-6">
            <SupportForm />
          </div>
        </section>

        {/* ── Mis solicitudes recientes ────────────────────────────────────── */}
        <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="flex items-center gap-2.5 px-6 py-4 border-b border-slate-100">
            <Clock size={16} className="text-slate-500" />
            <h2 className="text-base font-heading font-semibold text-slate-800">Mis solicitudes recientes</h2>
          </div>

          {myTickets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
              <AlertCircle size={32} className="text-slate-300 mb-3" />
              <p className="text-sm font-semibold text-slate-500">No tienes solicitudes todavía</p>
              <p className="text-xs text-slate-400 mt-1">Usa el formulario de arriba para enviar tu primera consulta.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {myTickets.map(ticket => (
                <div key={ticket.id} className="px-6 py-4 flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{ticket.subject}</p>
                    <div className="flex items-center flex-wrap gap-2 mt-1.5">
                      <span className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded border ${STATUS_STYLES[ticket.status] ?? 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                        {STATUS_LABELS[ticket.status] ?? ticket.status}
                      </span>
                      <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded ${PRIORITY_STYLES[ticket.priority] ?? ''}`}>
                        <Tag size={10} />
                        {PRIORITY_LABELS[ticket.priority] ?? ticket.priority}
                      </span>
                      <span className="text-xs text-slate-400">
                        {CATEGORY_LABELS[ticket.category] ?? ticket.category}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-slate-400 shrink-0 mt-0.5">
                    {new Date(ticket.created_at).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

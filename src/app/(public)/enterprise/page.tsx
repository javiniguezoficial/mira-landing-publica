'use client'
import { Mail, Phone, User } from 'lucide-react'
import { motion } from 'framer-motion'
import { Navbar } from '@/components/landing/Navbar'
import { Footer } from '@/components/landing/Footer'
import { DataAnchor } from '@/components/landing/DataAnchor'

const WhatsAppIcon = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
  </svg>
)

export default function EnterprisePage() {
  return (
    <div className="min-h-screen bg-white font-sans text-slate-900 selection:bg-mira-primary/20 selection:text-mira-primary flex flex-col">
      <Navbar />
      <main className="flex-1 pt-32 pb-24 md:pt-40 md:pb-32 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full bg-agri-pattern opacity-30 pointer-events-none" />
        <div className="absolute -top-40 -right-40 w-[600px] h-[600px] bg-mira-primary/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-40 -left-40 w-[600px] h-[600px] bg-mira-cyan/5 rounded-full blur-3xl pointer-events-none" />

        <div className="container mx-auto px-4 md:px-6 relative z-10">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-heading font-bold text-slate-900 tracking-tight mb-6">
              Habla con nuestro equipo
            </h1>
            <p className="text-lg md:text-xl font-body text-slate-600 leading-relaxed mb-6">
              Descubre cómo MIRA puede ayudarte a optimizar tus decisiones de compra con inteligencia
              de mercado avanzada.
            </p>
            <p className="text-base text-slate-500 font-body max-w-2xl mx-auto">
              Nuestro equipo te ayudará a entender cómo implementar MIRA en tu organización, conectar
              tus fuentes de datos y aprovechar nuestras predicciones de mercado.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-20 items-start max-w-6xl mx-auto">
            {/* Contact Card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="lg:col-span-7 bg-white p-8 md:p-10 rounded-3xl border border-slate-200 shadow-2xl shadow-slate-200/50 flex flex-col justify-center"
            >
              <div className="space-y-8">
                <div className="text-center md:text-left mb-8">
                  <h3 className="text-2xl font-heading font-bold text-slate-900 mb-3">
                    Contacto directo
                  </h3>
                  <p className="text-slate-600 font-body text-sm">
                    Nuestro equipo te responderá lo antes posible para ayudarte con tu caso.
                  </p>
                </div>
                <div className="space-y-4">
                  <a
                    href="https://wa.me/34634317421"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-3 w-full bg-[#25D366] hover:bg-[#128C7E] text-white font-bold py-4 px-6 rounded-xl shadow-lg shadow-green-200 transition-all duration-300 hover:-translate-y-1"
                  >
                    <WhatsAppIcon />
                    Hablar por WhatsApp
                  </a>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4">
                    <a
                      href="mailto:clientes@mirapricing.com"
                      className="flex flex-col items-center justify-center gap-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 p-6 rounded-xl transition-colors group"
                    >
                      <div className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center text-mira-primary group-hover:scale-110 transition-transform">
                        <Mail size={20} />
                      </div>
                      <span className="text-sm font-bold text-slate-700">clientes@mirapricing.com</span>
                    </a>
                    <a
                      href="tel:+34634317421"
                      className="flex flex-col items-center justify-center gap-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 p-6 rounded-xl transition-colors group"
                    >
                      <div className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center text-mira-primary group-hover:scale-110 transition-transform">
                        <Phone size={20} />
                      </div>
                      <span className="text-sm font-bold text-slate-700">+34 634 317 421</span>
                    </a>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Value Props */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 }}
              className="lg:col-span-5 flex flex-col justify-center"
            >
              <div className="space-y-8">
                {[
                  {
                    icon: (
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="16 18 22 12 16 6" />
                        <polyline points="8 6 2 12 8 18" />
                      </svg>
                    ),
                    title: 'API Access',
                    desc: 'Integra MIRA directamente con tus sistemas internos (ERP, BI) para automatizar flujos de trabajo.',
                  },
                  {
                    icon: <User size={24} />,
                    title: 'Multi-usuario',
                    desc: 'Gestiona equipos de compras y analistas desde una sola plataforma con roles y permisos personalizados.',
                  },
                  {
                    icon: (
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                      </svg>
                    ),
                    title: 'Account manager dedicado',
                    desc: 'Soporte estratégico para grandes organizaciones, formación continua y análisis a medida.',
                  },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-5">
                    <div className="w-12 h-12 rounded-2xl bg-mira-primary/10 flex items-center justify-center text-mira-primary shrink-0">
                      {item.icon}
                    </div>
                    <div>
                      <h3 className="text-lg font-heading font-bold text-slate-900 mb-2">
                        {item.title}
                      </h3>
                      <p className="text-base text-slate-600 leading-relaxed">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </div>
        </div>
      </main>
      <Footer />
      <DataAnchor isFloating={true} />
    </div>
  )
}

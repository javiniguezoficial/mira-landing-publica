import { Navbar } from '@/components/landing/Navbar'
import { Footer } from '@/components/landing/Footer'
import { DataAnchor } from '@/components/landing/DataAnchor'
import { Button } from '@/components/landing/Button'

export const metadata = { title: 'Sobre nosotros — Mira Pricing' }

export default function SobreNosotros() {
  return (
    <div className="min-h-screen bg-white font-sans text-slate-900 selection:bg-mira-primary/20 selection:text-mira-primary flex flex-col">
      <Navbar />
      <main className="flex-1 pt-32 pb-24 md:pt-40 md:pb-32 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-full bg-agri-pattern opacity-30 pointer-events-none" />
        <div className="absolute -top-40 -right-40 w-[600px] h-[600px] bg-mira-primary/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-40 -left-40 w-[600px] h-[600px] bg-mira-cyan/5 rounded-full blur-3xl pointer-events-none" />
        <div className="container mx-auto px-4 md:px-6 relative z-10">
          <div className="max-w-4xl mx-auto">
            <div className="text-center mb-20">
              <h1 className="text-5xl md:text-6xl font-heading font-bold text-slate-900 tracking-tight mb-6">
                Sobre MIRA
              </h1>
              <p className="text-xl md:text-2xl text-slate-600 font-body mb-8">
                Inteligencia de mercado para tomar mejores decisiones.
              </p>
              <p className="text-lg text-slate-600 font-body max-w-2xl mx-auto leading-relaxed">
                MIRA es una plataforma de inteligencia de mercado diseñada para ayudar a empresas a
                analizar precios, tendencias y datos de mercado en sectores agrícolas, ganaderos e
                industriales.
              </p>
            </div>

            <div className="space-y-16">
              <section className="bg-white p-8 md:p-12 rounded-3xl border border-slate-200 shadow-xl shadow-slate-200/50">
                <h2 className="text-3xl font-heading font-bold text-slate-900 mb-6">
                  Una plataforma creada para entender los mercados
                </h2>
                <p className="text-lg text-slate-600 leading-relaxed mb-6">
                  MIRA centraliza datos de mercado, precios, tendencias históricas y predicciones
                  mediante inteligencia artificial para ayudar a empresas a tomar decisiones
                  estratégicas basadas en datos.
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
                  {[
                    { label: 'Datos', sub: 'Oficiales' },
                    { label: 'Análisis', sub: 'De mercado' },
                    { label: 'Tecnología', sub: 'Avanzada' },
                    { label: 'Modelos', sub: 'Predictivos' },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="bg-slate-50 p-4 rounded-xl text-center border border-slate-100"
                    >
                      <span className="block font-bold text-slate-900 mb-1">{item.label}</span>
                      <span className="text-sm text-slate-500">{item.sub}</span>
                    </div>
                  ))}
                </div>
              </section>

              <section className="bg-slate-50 p-8 md:p-12 rounded-3xl border border-slate-200">
                <h2 className="text-3xl font-heading font-bold text-slate-900 mb-6">
                  El problema de la falta de información clara en los mercados
                </h2>
                <p className="text-lg text-slate-600 leading-relaxed mb-4">
                  Muchas empresas toman decisiones con información fragmentada, retrasada o poco
                  fiable.
                </p>
                <p className="text-lg text-slate-600 leading-relaxed font-medium">
                  MIRA nace para resolver ese problema ofreciendo una plataforma clara, visual y
                  basada en datos.
                </p>
              </section>

              <section className="bg-white p-8 md:p-12 rounded-3xl border border-slate-200 shadow-xl shadow-slate-200/50">
                <h2 className="text-3xl font-heading font-bold text-slate-900 mb-6">
                  Qué puedes hacer con MIRA
                </h2>
                <ul className="space-y-4">
                  {[
                    'Analizar precios de mercados.',
                    'Consultar tendencias históricas.',
                    'Recibir alertas de mercado.',
                    'Obtener predicciones basadas en inteligencia artificial.',
                    'Acceder a insights y análisis del sector.',
                  ].map((item, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full bg-mira-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <div className="w-2 h-2 rounded-full bg-mira-primary" />
                      </div>
                      <span className="text-lg text-slate-600">{item}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="bg-slate-900 text-white p-8 md:p-12 rounded-3xl relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-mira-primary/20 rounded-full blur-3xl" />
                <div className="relative z-10">
                  <h2 className="text-3xl font-heading font-bold mb-6">Nuestra visión</h2>
                  <p className="text-lg text-slate-300 leading-relaxed mb-6">
                    El objetivo de la plataforma es convertirse en una referencia en inteligencia de
                    mercado para sectores clave de la economía.
                  </p>
                  <p className="text-xl font-medium text-mira-primary">
                    Innovación, tecnología y datos.
                  </p>
                </div>
              </section>

              <section className="text-center pt-8">
                <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
                  <Button size="lg" className="w-full sm:w-auto text-base px-8" href="/registro">
                    Empezar prueba gratuita
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    className="w-full sm:w-auto text-base px-8"
                    href="/enterprise"
                  >
                    Contactar con ventas
                  </Button>
                </div>
              </section>
            </div>
          </div>
        </div>
      </main>
      <Footer />
      <DataAnchor isFloating={true} />
    </div>
  )
}

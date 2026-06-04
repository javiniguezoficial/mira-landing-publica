'use client'
import { Button } from './Button'

const WhatsAppIcon = () => (
  <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
  </svg>
)

export const FAQContact = () => {
  const faqs = [
    {
      q: '¿Qué fuentes de datos utilizáis?',
      a: 'Agregamos datos de fuentes oficiales públicas (Eurostat, Ministerios), mercados de referencia (Poolred, Mercolleida) y lonjas locales.',
    },
    {
      q: '¿Puedo probar la plataforma antes de pagar?',
      a: 'Sí, ofrecemos una prueba gratuita de 14 días con acceso completo al plan Business.',
    },
    {
      q: '¿La predicción de IA está garantizada?',
      a: 'Nuestros modelos ofrecen un intervalo de confianza del 85%, basado en datos históricos y variables macroeconómicas.',
    },
  ]

  return (
    <section className="py-32 bg-white">
      <div className="container mx-auto px-4 md:px-6 max-w-4xl">
        <div className="text-center mb-20">
          <h2 className="text-4xl font-heading font-bold text-slate-900 mb-6">
            ¿Tienes dudas sobre la cobertura?
          </h2>
          <p className="text-xl text-slate-600 font-body">
            Resolvemos las preguntas más frecuentes.
          </p>
        </div>

        <div className="space-y-6 mb-20">
          {faqs.map((faq, i) => (
            <div
              key={i}
              className="border border-slate-200 rounded-2xl p-8 hover:border-mira-primary/30 hover:shadow-lg transition-all duration-300 bg-slate-50/50"
            >
              <h4 className="font-heading font-bold text-slate-900 mb-3 text-lg">{faq.q}</h4>
              <p className="text-slate-600 font-body leading-relaxed">{faq.a}</p>
            </div>
          ))}
        </div>

        <div
          id="contacto"
          className="bg-gradient-to-br from-slate-50 to-indigo-50/50 rounded-3xl p-10 md:p-16 text-center border border-slate-100 shadow-inner"
        >
          <h3 className="text-3xl font-heading font-bold text-slate-900 mb-6">
            ¿Prefieres hablar con un humano?
          </h3>
          <p className="text-slate-600 font-body mb-10 text-lg max-w-xl mx-auto">
            Nuestro equipo de soporte está disponible para resolver tus dudas específicas.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
            <Button
              className="bg-[#25D366] hover:bg-[#128C7E] text-white gap-3 w-full sm:w-auto px-8 py-4 shadow-lg shadow-green-200"
              onClick={() => window.open('https://wa.me/34634317421', '_blank')}
            >
              <WhatsAppIcon />
              Escríbenos por WhatsApp
            </Button>
            <Button variant="outline" className="w-full sm:w-auto px-8 py-4" href="/enterprise">
              Contactar con ventas
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}

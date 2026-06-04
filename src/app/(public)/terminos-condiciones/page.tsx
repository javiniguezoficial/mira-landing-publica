import { LegalLayout } from '@/components/landing/LegalLayout'

export const metadata = { title: 'Términos y Condiciones — Mira Pricing' }

export default function TerminosCondiciones() {
  return (
    <LegalLayout title="Términos y Condiciones">
      <p className="text-lg leading-relaxed">
        Los presentes términos y condiciones regulan el acceso y uso de la plataforma MIRA, así como
        la relación entre el usuario y el titular del sitio web.
      </p>
      <section>
        <h2 className="text-2xl font-heading font-bold text-slate-900 mb-4">Objeto</h2>
        <p className="leading-relaxed">
          El presente documento establece las condiciones que regulan el acceso, navegación y uso de
          la plataforma MIRA, propiedad de Food Market Solutions SLU.
        </p>
      </section>
      <section>
        <h2 className="text-2xl font-heading font-bold text-slate-900 mb-4">Descripción del servicio</h2>
        <p className="leading-relaxed">
          La plataforma MIRA proporciona herramientas de inteligencia de mercado orientadas al
          análisis de precios, tendencias, datos históricos y predicciones en distintos sectores como
          el agrícola, ganadero e industrial.
        </p>
        <p className="leading-relaxed mt-4">
          Algunas funcionalidades pueden requerir la creación de una cuenta o la contratación de un
          plan de suscripción.
        </p>
      </section>
      <section>
        <h2 className="text-2xl font-heading font-bold text-slate-900 mb-4">Planes y suscripciones</h2>
        <p className="leading-relaxed">
          La plataforma puede ofrecer diferentes planes de acceso con distintas funcionalidades. Las
          condiciones económicas y características de cada plan se mostrarán en la página de precios
          del sitio web.
        </p>
      </section>
      <section>
        <h2 className="text-2xl font-heading font-bold text-slate-900 mb-4">Limitación de responsabilidad</h2>
        <p className="leading-relaxed">
          Food Market Solutions SLU no garantiza la ausencia absoluta de errores en los datos
          mostrados en la plataforma ni se responsabiliza de decisiones empresariales tomadas en base
          a la información proporcionada. La información tiene carácter informativo y de apoyo a la
          toma de decisiones.
        </p>
      </section>
      <section>
        <h2 className="text-2xl font-heading font-bold text-slate-900 mb-4">Legislación aplicable</h2>
        <p className="leading-relaxed">
          La relación entre el usuario y Food Market Solutions SLU se regirá por la legislación
          española y cualquier conflicto será sometido a los juzgados y tribunales correspondientes.
        </p>
      </section>
    </LegalLayout>
  )
}

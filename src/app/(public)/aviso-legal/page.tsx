import { LegalLayout } from '@/components/landing/LegalLayout'

export const metadata = { title: 'Aviso Legal — Mira Pricing' }

export default function AvisoLegal() {
  return (
    <LegalLayout title="Aviso Legal">
      <p className="text-lg leading-relaxed">
        El presente aviso legal regula el uso del sitio web y establece las condiciones de acceso y
        utilización del mismo.
      </p>
      <section>
        <h2 className="text-2xl font-heading font-bold text-slate-900 mb-4">
          Identificación del titular del sitio web
        </h2>
        <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
          <ul className="space-y-2">
            <li><strong>Empresa:</strong> Food Market Solutions SLU</li>
            <li><strong>CIF / VAT:</strong> B75740282</li>
            <li><strong>Dirección:</strong> Calle Guadaira nº 23, 41410 Carmona, Sevilla, España</li>
            <li><strong>Email:</strong> <a href="mailto:jrzjob@gmail.com" className="text-mira-primary hover:underline">jrzjob@gmail.com</a></li>
            <li><strong>Teléfono:</strong> +34 674473201</li>
          </ul>
        </div>
      </section>
      <section>
        <h2 className="text-2xl font-heading font-bold text-slate-900 mb-4">Objeto del sitio web</h2>
        <p className="leading-relaxed">
          La web ofrece una plataforma de inteligencia de mercado orientada al análisis de precios,
          tendencias y datos para sectores agrícolas, ganaderos e industriales.
        </p>
      </section>
      <section>
        <h2 className="text-2xl font-heading font-bold text-slate-900 mb-4">Condiciones de uso</h2>
        <p className="leading-relaxed">
          El acceso al sitio implica la aceptación de las condiciones de uso y el usuario se
          compromete a utilizar la web de forma lícita, respetando la legislación vigente y los
          derechos de terceros.
        </p>
      </section>
      <section>
        <h2 className="text-2xl font-heading font-bold text-slate-900 mb-4">Propiedad intelectual</h2>
        <p className="leading-relaxed">
          Todos los contenidos del sitio (textos, diseño, marca, gráficos, software, etc.) son
          propiedad del titular o se utilizan con licencia y están protegidos por la legislación
          vigente en materia de propiedad intelectual e industrial.
        </p>
      </section>
      <section>
        <h2 className="text-2xl font-heading font-bold text-slate-900 mb-4">Responsabilidad</h2>
        <p className="leading-relaxed">
          La empresa no se responsabiliza de posibles errores en los contenidos ni del uso indebido
          del sitio por parte de los usuarios. El titular se reserva el derecho a modificar, suspender
          o cancelar el servicio sin previo aviso.
        </p>
      </section>
      <section>
        <h2 className="text-2xl font-heading font-bold text-slate-900 mb-4">Legislación aplicable</h2>
        <p className="leading-relaxed">
          La relación entre el usuario y el titular del sitio se regirá por la legislación española y
          cualquier controversia o conflicto se someterá a los juzgados y tribunales correspondientes.
        </p>
      </section>
    </LegalLayout>
  )
}

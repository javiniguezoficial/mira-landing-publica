import { LegalLayout } from '@/components/landing/LegalLayout'

export const metadata = { title: 'Política de Privacidad — Mira Pricing' }

export default function PoliticaPrivacidad() {
  return (
    <LegalLayout title="Política de Privacidad">
      <p className="text-lg leading-relaxed">
        La presente Política de Privacidad describe cómo Food Market Solutions SLU recopila, utiliza
        y protege los datos personales de los usuarios que acceden o utilizan la plataforma MIRA.
      </p>
      <section>
        <h2 className="text-2xl font-heading font-bold text-slate-900 mb-4">
          Responsable del tratamiento de los datos
        </h2>
        <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
          <ul className="space-y-2">
            <li><strong>Empresa:</strong> Food Market Solutions SLU</li>
            <li><strong>CIF:</strong> B75740282</li>
            <li><strong>Dirección:</strong> Calle Guadaira nº 23, 41410 Carmona, Sevilla, España</li>
            <li><strong>Email:</strong> <a href="mailto:jrzjob@gmail.com" className="text-mira-primary hover:underline">jrzjob@gmail.com</a></li>
          </ul>
        </div>
      </section>
      <section>
        <h2 className="text-2xl font-heading font-bold text-slate-900 mb-4">Datos personales que se recogen</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li>Datos de identificación como nombre o empresa.</li>
          <li>Datos de contacto como correo electrónico o teléfono.</li>
          <li>Datos de navegación y uso del sitio web.</li>
          <li>Información proporcionada voluntariamente a través de formularios o registro en la plataforma.</li>
        </ul>
      </section>
      <section>
        <h2 className="text-2xl font-heading font-bold text-slate-900 mb-4">Derechos de los usuarios</h2>
        <ul className="list-disc pl-5 space-y-2 mb-4">
          <li>Acceder a sus datos personales.</li>
          <li>Solicitar la rectificación de datos inexactos.</li>
          <li>Solicitar la supresión de sus datos cuando ya no sean necesarios.</li>
          <li>Solicitar la limitación del tratamiento.</li>
          <li>Oponerse al tratamiento de sus datos.</li>
          <li>Solicitar la portabilidad de sus datos.</li>
        </ul>
        <p className="leading-relaxed">
          Para ejercer estos derechos el usuario puede contactar a través del correo electrónico
          indicado.
        </p>
      </section>
      <section>
        <h2 className="text-2xl font-heading font-bold text-slate-900 mb-4">Cambios en la política</h2>
        <p className="leading-relaxed font-medium">
          Food Market Solutions SLU se reserva el derecho de modificar la presente Política de
          Privacidad. Se recomienda revisar esta página periódicamente.
        </p>
      </section>
    </LegalLayout>
  )
}

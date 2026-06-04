import { LegalLayout } from '@/components/landing/LegalLayout'

export const metadata = { title: 'Política de Cookies — Mira Pricing' }

export default function PoliticaCookies() {
  return (
    <LegalLayout title="Política de Cookies">
      <p className="text-lg leading-relaxed">
        El sitio web utiliza cookies para mejorar la experiencia del usuario, analizar el uso de la
        web y ofrecer funcionalidades relacionadas con la plataforma.
      </p>
      <section>
        <h2 className="text-2xl font-heading font-bold text-slate-900 mb-4">¿Qué son las cookies?</h2>
        <p className="leading-relaxed">
          Las cookies son pequeños archivos de texto que se almacenan en el dispositivo del usuario
          cuando visita un sitio web y que permiten recordar información sobre la visita, como
          preferencias o comportamiento de navegación.
        </p>
      </section>
      <section>
        <h2 className="text-2xl font-heading font-bold text-slate-900 mb-4">Tipos de cookies utilizadas</h2>
        <ul className="list-disc pl-5 space-y-2">
          <li><strong>Cookies técnicas:</strong> necesarias para el funcionamiento del sitio web y la plataforma.</li>
          <li><strong>Cookies de análisis:</strong> para conocer cómo interactúan los usuarios con el sitio.</li>
          <li><strong>Cookies de personalización:</strong> para recordar preferencias del usuario.</li>
          <li><strong>Cookies de terceros:</strong> relacionadas con servicios de terceros integrados en la plataforma.</li>
        </ul>
      </section>
      <section>
        <h2 className="text-2xl font-heading font-bold text-slate-900 mb-4">Gestión de cookies</h2>
        <p className="leading-relaxed">
          El usuario puede configurar o rechazar el uso de cookies a través de las opciones de su
          navegador y también puede eliminar las cookies almacenadas en cualquier momento.
        </p>
      </section>
      <section>
        <h2 className="text-2xl font-heading font-bold text-slate-900 mb-4">Actualizaciones</h2>
        <p className="leading-relaxed font-medium">
          Food Market Solutions SLU se reserva el derecho de modificar la presente Política de
          Cookies. Se recomienda revisar esta política periódicamente.
        </p>
      </section>
    </LegalLayout>
  )
}

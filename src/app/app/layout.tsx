import { AppShell } from '@/components/app/AppShell'
import { getOrganizationModules } from '@/lib/queries/organization-modules'
import { getMyAnsweredTicketCount } from '@/lib/queries/support'

/**
 * Los módulos se resuelven AQUÍ, una sola vez por navegación, y bajan como prop
 * a la barra lateral (1.4). Es el único punto del área de cliente que los lee
 * para pintar navegación: las páginas usan sus propios guards, que trabajan
 * sobre el mismo contexto de autorización.
 *
 * El aviso de respuestas de soporte sigue exactamente el mismo patrón que el
 * badge de /admin: se calcula en SERVIDOR, una vez por navegación, y baja como
 * prop. La barra lateral no abre su propia consulta ni sondea en un intervalo.
 *
 * Las dos lecturas van en paralelo: la latencia es la de la más lenta, no la
 * suma. Ninguna depende de la otra.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [modules, answeredTickets] = await Promise.all([
    getOrganizationModules(),
    getMyAnsweredTicketCount(),
  ])

  return (
    <AppShell modules={modules} answeredTickets={answeredTickets}>
      {children}
    </AppShell>
  )
}

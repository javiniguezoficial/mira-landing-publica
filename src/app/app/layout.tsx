import { AppShell } from '@/components/app/AppShell'
import { getOrganizationModules } from '@/lib/queries/organization-modules'

/**
 * Los módulos se resuelven AQUÍ, una sola vez por navegación, y bajan como prop
 * a la barra lateral (1.4). Es el único punto del área de cliente que los lee
 * para pintar navegación: las páginas usan sus propios guards, que trabajan
 * sobre el mismo contexto de autorización.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const modules = await getOrganizationModules()

  return <AppShell modules={modules}>{children}</AppShell>
}

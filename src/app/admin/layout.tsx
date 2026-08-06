import { requirePlatformAdmin } from '@/lib/auth/guards'
import { getPendingTicketCount } from '@/lib/queries/support'
import { AdminShell } from '@/components/admin/AdminShell'

// Server Component: la comprobación ocurre en el servidor ANTES de renderizar
// nada. No se apoya en ocultar enlaces ni en lógica de cliente, que un usuario
// puede saltarse escribiendo la URL a mano.
//
// Es defensa en profundidad DELIBERADA, no una duplicación ociosa del
// middleware: si el middleware volviera a quedar inactivo —como ocurrió al
// estar el archivo fuera de `src/`—, ninguna página bajo /admin/* podría
// renderizarse para quien no sea platform_admin.
//
//   sin sesión                        → /login
//   usuario no administrador          → /app/dashboard
//   rol desconocido o perfil ausente  → /app/dashboard (fail-closed)
//   platform_admin                    → render normal
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requirePlatformAdmin('redirect-dashboard')

  // 039 — aviso de soporte. Se resuelve AQUÍ, una sola vez por navegación, y
  // baja como prop: la barra lateral no abre su propia consulta ni sondea en un
  // intervalo. Se lee después del guard, así que solo lo ejecuta quien ya es
  // administrador.
  const pendingTickets = await getPendingTicketCount()

  return <AdminShell pendingTickets={pendingTickets}>{children}</AdminShell>
}

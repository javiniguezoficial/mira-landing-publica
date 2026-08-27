import { UpdatePasswordPage } from '@/components/landing/UpdatePasswordPage'
import { normalizePasswordReason } from '@/lib/auth/invite-session'

export const metadata = {
  title: 'Nueva contraseña — Mira Pricing',
}

/**
 * `motivo` solo elige el TEXTO: «Crea tu contraseña» para una invitación,
 * «Nueva contraseña» para una recuperación. Se normaliza contra una lista
 * cerrada para que no se pueda inyectar texto en la pantalla, y no interviene
 * en ninguna decisión de autorización — eso lo hace la sesión.
 */
export default async function ActualizarPassword({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const motivo = normalizePasswordReason((await searchParams).motivo)
  return <UpdatePasswordPage reason={motivo} />
}

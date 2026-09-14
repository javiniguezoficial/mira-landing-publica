import { LoginPage } from '@/components/landing/LoginPage'
import { loginNoticeFor } from '@/lib/auth/signup-recovery'

export const metadata = {
  title: 'Iniciar sesión — Mira Pricing',
}

/**
 * Los parámetros solo eligen un AVISO de una lista cerrada (ver
 * `loginNoticeFor`): `?aviso=email-confirmado` cuando el callback de
 * confirmación murió por el flow state PKCE pero el correo sí quedó
 * confirmado, y `?error=auth` para el resto de enlaces fallidos — que hasta
 * este bloque llegaba en la URL y no pintaba nada.
 */
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  const params = await searchParams
  return <LoginPage notice={loginNoticeFor({ aviso: params.aviso, error: params.error })} />
}

import { AcceptInvitePage } from '@/components/landing/AcceptInvitePage'

export const metadata = {
  title: 'Aceptar invitación — MIRA Pricing',
}

/**
 * Aterrizaje del enlace «Aceptar invitación».
 *
 * Es una página, no un Route Handler, y ese es todo el arreglo: la sesión de
 * una invitación llega en el fragmento de la URL —`#access_token=…`— y el
 * fragmento no viaja al servidor. Solo el navegador puede leerlo.
 *
 * No lleva guard: quien llega aquí todavía NO tiene sesión, precisamente
 * porque el propósito de la pantalla es establecerla. El middleware tampoco la
 * intercepta: solo redirige en `/app` y `/admin`.
 */
export default function AceptarInvitacion() {
  return <AcceptInvitePage />
}

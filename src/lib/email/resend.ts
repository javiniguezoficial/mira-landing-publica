// Proveedor de correo: Resend (Bloque 2).
//
// ── Por qué por HTTP y no con el SDK ───────────────────────────────────────
//
// Porque la API de Resend para enviar un correo es UN `POST` con un JSON. El
// paquete `resend` añadiría una dependencia, entradas nuevas en el lockfile y
// una superficie que mantener, a cambio de ahorrar quince líneas. `fetch` es
// nativo en el runtime de Next 15, así que esto no instala nada.
//
// Cambiar de proveedor es escribir otro archivo como este e implementar
// `EmailProvider`. Ni Soporte ni las plantillas se enteran.
//
// ── Qué NUNCA sale de aquí ────────────────────────────────────────────────
//
// La clave. No se registra, no se devuelve en `detail` y no aparece en ningún
// mensaje de error. El `detail` lleva el código HTTP, que es lo que sirve para
// diagnosticar, y nada más.

import type {
  EmailAddress,
  EmailDeliveryResult,
  EmailMessage,
  EmailProvider,
} from './types'

const RESEND_ENDPOINT = 'https://api.resend.com/emails'

/** Corta un intento colgado. Un correo no puede retener una Server Action. */
const TIMEOUT_MS = 10_000

/** `MIRA <soporte@ejemplo.com>` o `soporte@ejemplo.com` */
export function formatAddress(address: EmailAddress): string {
  return address.name ? `${address.name} <${address.email}>` : address.email
}

export function createResendProvider(apiKey: string): EmailProvider {
  return {
    name: 'resend',

    async send(message: EmailMessage, from: EmailAddress): Promise<EmailDeliveryResult> {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

      try {
        const respuesta = await fetch(RESEND_ENDPOINT, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: formatAddress(from),
            to: [message.to],
            subject: message.subject,
            html: message.html,
            text: message.text,
          }),
          signal: controller.signal,
        })

        if (!respuesta.ok) {
          // El cuerpo del error puede repetir datos del mensaje; solo se
          // conserva el código, que es lo que distingue «clave inválida» (401)
          // de «dominio sin verificar» (403) o «límite alcanzado» (429).
          return {
            status: 'failed',
            tag: message.tag,
            detail: `resend respondió ${respuesta.status}`,
          }
        }

        return { status: 'sent', tag: message.tag, detail: 'aceptado por resend' }
      } catch (e) {
        const motivo =
          e instanceof Error && e.name === 'AbortError'
            ? `sin respuesta en ${TIMEOUT_MS} ms`
            : 'error de red'
        return { status: 'failed', tag: message.tag, detail: `resend: ${motivo}` }
      } finally {
        clearTimeout(timeout)
      }
    },
  }
}

// Proveedor de correo: SMTP corporativo (Bloque 2 · ajuste final).
//
// SOLO SERVIDOR. `nodemailer` abre sockets TCP: no existe en el navegador y no
// debe acabar en ningún bundle de cliente. Lo importa `send.ts`, que a su vez
// solo lo importan las Server Actions.
//
// ── Por qué SMTP y no una API HTTP ────────────────────────────────────────
//
// Porque MIRA ya tiene correo corporativo en cPanel bajo su propio dominio. Un
// proveedor externo obligaría a verificar el dominio otra vez, a mantener una
// clave más y a que los correos salieran de una infraestructura ajena. Con SMTP
// propio el remitente es una cuenta real del cliente, que además puede recibir
// respuestas.
//
// ── Qué NUNCA sale de aquí ────────────────────────────────────────────────
//
// La contraseña. No se registra, no se devuelve en `detail` y no aparece en
// ningún mensaje de error. `detail` lleva el CÓDIGO del fallo —que es lo que
// sirve para diagnosticar— y nada más.

import nodemailer, { type Transporter } from 'nodemailer'
import type { SmtpConfig } from './config'
import type {
  EmailAddress,
  EmailDeliveryResult,
  EmailMessage,
  EmailProvider,
} from './types'

/** Corta un intento colgado. Un correo no puede retener una Server Action. */
const TIMEOUT_MS = 10_000

/** `MIRA <soporte@ejemplo.com>` o `soporte@ejemplo.com` */
export function formatAddress(address: EmailAddress): string {
  return address.name ? `${address.name} <${address.email}>` : address.email
}

/**
 * Traduce un fallo de nodemailer a un motivo corto y SIN datos sensibles.
 *
 * Los códigos de nodemailer son los que de verdad distinguen un problema de
 * otro, y ninguno contiene credenciales:
 *
 *   EAUTH      usuario o contraseña incorrectos
 *   ECONNECTION / ESOCKET  no se llega al servidor, o TLS mal configurado
 *   ETIMEDOUT  el servidor no responde — típico de 465 con `secure=false`
 *   EENVELOPE  remitente o destinatario rechazados por el servidor
 *
 * El `message` de la excepción NO se propaga: algunos servidores devuelven la
 * línea de autenticación completa en el texto del error.
 */
export function describeSmtpError(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code: unknown }).code)
      : null

  switch (code) {
    case 'EAUTH':
      return 'smtp: autenticación rechazada (EAUTH)'
    case 'ECONNECTION':
      return 'smtp: no se pudo conectar (ECONNECTION)'
    case 'ESOCKET':
      return 'smtp: fallo de socket o TLS (ESOCKET)'
    case 'ETIMEDOUT':
      return 'smtp: sin respuesta del servidor (ETIMEDOUT)'
    case 'EENVELOPE':
      return 'smtp: remitente o destinatario rechazados (EENVELOPE)'
    default:
      return code ? `smtp: fallo ${code}` : 'smtp: fallo desconocido'
  }
}

/**
 * Transporte reutilizado entre envíos.
 *
 * nodemailer mantiene el socket abierto, así que crear uno por correo abriría
 * y cerraría una conexión TLS cada vez. Se cachea por configuración: si alguien
 * cambia las variables y redespliega, el proceso es nuevo y el caché también.
 *
 * La clave del caché NO incluye la contraseña: no hace falta para distinguir
 * configuraciones y no debe quedar en memoria más de lo imprescindible.
 */
let cache: { key: string; transporter: Transporter } | null = null

function transporterFor(smtp: SmtpConfig): Transporter {
  const key = `${smtp.host}:${smtp.port}:${smtp.secure}:${smtp.user}`
  if (cache && cache.key === key) return cache.transporter

  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: { user: smtp.user, pass: smtp.password },
    connectionTimeout: TIMEOUT_MS,
    greetingTimeout: TIMEOUT_MS,
    socketTimeout: TIMEOUT_MS,
  })

  cache = { key, transporter }
  return transporter
}

/** Solo para los tests: vacía el transporte cacheado. */
export function resetTransporterCache(): void {
  cache = null
}

export function createSmtpProvider(smtp: SmtpConfig): EmailProvider {
  return {
    name: 'smtp',

    async send(message: EmailMessage, from: EmailAddress): Promise<EmailDeliveryResult> {
      try {
        await transporterFor(smtp).sendMail({
          from: formatAddress(from),
          to: message.to,
          subject: message.subject,
          html: message.html,
          text: message.text,
        })

        return { status: 'sent', tag: message.tag, detail: 'aceptado por el servidor SMTP' }
      } catch (e) {
        return { status: 'failed', tag: message.tag, detail: describeSmtpError(e) }
      }
    },
  }
}

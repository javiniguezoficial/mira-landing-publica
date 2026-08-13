// Despacho de correo (Bloque 2).
//
// SOLO SERVIDOR, pero deliberadamente NO marcado con `'use server'`: eso
// convertiría cada export en una Server Action invocable desde el navegador, y
// enviar correo no es algo que el navegador deba poder pedir. Lo importan las
// acciones, que son quienes autorizan antes de llamar.
//
// ── La garantía que da este módulo ────────────────────────────────────────
//
// `deliver()` NUNCA LANZA. Pase lo que pase —falta configuración, el proveedor
// devuelve 500, la red se cae, el JSON es inválido— devuelve un
// `EmailDeliveryResult`. Esa es la propiedad que permite que una notificación
// falle sin llevarse por delante el ticket que la originó.

import { resolveEmailConfig, type EmailConfig } from './config'
import { createResendProvider } from './resend'
import type { EmailDeliveryResult, EmailMessage, EmailProvider } from './types'

/**
 * Punto único donde se lee el entorno real.
 *
 * Se aísla en una función para que los tests puedan resolver la configuración
 * con un entorno simulado sin tocar `process.env`.
 */
export function loadEmailConfig() {
  return resolveEmailConfig(process.env as Record<string, string | undefined>)
}

/**
 * Registro de un intento. Una línea por envío, siempre, incluso al omitirlo.
 *
 * Se registra la ETIQUETA y el destinatario, nunca el asunto ni el cuerpo: el
 * contenido de un ticket es información del cliente y no tiene por qué acabar
 * en los registros del servidor.
 */
function registrar(resultado: EmailDeliveryResult, destinatario: string) {
  const linea = `[email] ${resultado.tag} → ${destinatario}: ${resultado.status} (${resultado.detail})`
  if (resultado.status === 'failed') console.error(linea)
  else if (resultado.status === 'skipped') console.warn(linea)
  else console.info(linea)
}

export interface DeliverOptions {
  /** Proveedor alternativo. Lo usan los tests; en producción se omite. */
  provider?: EmailProvider
  /** Configuración ya resuelta, para no releer el entorno en cada envío. */
  config?: EmailConfig
}

/**
 * Intenta enviar un mensaje ya renderizado.
 *
 * Devuelve `skipped` —no `failed`— cuando falta configuración: en un entorno
 * sin credenciales de correo lo correcto es no enviar y dejar constancia de qué
 * variable falta, no simular una avería.
 */
export async function deliver(
  message: EmailMessage,
  options: DeliverOptions = {},
): Promise<EmailDeliveryResult> {
  try {
    let config = options.config
    if (!config) {
      const resuelta = loadEmailConfig()
      if (!resuelta.ok) {
        const resultado: EmailDeliveryResult = {
          status: 'skipped',
          tag: message.tag,
          detail: `sin configuración de correo: falta ${resuelta.missing.join(', ')}`,
          missing: resuelta.missing,
        }
        registrar(resultado, message.to)
        return resultado
      }
      config = resuelta.config
    }

    const provider = options.provider ?? createResendProvider(config.apiKey)
    const resultado = await provider.send(message, config.from)
    registrar(resultado, message.to)
    return resultado
  } catch (e) {
    // Red de seguridad final. Un proveedor bien escrito no lanza, pero este
    // módulo promete que NADIE que lo llame tiene que envolverlo en try/catch.
    const resultado: EmailDeliveryResult = {
      status: 'failed',
      tag: message.tag,
      detail: `excepción inesperada al enviar: ${e instanceof Error ? e.name : 'desconocida'}`,
    }
    registrar(resultado, message.to)
    return resultado
  }
}

// Contratos de la capa de email (Bloque 2).
//
// Módulo PURO y sin dependencias. Lo importan tanto el proveedor concreto como
// las plantillas y las notificaciones de dominio, de modo que ninguna de esas
// piezas tenga que conocer a las otras.
//
// ── Por qué una capa y no llamar al proveedor desde Soporte ────────────────
//
// Porque el proveedor cambia. Ya ha pasado una vez: la primera implementación
// usaba la API HTTP de Resend y se sustituyó por el SMTP corporativo de
// mirapricing.com sin tocar una sola línea de `actions/support.ts` ni de las
// plantillas — solo el archivo del proveedor y el resolutor de configuración.
// Esa es exactamente la propiedad que justifica la capa.

/** Una dirección con nombre opcional. `MIRA <soporte@ejemplo.com>` */
export interface EmailAddress {
  email: string
  name?: string
}

/** Un mensaje listo para enviar. Ya renderizado: aquí no se decide contenido. */
export interface EmailMessage {
  to: string
  subject: string
  html: string
  /**
   * Alternativa en texto plano. NO es opcional por gusto: un correo solo-HTML
   * puntúa peor en los filtros de spam y hay clientes que no lo muestran.
   */
  text: string
  /** Etiqueta interna para los registros. Nunca viaja al destinatario. */
  tag: EmailTag
}

/** Para qué es cada envío. Sirve para los registros y para las métricas. */
export type EmailTag =
  | 'support.ticket.created.user'
  | 'support.ticket.created.internal'
  | 'support.ticket.answered.user'

/**
 * Resultado de un intento de envío.
 *
 * ── Por qué tres estados y no un booleano ──────────────────────────────────
 *
 *   `sent`    — el proveedor lo aceptó.
 *   `skipped` — no había configuración. NO es un error: en un entorno sin
 *               credenciales de correo —el de desarrollo, y el de producción
 *               hasta que Javier configure las variables— lo correcto es no
 *               enviar y decirlo, no fingir un fallo.
 *   `failed`  — había configuración y el envío no salió.
 *
 * Distinguir `skipped` de `failed` es lo que permite que los registros sean
 * útiles: «falta configurar» y «el proveedor devolvió 500» son dos problemas
 * distintos con dos soluciones distintas.
 */
export type EmailDeliveryStatus = 'sent' | 'skipped' | 'failed'

export interface EmailDeliveryResult {
  status: EmailDeliveryStatus
  tag: EmailTag
  /**
   * Motivo legible PARA EL REGISTRO DEL SERVIDOR. Nunca se enseña al usuario y
   * nunca contiene la clave del proveedor ni el cuerpo del mensaje.
   */
  detail: string
  /** Variables que faltan, cuando `status === 'skipped'`. */
  missing?: string[]
}

/**
 * Lo único que la aplicación necesita de un proveedor de correo.
 *
 * Un proveedor NUNCA lanza: devuelve el resultado. Quien envía correo es
 * siempre un efecto secundario de otra cosa —crear un ticket, responderlo— y
 * esa otra cosa no puede caerse porque un servicio externo esté de baja.
 */
export interface EmailProvider {
  readonly name: string
  send(message: EmailMessage, from: EmailAddress): Promise<EmailDeliveryResult>
}

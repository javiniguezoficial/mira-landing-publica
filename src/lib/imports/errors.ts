// Saneamiento de errores de la importación de precios.
//
// ── Por qué existe este módulo ──────────────────────────────────────────────
//
// El asistente llamaba a las Server Actions dentro de `startTransition` sin
// `try/catch`. Una promesa rechazada ahí no la recoge nadie: escala al error
// boundary más cercano y, como no había ninguno, el usuario terminaba en la
// pantalla en blanco de Next —«Application error: a server-side exception has
// occurred»— con la importación aparentemente perdida.
//
// Eso pasaba de verdad: con el tope de 1 MB de las Server Actions, cualquier
// CSV grande reventaba en el transporte y esa era la única señal que recibía
// quien importaba.
//
// ── La regla ────────────────────────────────────────────────────────────────
//
// Un mensaje CONCRETO solo cuando sabemos de verdad qué ha pasado. Con el
// transporte ya en 12 MB, una excepción puede venir de la red, del parser, de
// PostgREST o de un timeout de sentencia; contestar «el archivo es demasiado
// grande» ante cualquier fallo mandaría a quien importa a partir un fichero
// que no tiene ningún problema.
//
// Y nunca sale hacia la interfaz nada de dentro: ni SQL, ni stack, ni rutas,
// ni el texto crudo de Supabase. Lo único que puede cruzar es el `digest` de
// Next, que es un hash opaco pensado justo para esto: correlacionar lo que ve
// el usuario con la línea del log del servidor.

/** Lo que se dice cuando NO sabemos qué ha fallado. */
export const IMPORT_UNEXPECTED_ERROR =
  'No se ha podido procesar el archivo. No se ha importado ningún dato. ' +
  'Inténtalo de nuevo o contacta con soporte si el problema continúa.'

/**
 * Códigos SQLSTATE que lanza `commit_market_import` a propósito.
 *
 * Sus mensajes están escritos para leerse en pantalla y no dicen nada de la
 * base. Cualquier OTRO código es un fallo que no habíamos previsto, y su texto
 * viene de PostgreSQL o de PostgREST: ese no se enseña.
 */
export const IMPORT_COMMIT_ERROR_CODES = new Set([
  '42501', // no es platform_admin
  'P0002', // el batch no existe
  '22023', // el batch ya no está en `ready`
])

/** Cancelación por `statement_timeout`. Es identificable, así que se explica. */
export const STATEMENT_TIMEOUT_CODE = '57014'

export const IMPORT_TIMEOUT_ERROR =
  'La importación ha tardado demasiado y se ha cancelado. No se ha importado ' +
  'ningún dato. Divide el archivo en partes más pequeñas y vuelve a intentarlo.'

/**
 * Referencia técnica que sí se puede enseñar.
 *
 * El digest de Next es `<hash>` o `<hash>@E<codigo>`. Es un identificador
 * opaco: no lleva mensaje, ni ruta, ni dato del usuario. Se valida la forma
 * antes de mostrarlo para que un error de otra procedencia no cuele texto
 * arbitrario en la pantalla.
 */
const DIGEST_PATTERN = /^[0-9]{1,20}(@E[0-9]{1,6})?$/

export function safeErrorReference(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null
  const digest = (error as { digest?: unknown }).digest
  if (typeof digest !== 'string') return null
  return DIGEST_PATTERN.test(digest) ? digest : null
}

export interface SafeImportError {
  /** Texto para el usuario. Nunca contiene nada interno. */
  message: string
  /** Digest de Next, si lo hay, para cruzarlo con los logs. */
  reference: string | null
}

/**
 * Convierte cualquier excepción en algo que se puede pintar.
 *
 * Devuelve SIEMPRE el mensaje genérico. No intenta adivinar la causa a partir
 * del texto del error: ese texto es justo lo que no queremos enseñar, y
 * cazarlo por subcadenas es cómo se acaba enseñándolo sin querer.
 */
export function toSafeImportError(error: unknown): SafeImportError {
  return { message: IMPORT_UNEXPECTED_ERROR, reference: safeErrorReference(error) }
}

/**
 * Decide qué se enseña de un error devuelto por `commit_market_import`.
 *
 * Los tres códigos nuestros pasan con su mensaje. El timeout tiene el suyo.
 * Todo lo demás cae al genérico: el `message` de PostgREST en ese caso es
 * texto de PostgreSQL y puede nombrar tablas, columnas o restricciones.
 */
export function safeCommitErrorMessage(
  code: string | null | undefined,
  message: string | null | undefined,
): string {
  if (code === STATEMENT_TIMEOUT_CODE) return IMPORT_TIMEOUT_ERROR
  if (code && IMPORT_COMMIT_ERROR_CODES.has(code) && message) return message
  return IMPORT_UNEXPECTED_ERROR
}

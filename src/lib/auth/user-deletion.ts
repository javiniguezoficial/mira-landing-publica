// Ciclo de vida de una cuenta: suspender, reactivar y eliminar.
//
// Módulo PURO. Decide QUÉ se puede hacer con una cuenta y por qué no, sin tocar
// Supabase ni React, para que la pantalla y la Server Action no puedan
// contradecirse.
//
// ═══════════════════════════════════════════════════════════════════════════
// MATRIZ DE DEPENDENCIAS  (auditada contra el esquema real)
// ═══════════════════════════════════════════════════════════════════════════
//
// Borrar `auth.users` arrastra `profiles` (FK CASCADE), y `profiles` arrastra
// lo suyo. Esto es lo que ocurre de verdad, columna por columna:
//
//   tabla                          columna         ON DELETE   efecto
//   ─────────────────────────────────────────────────────────────────────────
//   profiles                       id → users      CASCADE     desaparece
//   organization_members           user_id         CASCADE     desaparece  ← se quiere
//   user_market_favorites          user_id         CASCADE     desaparece  ← preferencia
//   ─────────────────────────────────────────────────────────────────────────
//   support_tickets                user_id         SET NULL    se conserva, se desvincula (051)
//   rfqs                           created_by      SET NULL    se conserva, se desvincula (051)
//   support_ticket_messages        author_id       SET NULL    se conserva, se desvincula
//   news                           created_by      SET NULL    se conserva
//   market_import_batches          created_by      SET NULL    se conserva
//   market_price_deletion_batches  created_by      SET NULL    se conserva
//   supplier_update_batches        created_by      SET NULL    se conserva
//   subscriptions                  created_by      SET NULL    se conserva
//   organizations                  plan_approved_by SET NULL   se conserva
//   organization_disabled_markets  disabled_by     SET NULL    se conserva
//   organization_members           invited_by      SET NULL    se conserva
//   ─────────────────────────────────────────────────────────────────────────
//   admin_audit_log                actor_id        SIN FK      SOBREVIVE ← deliberado (039)
//                                  target_user_id  SIN FK      SOBREVIVE
//
// ── Las dos conclusiones que gobiernan este archivo ──────────────────────
//
//   1. Desde la 051 TODO el histórico es SET NULL: tickets, cotizaciones,
//      noticias, importaciones… El registro se conserva y solo pierde el
//      vínculo con la cuenta. La regla de producto es que el histórico jamás
//      impida liberar una identidad: hoy se elimina usuario@empresa.com y en
//      seis meses ese correo puede darse de alta como cuenta nueva. Por eso
//      los antiguos bloqueos «tiene tickets» y «tiene cotizaciones» ya no
//      existen: ahora son AVISOS, para que quien elimina sepa qué se queda
//      desvinculado.
//
//   2. Los únicos bloqueos son los que protegen la PLATAFORMA, no el
//      histórico: uno mismo, el último administrador activo y la propiedad de
//      una organización (transferirla es una decisión de negocio, no un efecto
//      secundario de pulsar «Eliminar»).
//
// `admin_audit_log` sin FK es lo que permite que, después de eliminar a
// alguien, siga constando quién lo hizo y sobre qué identificador.

// ═══════════════════════════════════════════════════════════════════════════
// Hechos que hay que reunir ANTES de decidir
// ═══════════════════════════════════════════════════════════════════════════

export interface UserDeletionFacts {
  /** Quién ejecuta. */
  actorId: string
  /** A quién se quiere eliminar. */
  targetUserId: string
  /** Rol de plataforma del objetivo. */
  targetIsPlatformAdmin: boolean
  /** Cuántos `platform_admin` ACTIVOS hay en total, incluido el objetivo. */
  activeAdminCount: number
  /** Nombres de las organizaciones donde el objetivo es propietario. */
  ownedOrganizations: string[]
  /** Registros que se DESVINCULAN al eliminar. Ninguno bloquea; se avisa. */
  rfqCount: number
  supportTicketCount: number
  authoredNewsCount: number
  importBatchCount: number
  deletionBatchCount: number
  supplierBatchCount: number
}

export type DeletionBlockReason =
  | 'SELF'
  | 'LAST_ADMIN'
  | 'ORGANIZATION_OWNER'

export interface DeletionVerdict {
  deletable: boolean
  /** Motivos por los que NO se puede. Vacío si es eliminable. */
  blocks: DeletionBlockReason[]
  /** Cosas que se van a desvincular. No impiden nada. */
  warnings: string[]
}

// ═══════════════════════════════════════════════════════════════════════════
// La decisión
// ═══════════════════════════════════════════════════════════════════════════

/**
 * ¿Se puede eliminar esta cuenta?
 *
 * Devuelve TODOS los motivos, no el primero: si a alguien le faltan tres cosas
 * para poder eliminar una cuenta, enseñárselas de una en una lo convierte en un
 * juego de adivinanzas.
 *
 * ── Por qué se prefiere bloquear ─────────────────────────────────────────
 *
 * Porque suspender es reversible y eliminar no. Ante la duda, la respuesta
 * correcta es «suspéndelo», que conserva el perfil, las pertenencias y el
 * histórico, y se puede deshacer en un clic.
 */
export function evaluateUserDeletion(facts: UserDeletionFacts): DeletionVerdict {
  const blocks: DeletionBlockReason[] = []

  // 1. Uno mismo. Nunca, ni siendo el único administrador ni no siéndolo:
  //    quien se elimina a sí mismo no puede deshacerlo, porque ya no entra.
  if (facts.actorId === facts.targetUserId) blocks.push('SELF')

  // 2. El último administrador ACTIVO. Dejar MIRA sin nadie capaz de entrar en
  //    /admin no lo arregla ningún otro flujo del producto.
  if (facts.targetIsPlatformAdmin && facts.activeAdminCount <= 1) blocks.push('LAST_ADMIN')

  // 3. Propietario de una organización. La propiedad NO se reasigna sola: el
  //    propietario es único por empresa y elegir sucesor es una decisión de
  //    negocio, no un efecto secundario de pulsar «Eliminar».
  if (facts.ownedOrganizations.length > 0) blocks.push('ORGANIZATION_OWNER')

  // El histórico NO bloquea desde la 051: tickets y cotizaciones se conservan
  // con el vínculo a NULL, igual que las noticias o las importaciones. Aparecen
  // como avisos para que quien elimina sepa exactamente qué se desvincula.

  return { deletable: blocks.length === 0, blocks, warnings: buildWarnings(facts) }
}

/** Lo que se va a DESVINCULAR. Se conserva el registro, se pierde el autor. */
function buildWarnings(facts: UserDeletionFacts): string[] {
  const avisos: string[] = []
  const linea = (n: number, singular: string, plural: string) =>
    n === 1 ? `1 ${singular}` : `${n} ${plural}`

  if (facts.supportTicketCount > 0) {
    avisos.push(
      `${linea(facts.supportTicketCount, 'conversación de soporte se conservará', 'conversaciones de soporte se conservarán')} sin vínculo con la cuenta.`,
    )
  }
  if (facts.rfqCount > 0) {
    avisos.push(
      `${linea(facts.rfqCount, 'cotización se conservará', 'cotizaciones se conservarán')} sin creador; su organización las mantiene.`,
    )
  }
  if (facts.authoredNewsCount > 0) {
    avisos.push(`${linea(facts.authoredNewsCount, 'noticia', 'noticias')} se quedará sin autor.`)
  }
  if (facts.importBatchCount > 0) {
    avisos.push(
      `${linea(facts.importBatchCount, 'importación de precios', 'importaciones de precios')} se conservará sin autor.`,
    )
  }
  if (facts.deletionBatchCount > 0) {
    avisos.push(
      `${linea(facts.deletionBatchCount, 'operación de borrado de precios', 'operaciones de borrado de precios')} se conservará sin autor.`,
    )
  }
  if (facts.supplierBatchCount > 0) {
    avisos.push(
      `${linea(facts.supplierBatchCount, 'actualización de proveedores', 'actualizaciones de proveedores')} se conservará sin autor.`,
    )
  }
  return avisos
}

// ═══════════════════════════════════════════════════════════════════════════
// Mensajes
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Por qué no se puede, dicho para una persona.
 *
 * Cada mensaje dice QUÉ pasa y QUÉ hacer en su lugar. Ninguno enseña texto de
 * PostgreSQL: un «violates foreign key constraint rfqs_created_by_fkey» no le
 * dice a nadie que tiene que suspender la cuenta.
 */
export function deletionBlockMessage(
  reason: DeletionBlockReason,
  facts: Pick<UserDeletionFacts, 'ownedOrganizations'>,
): string {
  switch (reason) {
    case 'SELF':
      return 'No puedes eliminar tu propia cuenta. Pídeselo a otro administrador de MIRA.'
    case 'LAST_ADMIN':
      return 'No puedes eliminar el último administrador de MIRA. Nombra a otro antes.'
    case 'ORGANIZATION_OWNER': {
      const empresas = facts.ownedOrganizations.join(', ')
      return `Este usuario es propietario de ${empresas}. Transfiere primero la propiedad antes de eliminarlo.`
    }
  }
}

export function deletionBlockMessages(verdict: DeletionVerdict, facts: UserDeletionFacts): string[] {
  return verdict.blocks.map((b) => deletionBlockMessage(b, facts))
}

export const DELETION_MESSAGES = {
  noExiste: 'El usuario indicado ya no existe.',
  confirmacion: 'La confirmación no coincide. Escribe el correo exacto de la cuenta.',
  generico: 'No se ha podido eliminar la cuenta. Vuelve a intentarlo en unos minutos.',
  /**
   * La base ha rechazado el borrado por una dependencia que la comprobación
   * previa no vio. No debería ocurrir —se comprueban todas las que existen—
   * pero si el esquema crece, este es el mensaje que evita enseñar SQL crudo.
   */
  dependenciaInesperada:
    'La cuenta tiene información asociada que impide eliminarla. Suspéndela en lugar de eliminarla.',
} as const

// ═══════════════════════════════════════════════════════════════════════════
// Confirmación escrita
// ═══════════════════════════════════════════════════════════════════════════

/**
 * La confirmación es el CORREO EXACTO de la cuenta, no una palabra fija.
 *
 * Escribir «ELIMINAR» se convierte en un acto reflejo en cuanto se hace dos
 * veces. Teclear la dirección obliga a mirar a QUIÉN se está eliminando, que es
 * justo el error que esta pantalla tiene que hacer imposible: borrar la cuenta
 * equivocada.
 *
 * Se compara normalizado —minúsculas, sin espacios— porque el objetivo es que
 * la persona confirme, no que acierte con las mayúsculas.
 */
export function isDeletionConfirmed(
  escrito: string | null | undefined,
  emailEsperado: string | null | undefined,
): boolean {
  const a = typeof escrito === 'string' ? escrito.trim().toLowerCase() : ''
  const b = typeof emailEsperado === 'string' ? emailEsperado.trim().toLowerCase() : ''
  return a.length > 0 && b.length > 0 && a === b
}

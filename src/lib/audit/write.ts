// Escritura del registro de auditoría de administración (Fase 039).
//
// SOLO SERVIDOR, pero NO es un módulo `'use server'`: recibe el cliente de
// Supabase que ya tiene quien llama, en lugar de crear el suyo. Así la
// auditoría se escribe con la MISMA sesión que hizo el cambio y bajo las
// mismas policies —`actor_id = auth.uid()` es una condición del INSERT—, en vez
// de con un cliente privilegiado que podría atribuir la acción a cualquiera.

import type { AdminAuditAction } from './actions'

/** Lo mínimo que se necesita del cliente. Evita atarse a la firma del SDK. */
export interface AuditCapableClient {
  from(table: string): {
    insert(values: Record<string, unknown>): PromiseLike<{ error: { message?: string; code?: string } | null }>
  }
}

export interface AuditEntry {
  actorId: string
  action: AdminAuditAction
  targetUserId?: string | null
  targetOrganizationId?: string | null
  /** Estado ANTES, solo campos de autorización. */
  before?: Record<string, unknown> | null
  /** Estado DESPUÉS, solo campos de autorización. */
  after?: Record<string, unknown> | null
  /** Marca de datos de prueba. Ver `admin_audit_log.is_qa`. */
  isQa?: boolean
}

/**
 * Registra una operación de administración.
 *
 * ── Por qué NO lanza si falla ──────────────────────────────────────────────
 *
 * Porque se llama DESPUÉS de que el cambio ya esté aplicado. Si la auditoría
 * fallara y esto lanzara, la interfaz diría «no se ha podido completar» sobre
 * una operación que sí se completó, y quien lo viera repetiría el cambio. Es
 * peor mentir sobre el resultado que perder una línea de histórico.
 *
 * El fallo se registra en el servidor con detalle suficiente para reconstruir
 * la entrada a mano si hiciera falta.
 *
 * ── Por qué no es una transacción con el cambio ────────────────────────────
 *
 * Porque PostgREST no expone transacciones multi-sentencia. Hacerlo atómico
 * exigiría mover cada operación a una función SECURITY DEFINER, y eso
 * significaría reimplementar dentro de SQL las reglas que los triggers de 021 y
 * 023 ya aplican —con el riesgo de que las dos copias divergieran—. Se acepta
 * la ventana: el histórico puede quedar incompleto, nunca al revés.
 */
export async function writeAuditEntry(
  supabase: AuditCapableClient,
  entry: AuditEntry,
): Promise<void> {
  const { error } = await supabase.from('admin_audit_log').insert({
    actor_id: entry.actorId,
    action: entry.action,
    target_user_id: entry.targetUserId ?? null,
    target_organization_id: entry.targetOrganizationId ?? null,
    before_state: entry.before ?? null,
    after_state: entry.after ?? null,
    is_qa: entry.isQa === true,
  })

  if (error) {
    console.error(
      `[audit] no se pudo registrar «${entry.action}» de ${entry.actorId} ` +
        `sobre usuario=${entry.targetUserId ?? '—'} organización=${entry.targetOrganizationId ?? '—'}: ` +
        `${error.code ?? 'sin código'} ${error.message ?? ''}`,
    )
  }
}

// Reglas de gestión de equipo (Bloque 6B.3).
//
// Módulo puro. Espeja en TypeScript lo que impone la migración 023, con la
// misma separación en dos capas:
//
//   AUTORIZACIÓN  — qué puede hacer cada actor. Un `platform_admin` tiene más
//                   margen que un cliente.
//   INVARIANTES   — qué estados son representables. Se aplican a TODO EL MUNDO,
//                   incluido `platform_admin`. Más autorización funcional no
//                   equivale a poder corromper el modelo.
//
// La base de datos sigue siendo la autoridad: estas funciones NO sustituyen al
// trigger, a las policies ni al índice único, que se aplican aunque alguien
// llame a PostgREST directamente. Sirven para que la interfaz anticipe una
// denegación en vez de mostrar un error de base de datos.

import type { CommercialProfile, OrganizationRole } from '@/lib/identity'
import type { AuthorizationCode } from './errors'
import type { AuthMembership } from './types'

/** Rol asignable desde la gestión de equipo por un cliente. */
export type AssignableRole = 'admin' | 'member'

/** Estados que la gestión de equipo de un cliente puede fijar a mano. */
export type AssignableTeamStatus = 'active' | 'suspended'

export interface TeamActor {
  /** Rol del actor en la organización sobre la que actúa. */
  orgRole: OrganizationRole | null
  userId: string
  /** Administrador de plataforma: más autorización, mismas invariantes. */
  isPlatformAdmin?: boolean
}

export interface TeamTarget {
  orgRole: OrganizationRole | null
  userId: string
}

/**
 * ¿Alcanza el actor la gestión de equipo?
 *
 * Es la puerta de ENTRADA a la pantalla y a todas las acciones de este módulo.
 * Se exporta —antes era privada— porque la diferencia real entre `admin` y
 * `member` que pedía el cliente se apoya justo aquí: sin esto, la interfaz solo
 * podía esconder botones, y esconder un botón no es autorizar.
 *
 * Espeja `is_org_admin(uuid)`, que admite `owner` y `admin`. Un `member` no
 * gestiona a nadie.
 */
export function canManageTeam(actor: TeamActor): boolean {
  return actor.isPlatformAdmin === true || actor.orgRole === 'owner' || actor.orgRole === 'admin'
}

function puedeGestionar(actor: TeamActor): boolean {
  return canManageTeam(actor)
}

// ── Capa 1: AUTORIZACIÓN ────────────────────────────────────────────────────

/**
 * ¿Puede el actor dar de alta a alguien con el rol indicado?
 *
 * Solo el propietario concede el rol de administrador: quien puede nombrar
 * administradores puede multiplicar su propio poder, y una organización debe
 * tener una única raíz de confianza.
 */
export function evaluateMemberCreation(
  actor: TeamActor,
  nuevoRol: AssignableRole,
): AuthorizationCode | null {
  if (!puedeGestionar(actor)) return 'FORBIDDEN'
  if (actor.isPlatformAdmin) return null
  if (nuevoRol === 'admin' && actor.orgRole !== 'owner') return 'FORBIDDEN'
  return null
}

/** ¿Puede el actor modificar la pertenencia indicada? */
export function evaluateMemberUpdate(
  actor: TeamActor,
  target: TeamTarget,
  nuevoRol?: AssignableRole,
): AuthorizationCode | null {
  if (!puedeGestionar(actor)) return 'FORBIDDEN'

  // INVARIANTE, no autorización: nadie se modifica a sí mismo, ni siquiera un
  // administrador de plataforma que perteneciera excepcionalmente a una
  // organización.
  if (actor.userId === target.userId) return 'FORBIDDEN'

  // INVARIANTE: la fila del propietario no se modifica desde la gestión
  // ordinaria. Degradarlo dejaría la organización sin ninguno.
  if (target.orgRole === 'owner') return 'FORBIDDEN'

  if (actor.isPlatformAdmin) return null

  // Autorización: un administrador no gestiona a otro administrador.
  if (target.orgRole === 'admin' && actor.orgRole !== 'owner') return 'FORBIDDEN'
  if (nuevoRol === 'admin' && actor.orgRole !== 'owner') return 'FORBIDDEN'

  return null
}

/** ¿Puede el actor eliminar la pertenencia indicada? */
export function evaluateMemberRemoval(
  actor: TeamActor,
  target: TeamTarget,
): AuthorizationCode | null {
  if (!puedeGestionar(actor)) return 'FORBIDDEN'

  // Invariantes, aplicables también a platform_admin.
  if (actor.userId === target.userId) return 'FORBIDDEN'
  if (target.orgRole === 'owner') return 'FORBIDDEN'

  if (actor.isPlatformAdmin) return null

  if (target.orgRole === 'admin' && actor.orgRole !== 'owner') return 'FORBIDDEN'
  return null
}

/**
 * ¿Puede el actor activar o desactivar esta pertenencia?
 *
 * Compone las dos capas en lugar de reescribirlas: la autorización ordinaria de
 * `evaluateMemberUpdate` —que ya bloquea la propia fila y la del propietario— y
 * después la protección explícita del propietario, que es la que explica POR QUÉ
 * (`evaluateMemberUpdate` diría solo «no puedes»).
 *
 * Desactivar al propietario dejaría la organización sin ninguno activo, que es
 * exactamente lo que rechaza el trigger de 023 con `23514`.
 */
export function evaluateMemberStatusChange(
  actor: TeamActor,
  target: TeamTarget,
  nuevoStatus: AssignableTeamStatus,
): AuthorizationCode | null {
  const fallo = evaluateMemberUpdate(actor, target)
  if (fallo) return fallo
  return evaluateOwnerProtection(target, { nuevoStatus })
}

/**
 * ¿Puede el actor cambiar las capacidades comerciales de esta pertenencia?
 *
 * Dos condiciones acumulativas:
 *
 *   1. autorización ordinaria sobre la fila (`evaluateMemberUpdate`);
 *   2. techo comercial de la empresa (`evaluateCapabilityAssignment`).
 *
 * ── Por qué el propietario queda fuera, a diferencia del panel de MIRA ──────
 *
 * `lib/auth/user-admin.ts` SÍ permite a un `platform_admin` tocar las
 * capacidades del propietario. Aquí no, y es deliberado: en el portal de cliente
 * el actor es un compañero de empresa. Dejar que un `admin` retire `can_buy` al
 * propietario le permitiría bloquear a quien manda sin poder degradarlo —una
 * escalada lateral—. Quien necesite cambiar las capacidades del propietario pasa
 * por MIRA, que es donde esa operación queda auditada.
 */
export function evaluateMemberCapabilityChange(
  actor: TeamActor,
  target: TeamTarget,
  organization: Pick<AuthMembership, 'commercialProfile'>,
  capacidades: { canBuy?: boolean; canSell?: boolean },
): AuthorizationCode | null {
  const fallo = evaluateMemberUpdate(actor, target)
  if (fallo) return fallo
  return evaluateCapabilityAssignment(organization, capacidades)
}

// ── Capa 2: INVARIANTES ESTRUCTURALES ───────────────────────────────────────

/**
 * Valor legacy que corresponde a cada rol canónico. Mientras exista la columna
 * `organization_members.role`, la correspondencia es exacta y obligatoria: una
 * escritura parcial dejaría la fila en un estado ambiguo.
 */
export const LEGACY_ROLE_FOR: Record<OrganizationRole, string> = {
  owner: 'client_owner',
  admin: 'client_member',
  member: 'client_member',
}

/** Invariante B.5–B.8: coherencia entre el modelo canónico y el legacy. */
export function evaluateRolePairCoherence(
  orgRole: string | null | undefined,
  legacyRole: string | null | undefined,
): AuthorizationCode | null {
  const esperado = orgRole ? LEGACY_ROLE_FOR[orgRole as OrganizationRole] : undefined
  if (!esperado) return 'INVALID_ROLE'
  return legacyRole === esperado ? null : 'INVALID_ROLE'
}

/**
 * Invariante B.9/B.12: una organización tiene como máximo un propietario.
 *
 * Ni siquiera un `platform_admin` puede crear un segundo. Sí puede crear el
 * primero cuando la organización no tiene ninguno — reparación de una
 * organización huérfana. Un cliente no puede crear propietario en ningún caso.
 */
export function evaluateOwnerCreation(
  actor: TeamActor,
  organizacionYaTieneOwner: boolean,
): AuthorizationCode | null {
  if (organizacionYaTieneOwner) return 'FORBIDDEN'
  if (!actor.isPlatformAdmin) return 'FORBIDDEN'
  return null
}

/**
 * Invariantes B.10/B.11/B.14: una operación ordinaria nunca deja la
 * organización sin propietario. Aplica a todos los actores.
 */
export function evaluateOwnerProtection(
  target: TeamTarget,
  cambio: { nuevoRol?: string; nuevoStatus?: string; eliminar?: boolean },
): AuthorizationCode | null {
  if (target.orgRole !== 'owner') return null
  if (cambio.eliminar) return 'FORBIDDEN'
  if (cambio.nuevoRol !== undefined && cambio.nuevoRol !== 'owner') return 'FORBIDDEN'
  if (cambio.nuevoStatus !== undefined && cambio.nuevoStatus !== 'active') return 'FORBIDDEN'
  return null
}

/** Invariantes B.1–B.4: identificadores inmutables tras la inserción. */
export const IMMUTABLE_MEMBERSHIP_COLUMNS = [
  'id',
  'organization_id',
  'user_id',
  'invited_by',
] as const

export function evaluateStructuralImmutability(
  anterior: Record<string, unknown>,
  nuevo: Record<string, unknown>,
): AuthorizationCode | null {
  for (const col of IMMUTABLE_MEMBERSHIP_COLUMNS) {
    if (col in nuevo && nuevo[col] !== anterior[col]) return 'FORBIDDEN'
  }
  return null
}

/**
 * Invariante B.13: techo comercial. Una capacidad no puede concederse si el
 * perfil de la organización no la contempla, sea quien sea quien la conceda.
 */
export function evaluateCapabilityAssignment(
  organization: Pick<AuthMembership, 'commercialProfile'>,
  capacidades: { canBuy?: boolean; canSell?: boolean },
): AuthorizationCode | null {
  const perfil = organization.commercialProfile

  if (capacidades.canBuy && perfil !== 'buyer' && perfil !== 'buyer_seller') {
    return 'FORBIDDEN'
  }
  if (capacidades.canSell && perfil !== 'seller' && perfil !== 'buyer_seller') {
    return 'FORBIDDEN'
  }
  return null
}

// ── Columnas de `organizations` ─────────────────────────────────────────────

export const OWNER_EDITABLE_ORG_COLUMNS = [
  'name',
  'cif_nif',
  'type',
  'sector',
  'annual_revenue_range',
  'employee_count_range',
  'address',
  'city',
  'country',
  'phone',
  'email',
  'website',
] as const

export const PLATFORM_ONLY_ORG_COLUMNS = [
  'id',
  'plan_id',
  'subscription_status',
  'subscription_start',
  'subscription_end',
  'status',
  'commercial_profile',
  'created_at',
] as const

export function isOwnerEditableOrgColumn(columna: string): boolean {
  return (OWNER_EDITABLE_ORG_COLUMNS as readonly string[]).includes(columna)
}

// ── Textos de la gestión de equipo del portal cliente ───────────────────────
//
// Ninguno menciona columnas, policies, triggers ni SQLSTATE: quien los lee es
// una persona de la empresa cliente, no quien mantiene la base de datos.

export const TEAM_MESSAGES = {
  sinPermiso: 'No tienes permiso para gestionar el equipo de tu organización.',
  soloOwnerAdmin: 'Solo el propietario o un administrador pueden gestionar el equipo.',
  propiaFila: 'No puedes modificar tu propia pertenencia. Pídeselo a otra persona con permisos.',
  propietarioIntocable:
    'La pertenencia del propietario no se modifica desde aquí: la organización se quedaría sin propietario activo.',
  soloOwnerSobreAdmin: 'Solo el propietario puede gestionar a un administrador.',
  soloOwnerConcedeAdmin: 'Solo el propietario puede conceder el rol de administrador.',
  sinMiembro: 'Esa persona ya no pertenece a tu organización.',
  rolNoValido: 'El rol seleccionado no es válido.',
  estadoNoValido: 'El estado seleccionado no es válido.',
  generico: 'No se ha podido completar la operación.',
} as const

/**
 * Motivo legible de una denegación de la gestión de equipo.
 *
 * Recibe además el contexto —quién es el actor y a quién apunta— porque el
 * mismo `FORBIDDEN` significa cosas distintas y cada una lleva a una acción
 * distinta: esperar, pedírselo al propietario, o escribir a MIRA.
 */
export function teamDenialMessage(
  code: AuthorizationCode,
  contexto?: { actor?: TeamActor; target?: TeamTarget },
): string {
  if (code === 'NO_ORGANIZATION') return TEAM_MESSAGES.sinMiembro
  if (code === 'INVALID_ROLE') return TEAM_MESSAGES.rolNoValido

  const { actor, target } = contexto ?? {}
  if (actor && target) {
    if (actor.userId === target.userId) return TEAM_MESSAGES.propiaFila
    if (target.orgRole === 'owner') return TEAM_MESSAGES.propietarioIntocable
    if (target.orgRole === 'admin' && actor.orgRole !== 'owner') {
      return TEAM_MESSAGES.soloOwnerSobreAdmin
    }
    if (!canManageTeam(actor)) return TEAM_MESSAGES.soloOwnerAdmin
  }

  return TEAM_MESSAGES.sinPermiso
}

/**
 * Por qué una capacidad no se puede conceder, para el texto de ayuda bajo la
 * casilla deshabilitada. Devuelve `null` cuando sí se puede.
 *
 * El cliente pedía expresamente que la interfaz EXPLIQUE la casilla apagada. Sin
 * esto, «Vender» aparecía gris sin motivo y parecía un fallo.
 */
export function capabilityCeilingReason(
  commercialProfile: CommercialProfile | null,
  capability: 'buy' | 'sell',
): string | null {
  const admite =
    capability === 'buy'
      ? commercialProfile === 'buyer' || commercialProfile === 'buyer_seller'
      : commercialProfile === 'seller' || commercialProfile === 'buyer_seller'

  if (admite) return null

  return capability === 'buy'
    ? 'Tu organización no tiene perfil comprador. Contacta con MIRA para ampliarlo.'
    : 'Tu organización no tiene perfil vendedor. Contacta con MIRA para ampliarlo.'
}

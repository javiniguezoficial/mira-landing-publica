// Administración de usuarios desde el panel global (Fase 039).
//
// Módulo PURO. Igual que `team.ts`, espeja en TypeScript lo que la base de
// datos ya impone, con la misma separación en dos capas:
//
//   AUTORIZACIÓN  — qué puede hacer el actor.
//   INVARIANTES   — qué estados son representables, para TODO EL MUNDO.
//
// La base de datos sigue siendo la autoridad. Estas funciones existen para que
// la interfaz anticipe una denegación con un mensaje entendible en lugar de
// enseñar un error de PostgreSQL, y para poder probar las reglas sin red.
//
// ── Los tres ejes, que NO se mezclan ───────────────────────────────────────
//
//   1. ROL DE PLATAFORMA      `profiles.role`                platform_admin | user
//   2. ROL DE ORGANIZACIÓN    `organization_members.org_role` owner | admin | member
//   3. CAPACIDADES            `can_buy` / `can_sell`          acotadas por la empresa
//
// El primero NO aparece nunca en el selector de rol de empresa. Son cosas
// distintas: `platform_admin` da acceso al panel de MIRA, no a una empresa
// cliente, y ofrecerlo en el mismo desplegable que «Miembro» invita a
// concederlo por error.

import type { AuthorizationCode } from './errors'
import {
  normalizeMembershipStatus,
  normalizeOrganizationRole,
  normalizePlatformRole,
  type CommercialProfile,
  type MembershipStatus,
  type OrganizationRole,
  type PlatformRole,
} from '@/lib/identity'

// ── Rol de organización asignable desde administración ──────────────────────

/**
 * Roles que un `platform_admin` puede asignar al crear o cambiar una
 * pertenencia.
 *
 * Incluye `owner`, a diferencia de `ManageableOrgRole` de `member-write.ts`,
 * que es el conjunto que puede asignar un CLIENTE. La diferencia no es
 * caprichosa: el trigger de 023 admite que un administrador de plataforma cree
 * el PRIMER propietario de una organización que no tiene ninguno, y ese caso
 * existe de verdad en los datos —«MIRA Pricing Technologies SL» está sin
 * propietario—. Sin esta opción, esa organización solo se podría arreglar con
 * una conexión SQL directa.
 *
 * Lo que sigue estando prohibido es crear un SEGUNDO propietario: eso es una
 * transferencia de propiedad, no una asignación, y no se implementa aquí.
 */
export const ASSIGNABLE_ORG_ROLES = ['owner', 'admin', 'member'] as const

export type AssignableOrgRole = (typeof ASSIGNABLE_ORG_ROLES)[number]

export const ASSIGNABLE_ORG_ROLE_LABELS: Record<AssignableOrgRole, string> = {
  owner: 'Propietario',
  admin: 'Administrador',
  member: 'Miembro',
}

/** Fail-closed: cualquier valor que no sea exactamente uno de los tres, `null`. */
export function normalizeAssignableOrgRole(raw: unknown): AssignableOrgRole | null {
  if (typeof raw !== 'string') return null
  return ASSIGNABLE_ORG_ROLES.find((r) => r === raw) ?? null
}

/**
 * Valor legacy que corresponde a cada rol canónico.
 *
 * Mientras exista la columna `organization_members.role`, toda escritura debe
 * fijar los DOS valores: el trigger rechaza una fila incoherente. Se repite
 * aquí en lugar de importarlo de `team.ts` porque aquel mapa cubre solo los
 * roles de cliente; este cubre además `owner`.
 */
export const LEGACY_ROLE_FOR_ASSIGNABLE: Record<AssignableOrgRole, string> = {
  owner: 'client_owner',
  admin: 'client_member',
  member: 'client_member',
}

// ── Estado de la pertenencia ────────────────────────────────────────────────

/**
 * Estados que la administración puede fijar a mano.
 *
 * `invited` queda fuera: no hay flujo de invitación por correo, así que dejar
 * a alguien «invitado» produciría una pertenencia que no da acceso y que nadie
 * puede completar. Cuando exista invitación real, será ella quien escriba ese
 * estado.
 */
export const ASSIGNABLE_MEMBERSHIP_STATUSES = ['active', 'suspended'] as const

export type AssignableMembershipStatus = (typeof ASSIGNABLE_MEMBERSHIP_STATUSES)[number]

export const MEMBERSHIP_STATUS_LABELS: Record<AssignableMembershipStatus, string> = {
  active: 'Activa',
  suspended: 'Desactivada',
}

export function normalizeAssignableMembershipStatus(
  raw: unknown,
): AssignableMembershipStatus | null {
  if (typeof raw !== 'string') return null
  return ASSIGNABLE_MEMBERSHIP_STATUSES.find((s) => s === raw) ?? null
}

// ── Actor y objetivo ────────────────────────────────────────────────────────

export interface AdminActor {
  userId: string
  isPlatformAdmin: boolean
}

export interface MembershipTarget {
  userId: string
  orgRole: OrganizationRole | null
  status: MembershipStatus | null
}

export interface OrganizationFacts {
  /** Perfil comercial de la empresa: techo de `can_buy` / `can_sell`. */
  commercialProfile: CommercialProfile | null
  /** ¿Ya hay alguien con rol `owner`? */
  hasOwner: boolean
}

// ── Capa 1: AUTORIZACIÓN ────────────────────────────────────────────────────

/**
 * Alta de una pertenencia desde administración.
 *
 * Reglas, en el orden en que se comprueban:
 *
 *   1. solo un administrador de plataforma opera aquí;
 *   2. nadie se asigna a sí mismo a una organización — es la regla que impide
 *      que quien tiene el panel se conceda acceso a los datos de un cliente;
 *   3. `owner` solo si la organización no tiene propietario;
 *   4. las capacidades no pueden superar el perfil comercial de la empresa.
 */
export function evaluateMembershipAssignment(
  actor: AdminActor,
  targetUserId: string,
  role: AssignableOrgRole,
  organization: OrganizationFacts,
  capabilities: { canBuy: boolean; canSell: boolean },
): AuthorizationCode | null {
  if (!actor.isPlatformAdmin) return 'FORBIDDEN'
  if (actor.userId === targetUserId) return 'FORBIDDEN'
  if (role === 'owner' && organization.hasOwner) return 'FORBIDDEN'
  return evaluateCapabilityCeiling(organization, capabilities)
}

/**
 * Cambio de rol dentro de la organización.
 *
 * El propietario no se toca desde aquí, ni para degradarlo ni para sustituirlo:
 * el trigger de 023 lo rechaza y la transferencia de propiedad es una operación
 * distinta que todavía no existe.
 */
export function evaluateMembershipRoleChange(
  actor: AdminActor,
  target: MembershipTarget,
  newRole: AssignableOrgRole,
  organization: OrganizationFacts,
): AuthorizationCode | null {
  if (!actor.isPlatformAdmin) return 'FORBIDDEN'
  if (actor.userId === target.userId) return 'FORBIDDEN'
  if (target.orgRole === 'owner') return 'FORBIDDEN'
  if (newRole === 'owner' && organization.hasOwner) return 'FORBIDDEN'
  return null
}

/**
 * Activar o desactivar una pertenencia.
 *
 * Desactivar al propietario dejaría la organización sin propietario activo, que
 * es exactamente lo que el trigger impide.
 */
export function evaluateMembershipStatusChange(
  actor: AdminActor,
  target: MembershipTarget,
  newStatus: AssignableMembershipStatus,
): AuthorizationCode | null {
  if (!actor.isPlatformAdmin) return 'FORBIDDEN'
  if (actor.userId === target.userId) return 'FORBIDDEN'
  if (target.orgRole === 'owner' && newStatus !== 'active') return 'FORBIDDEN'
  return null
}

/**
 * Cambio de capacidades comerciales.
 *
 * A diferencia del rol, SÍ se admite sobre el propietario: `can_buy` y
 * `can_sell` no tienen nada que ver con quién manda en la empresa, y el trigger
 * de 023 solo protege el rol y el estado del propietario, no sus capacidades.
 */
export function evaluateCapabilityChange(
  actor: AdminActor,
  target: MembershipTarget,
  organization: OrganizationFacts,
  capabilities: { canBuy: boolean; canSell: boolean },
): AuthorizationCode | null {
  if (!actor.isPlatformAdmin) return 'FORBIDDEN'
  if (actor.userId === target.userId) return 'FORBIDDEN'
  return evaluateCapabilityCeiling(organization, capabilities)
}

/** Retirada de una pertenencia. Al propietario no se le retira. */
export function evaluateMembershipRemoval(
  actor: AdminActor,
  target: MembershipTarget,
): AuthorizationCode | null {
  if (!actor.isPlatformAdmin) return 'FORBIDDEN'
  if (actor.userId === target.userId) return 'FORBIDDEN'
  if (target.orgRole === 'owner') return 'FORBIDDEN'
  return null
}

// ── Capa 2: INVARIANTES ─────────────────────────────────────────────────────

/**
 * Techo comercial: una capacidad no se concede si el perfil de la empresa no la
 * contempla. Espejo del trigger de 023, que lo rechaza con `23514`.
 *
 * RETIRAR una capacidad siempre se permite, aunque el perfil no la contemple:
 * quitar permisos nunca puede quedar bloqueado por una restricción pensada para
 * no darlos de más.
 */
export function evaluateCapabilityCeiling(
  organization: OrganizationFacts,
  capabilities: { canBuy: boolean; canSell: boolean },
): AuthorizationCode | null {
  const perfil = organization.commercialProfile
  if (capabilities.canBuy && perfil !== 'buyer' && perfil !== 'buyer_seller') return 'FORBIDDEN'
  if (capabilities.canSell && perfil !== 'seller' && perfil !== 'buyer_seller') return 'FORBIDDEN'
  return null
}

/** ¿Admite la empresa esta capacidad? Para pintar la casilla deshabilitada. */
export function organizationAllows(
  commercialProfile: CommercialProfile | null,
  capability: 'buy' | 'sell',
): boolean {
  return capability === 'buy'
    ? commercialProfile === 'buyer' || commercialProfile === 'buyer_seller'
    : commercialProfile === 'seller' || commercialProfile === 'buyer_seller'
}

/**
 * Recorta unas capacidades al techo de un perfil comercial.
 *
 * ── El hueco que cierra ────────────────────────────────────────────────────
 *
 * `enforce_membership_rules` solo se dispara al escribir en
 * `organization_members`. Cambiar `organizations.commercial_profile` de
 * `buyer_seller` a `buyer` NO recorre las pertenencias, así que dejaba filas con
 * `can_sell = true` bajo una empresa que ya no vende.
 *
 * Eso NO era una escalada —`can_sell_in_org()` mira también
 * `o.commercial_profile`, así que la capacidad huérfana no concedía nada—, pero
 * sí una mentira: la interfaz enseñaba «Vende» a quien no podía vender, y al
 * volver a ampliar el perfil la capacidad reaparecía sin que nadie la hubiera
 * concedido.
 *
 * Esta función SOLO RETIRA. Nunca concede: pasar de `buyer` a `buyer_seller` no
 * activa `can_sell` a nadie, porque conceder una capacidad es una decisión
 * deliberada de una persona, no un efecto secundario de cambiar un desplegable.
 */
export function clampCapabilitiesToProfile(
  commercialProfile: CommercialProfile | null,
  capabilities: { canBuy: boolean; canSell: boolean },
): { canBuy: boolean; canSell: boolean } {
  return {
    canBuy: capabilities.canBuy && organizationAllows(commercialProfile, 'buy'),
    canSell: capabilities.canSell && organizationAllows(commercialProfile, 'sell'),
  }
}

/** ¿Hay algo que retirar? Evita un UPDATE por cada miembro que ya está bien. */
export function capabilitiesExceedProfile(
  commercialProfile: CommercialProfile | null,
  capabilities: { canBuy: boolean; canSell: boolean },
): boolean {
  const recortado = clampCapabilitiesToProfile(commercialProfile, capabilities)
  return recortado.canBuy !== capabilities.canBuy || recortado.canSell !== capabilities.canSell
}

// ── Rol de plataforma ───────────────────────────────────────────────────────

export const PLATFORM_ROLES: PlatformRole[] = ['platform_admin', 'user']

export function normalizeAssignablePlatformRole(raw: unknown): PlatformRole | null {
  if (typeof raw !== 'string') return null
  return PLATFORM_ROLES.find((r) => r === raw) ?? null
}

/**
 * Cambio del rol GLOBAL de un usuario. Es la operación más delicada del panel,
 * y por eso vive en una acción propia y no en un desplegable junto al resto.
 *
 * Reglas:
 *
 *   1. solo un administrador de plataforma;
 *   2. NUNCA sobre uno mismo — ni para ascender ni para renunciar. Quien
 *      necesite dejar de ser administrador se lo pide a otro, y así siempre
 *      queda alguien que ha visto el cambio;
 *   3. no se degrada al último administrador ACTIVO. `activeAdminCount` es el
 *      total incluyendo al objetivo; si es 1 y el objetivo es ese, el sistema
 *      se quedaría sin nadie capaz de entrar en /admin.
 *
 * La tercera regla la impone además un trigger (039), que es la autoridad. Aquí
 * se repite para poder explicarla antes de intentarlo.
 */
export function evaluatePlatformRoleChange(
  actor: AdminActor,
  target: { userId: string; currentRole: PlatformRole | null; isActive: boolean },
  newRole: PlatformRole,
  activeAdminCount: number,
): AuthorizationCode | null {
  if (!actor.isPlatformAdmin) return 'FORBIDDEN'
  if (actor.userId === target.userId) return 'FORBIDDEN'

  const degrada =
    target.currentRole === 'platform_admin' && target.isActive && newRole !== 'platform_admin'

  if (degrada && activeAdminCount <= 1) return 'FORBIDDEN'
  return null
}

/** Motivo legible de una denegación de esta familia de acciones. */
export function adminActionDenialMessage(code: AuthorizationCode): string {
  switch (code) {
    case 'UNAUTHENTICATED':
      return 'Debes iniciar sesión.'
    case 'NO_ORGANIZATION':
      return 'La organización indicada no existe.'
    case 'INVALID_ROLE':
      return 'El rol seleccionado no es válido.'
    default:
      return 'No tienes permiso para realizar esta acción.'
  }
}

// ── Campos editables del perfil ─────────────────────────────────────────────

/**
 * Lo único que la administración puede cambiar de un perfil desde el formulario
 * ordinario.
 *
 * `role` y `status` NO están, y es deliberado: son los dos campos que el
 * trigger de 021 protege, y meterlos en un formulario general convertiría un
 * cambio de teléfono y una concesión de administrador en la misma operación.
 * Cada uno tiene su acción, con su confirmación.
 */
export const EDITABLE_PROFILE_FIELDS = [
  'first_name',
  'last_name',
  'phone',
  'preferred_locale',
  'preferred_currency',
  'preferred_country',
] as const

export type EditableProfileField = (typeof EDITABLE_PROFILE_FIELDS)[number]

export function isEditableProfileField(field: string): field is EditableProfileField {
  return (EDITABLE_PROFILE_FIELDS as readonly string[]).includes(field)
}

/**
 * Filtra un objeto de formulario dejando SOLO los campos editables.
 *
 * Es una allowlist, no un saneado: lo que no está en la lista se descarta sin
 * más. Así, aunque alguien añada `role: 'platform_admin'` al cuerpo de la
 * petición, nunca llega a la sentencia UPDATE.
 */
export function pickEditableProfileFields(
  raw: Record<string, unknown>,
): Partial<Record<EditableProfileField, string | null>> {
  const salida: Partial<Record<EditableProfileField, string | null>> = {}
  for (const campo of EDITABLE_PROFILE_FIELDS) {
    if (!(campo in raw)) continue
    const valor = raw[campo]
    if (valor === null || valor === undefined) {
      salida[campo] = null
      continue
    }
    if (typeof valor !== 'string') continue
    const limpio = valor.trim().replace(/\s+/g, ' ')
    salida[campo] = limpio === '' ? null : limpio
  }
  return salida
}

// ── Normalizadores reexportados para las acciones ───────────────────────────

export { normalizeMembershipStatus, normalizeOrganizationRole, normalizePlatformRole }

'use server'

// Administración de usuarios, pertenencias, roles y capacidades (Fase 039).
//
// ── Por qué un archivo nuevo y no más funciones en `users.ts` ───────────────
//
// `users.ts` es el lector del panel: listados y detalles. Aquí vive todo lo que
// ESCRIBE sobre autorización, que es lo que hay que poder auditar y revisar de
// una sentada. Mezclarlo con las consultas haría que una revisión de seguridad
// tuviera que leer trescientas líneas de `select` para encontrar los diez
// `update` que importan.
//
// ── Contrato de todas las acciones de este archivo ─────────────────────────
//
//   1. `requirePlatformAdmin('throw')` en la PRIMERA línea. No hay ninguna
//      acción que compruebe permisos a medias ni que se fíe de un parámetro.
//   2. Nada de lo que envía el navegador se usa sin revalidar: los roles y los
//      estados se normalizan contra listas cerradas, los identificadores se
//      vuelven a leer de la base antes de decidir.
//   3. La decisión la toma `lib/auth/user-admin.ts`, que es puro y está
//      probado. Aquí solo se recogen los hechos y se aplica el resultado.
//   4. La base de datos vuelve a comprobarlo todo por su cuenta (triggers de
//      021 y 023, índices únicos, RLS). Esto es la primera barrera, no la única.
//   5. Se devuelve `{ ok }` o `{ ok: false, error }` con un mensaje que se
//      pueda enseñar. Nunca SQLSTATE ni texto interno de PostgreSQL.
//   6. Toda operación que cambie autorización se registra en `admin_audit_log`.
//
// NO se usa `service_role` en ninguna escritura. El único uso del cliente
// privilegiado sigue siendo leer los correos de `auth.users` (ver `users.ts`),
// que no es accesible de otro modo y no concede nada.

import { revalidatePath } from 'next/cache'
import { requirePlatformAdmin } from '@/lib/auth/guards'
import { isAuthorizationError } from '@/lib/auth/errors'
import { writeAuditEntry } from '@/lib/audit/write'
import {
  adminActionDenialMessage,
  evaluateCapabilityChange,
  evaluateMembershipAssignment,
  evaluateMembershipRemoval,
  evaluateMembershipRoleChange,
  evaluateMembershipStatusChange,
  evaluatePlatformRoleChange,
  normalizeAssignableMembershipStatus,
  normalizeAssignableOrgRole,
  normalizeAssignablePlatformRole,
  pickEditableProfileFields,
  LEGACY_ROLE_FOR_ASSIGNABLE,
  type AdminActor,
  type AssignableMembershipStatus,
  type AssignableOrgRole,
  type MembershipTarget,
  type OrganizationFacts,
} from '@/lib/auth/user-admin'
import {
  normalizeCommercialProfile,
  normalizeMembershipStatus,
  normalizeOrganizationRole,
  normalizePlatformRole,
  type PlatformRole,
} from '@/lib/identity'
import { translateMembershipError, membershipErrorDetail } from '@/lib/auth/member-write'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { buildRecoveryRedirectUrl } from '@/lib/auth/redirect-urls'
import {
  NEW_USER_MESSAGES,
  capabilitiesExceedOrganization,
  normalizeEmail,
  normalizeName,
  normalizeNewUserOrgRole,
  normalizeNewUserPlatformRole,
  normalizePhone,
  organizationAcceptsNewMembers,
  resolveCapabilities,
  validateNewUser,
} from '@/lib/auth/new-user'

// ── Resultado ───────────────────────────────────────────────────────────────

export type AdminActionResult = { ok: true } | { ok: false; error: string }

const MESSAGES = {
  usuarioNoExiste: 'El usuario indicado no existe.',
  orgNoExiste: 'La organización indicada no existe.',
  membershipNoExiste: 'La pertenencia indicada ya no existe.',
  rolNoValido: 'El rol seleccionado no es válido.',
  estadoNoValido: 'El estado seleccionado no es válido.',
  yaEsMiembro: 'El usuario ya pertenece a esta organización.',
  generico: 'No se ha podido completar la operación.',
} as const

function fallo(error: string): AdminActionResult {
  return { ok: false, error }
}

/**
 * Envuelve una acción para que un fallo de autorización se convierta en un
 * resultado y no en una excepción sin capturar. `requirePlatformAdmin('throw')`
 * lanza `AuthorizationError`; el resto de errores inesperados se propagan,
 * porque un error de programación no debe disfrazarse de «sin permiso».
 */
async function ejecutar(
  fn: () => Promise<AdminActionResult>,
): Promise<AdminActionResult> {
  try {
    return await fn()
  } catch (e) {
    if (isAuthorizationError(e)) return fallo('No tienes permiso para realizar esta acción.')
    throw e
  }
}

function refrescar(userId?: string | null, organizationId?: string | null) {
  revalidatePath('/admin/usuarios')
  if (userId) revalidatePath(`/admin/usuarios/${userId}`)
  revalidatePath('/admin/clientes')
  if (organizationId) revalidatePath(`/admin/clientes/${organizationId}`)
}

// ── Hechos que hacen falta para decidir ─────────────────────────────────────

interface MembershipRow {
  id: string
  organization_id: string
  user_id: string
  org_role: string | null
  role: string | null
  status: string | null
  can_buy: boolean
  can_sell: boolean
}

const MEMBERSHIP_COLUMNS = 'id, organization_id, user_id, org_role, role, status, can_buy, can_sell'

/** Estado de autorización de una pertenencia, para el registro de auditoría. */
function membershipSnapshot(m: MembershipRow) {
  return {
    org_role: m.org_role,
    role: m.role,
    status: m.status,
    can_buy: m.can_buy,
    can_sell: m.can_sell,
  }
}

function toTarget(m: MembershipRow): MembershipTarget {
  return {
    userId: m.user_id,
    orgRole: normalizeOrganizationRole(m.org_role ?? m.role),
    status: normalizeMembershipStatus(m.status),
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. Asignar un usuario a una organización
// ═══════════════════════════════════════════════════════════════════════════

export interface AssignMembershipInput {
  userId: string
  organizationId: string
  role: string
  canBuy?: boolean
  canSell?: boolean
}

/**
 * Da de alta una pertenencia.
 *
 * Es la acción que el cliente pedía: «quiero poder asignar una cuenta existente
 * a una organización».
 *
 * ── Idempotencia ───────────────────────────────────────────────────────────
 *
 * Si el usuario YA pertenece a esa organización no se crea una segunda fila —el
 * índice único lo impediría igualmente— y se devuelve un mensaje claro en lugar
 * de un error de restricción. Si la pertenencia existía DESACTIVADA, tampoco se
 * reactiva en silencio: reactivar es una decisión distinta y tiene su propia
 * acción, así que se dice dónde está.
 */
export async function assignUserToOrganization(
  input: AssignMembershipInput,
): Promise<AdminActionResult> {
  return ejecutar(async () => {
    const { supabase, userId: actorId } = await requirePlatformAdmin('throw')

    const rol = normalizeAssignableOrgRole(input.role)
    if (!rol) return fallo(MESSAGES.rolNoValido)

    const canBuy = input.canBuy === true
    const canSell = input.canSell === true

    // Los identificadores se vuelven a leer de la base. Que el navegador los
    // mande no significa que existan ni que quien los manda pueda verlos.
    const [{ data: perfil }, { data: org }] = await Promise.all([
      supabase.from('profiles').select('id').eq('id', input.userId).maybeSingle(),
      supabase
        .from('organizations')
        .select('id, commercial_profile')
        .eq('id', input.organizationId)
        .maybeSingle(),
    ])

    if (!perfil) return fallo(MESSAGES.usuarioNoExiste)
    if (!org) return fallo(MESSAGES.orgNoExiste)

    const { data: existente } = await supabase
      .from('organization_members')
      .select('id, status')
      .eq('organization_id', input.organizationId)
      .eq('user_id', input.userId)
      .maybeSingle()

    if (existente) {
      return fallo(
        existente.status === 'active'
          ? MESSAGES.yaEsMiembro
          : 'El usuario ya tiene una pertenencia desactivada en esta organización. Reactívala en lugar de crear otra.',
      )
    }

    const { data: owner } = await supabase
      .from('organization_members')
      .select('id')
      .eq('organization_id', input.organizationId)
      .eq('org_role', 'owner')
      .maybeSingle()

    const hechos: OrganizationFacts = {
      commercialProfile: normalizeCommercialProfile(org.commercial_profile),
      hasOwner: !!owner,
    }

    const actor: AdminActor = { userId: actorId, isPlatformAdmin: true }
    const denegado = evaluateMembershipAssignment(actor, input.userId, rol, hechos, {
      canBuy,
      canSell,
    })
    if (denegado) {
      if (rol === 'owner' && hechos.hasOwner) {
        return fallo('La organización ya tiene un propietario.')
      }
      if (actor.userId === input.userId) {
        return fallo('No puedes asignarte a ti mismo a una organización.')
      }
      return fallo('La organización no admite esa capacidad comercial.')
    }

    // Escritura DUAL y explícita: `org_role` y `role` van siempre juntos, y
    // ningún campo de autorización queda a merced de un default.
    const { error } = await supabase.from('organization_members').insert({
      organization_id: input.organizationId,
      user_id: input.userId,
      org_role: rol,
      role: LEGACY_ROLE_FOR_ASSIGNABLE[rol],
      status: 'active',
      can_buy: canBuy,
      can_sell: canSell,
      invited_by: actorId,
    })

    if (error) {
      console.error(membershipErrorDetail('asignación de usuario', error))
      return fallo(translateMembershipError(error))
    }

    await writeAuditEntry(supabase, {
      actorId,
      action: 'membership.created',
      targetUserId: input.userId,
      targetOrganizationId: input.organizationId,
      before: null,
      after: { org_role: rol, status: 'active', can_buy: canBuy, can_sell: canSell },
    })

    refrescar(input.userId, input.organizationId)
    return { ok: true }
  })
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. Rol dentro de la organización
// ═══════════════════════════════════════════════════════════════════════════

export async function updateMembershipRole(
  membershipId: string,
  role: string,
): Promise<AdminActionResult> {
  return ejecutar(async () => {
    const { supabase, userId: actorId } = await requirePlatformAdmin('throw')

    const rol = normalizeAssignableOrgRole(role)
    if (!rol) return fallo(MESSAGES.rolNoValido)

    const { data: m } = await supabase
      .from('organization_members')
      .select(MEMBERSHIP_COLUMNS)
      .eq('id', membershipId)
      .maybeSingle<MembershipRow>()

    if (!m) return fallo(MESSAGES.membershipNoExiste)

    const { data: owner } = await supabase
      .from('organization_members')
      .select('id')
      .eq('organization_id', m.organization_id)
      .eq('org_role', 'owner')
      .maybeSingle()

    const actor: AdminActor = { userId: actorId, isPlatformAdmin: true }
    const target = toTarget(m)
    const denegado = evaluateMembershipRoleChange(actor, target, rol, {
      commercialProfile: null,
      hasOwner: !!owner,
    })

    if (denegado) {
      if (target.orgRole === 'owner') {
        return fallo('El propietario no puede cambiar de rol desde esta acción.')
      }
      if (actor.userId === target.userId) {
        return fallo('No puedes modificar tu propia pertenencia.')
      }
      return fallo('La organización ya tiene un propietario.')
    }

    const antes = membershipSnapshot(m)

    const { error } = await supabase
      .from('organization_members')
      .update({ org_role: rol, role: LEGACY_ROLE_FOR_ASSIGNABLE[rol] })
      .eq('id', membershipId)

    if (error) {
      console.error(membershipErrorDetail('cambio de rol', error))
      return fallo(translateMembershipError(error))
    }

    await writeAuditEntry(supabase, {
      actorId,
      action: 'membership.role_changed',
      targetUserId: m.user_id,
      targetOrganizationId: m.organization_id,
      before: antes,
      after: { ...antes, org_role: rol, role: LEGACY_ROLE_FOR_ASSIGNABLE[rol] },
    })

    refrescar(m.user_id, m.organization_id)
    return { ok: true }
  })
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. Estado de la pertenencia
// ═══════════════════════════════════════════════════════════════════════════

export async function updateMembershipStatus(
  membershipId: string,
  status: string,
): Promise<AdminActionResult> {
  return ejecutar(async () => {
    const { supabase, userId: actorId } = await requirePlatformAdmin('throw')

    const estado = normalizeAssignableMembershipStatus(status)
    if (!estado) return fallo(MESSAGES.estadoNoValido)

    const { data: m } = await supabase
      .from('organization_members')
      .select(MEMBERSHIP_COLUMNS)
      .eq('id', membershipId)
      .maybeSingle<MembershipRow>()

    if (!m) return fallo(MESSAGES.membershipNoExiste)

    const actor: AdminActor = { userId: actorId, isPlatformAdmin: true }
    const target = toTarget(m)
    const denegado = evaluateMembershipStatusChange(actor, target, estado)

    if (denegado) {
      if (target.orgRole === 'owner') {
        return fallo(
          'No se puede desactivar al propietario: la organización se quedaría sin propietario activo.',
        )
      }
      return fallo('No puedes modificar tu propia pertenencia.')
    }

    const antes = membershipSnapshot(m)

    const { error } = await supabase
      .from('organization_members')
      .update({ status: estado })
      .eq('id', membershipId)

    if (error) {
      console.error(membershipErrorDetail('cambio de estado de pertenencia', error))
      return fallo(translateMembershipError(error))
    }

    await writeAuditEntry(supabase, {
      actorId,
      action: 'membership.status_changed',
      targetUserId: m.user_id,
      targetOrganizationId: m.organization_id,
      before: antes,
      after: { ...antes, status: estado },
    })

    refrescar(m.user_id, m.organization_id)
    return { ok: true }
  })
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. Capacidades comerciales
// ═══════════════════════════════════════════════════════════════════════════

export async function updateMembershipCapabilities(
  membershipId: string,
  capabilities: { canBuy: boolean; canSell: boolean },
): Promise<AdminActionResult> {
  return ejecutar(async () => {
    const { supabase, userId: actorId } = await requirePlatformAdmin('throw')

    const canBuy = capabilities.canBuy === true
    const canSell = capabilities.canSell === true

    const { data: m } = await supabase
      .from('organization_members')
      .select(MEMBERSHIP_COLUMNS)
      .eq('id', membershipId)
      .maybeSingle<MembershipRow>()

    if (!m) return fallo(MESSAGES.membershipNoExiste)

    const { data: org } = await supabase
      .from('organizations')
      .select('commercial_profile')
      .eq('id', m.organization_id)
      .maybeSingle()

    const hechos: OrganizationFacts = {
      commercialProfile: normalizeCommercialProfile(org?.commercial_profile),
      hasOwner: true, // irrelevante para esta decisión
    }

    const actor: AdminActor = { userId: actorId, isPlatformAdmin: true }
    const denegado = evaluateCapabilityChange(actor, toTarget(m), hechos, { canBuy, canSell })

    if (denegado) {
      if (actor.userId === m.user_id) return fallo('No puedes modificar tu propia pertenencia.')
      return fallo(
        'La organización no admite esa capacidad comercial. Cambia antes su perfil comercial.',
      )
    }

    const antes = membershipSnapshot(m)

    const { error } = await supabase
      .from('organization_members')
      .update({ can_buy: canBuy, can_sell: canSell })
      .eq('id', membershipId)

    if (error) {
      console.error(membershipErrorDetail('cambio de capacidades', error))
      return fallo(translateMembershipError(error))
    }

    await writeAuditEntry(supabase, {
      actorId,
      action: 'membership.capabilities_changed',
      targetUserId: m.user_id,
      targetOrganizationId: m.organization_id,
      before: antes,
      after: { ...antes, can_buy: canBuy, can_sell: canSell },
    })

    refrescar(m.user_id, m.organization_id)
    return { ok: true }
  })
}

// ═══════════════════════════════════════════════════════════════════════════
// 5. Retirar la pertenencia
// ═══════════════════════════════════════════════════════════════════════════

export async function removeMembership(membershipId: string): Promise<AdminActionResult> {
  return ejecutar(async () => {
    const { supabase, userId: actorId } = await requirePlatformAdmin('throw')

    const { data: m } = await supabase
      .from('organization_members')
      .select(MEMBERSHIP_COLUMNS)
      .eq('id', membershipId)
      .maybeSingle<MembershipRow>()

    if (!m) return fallo(MESSAGES.membershipNoExiste)

    const actor: AdminActor = { userId: actorId, isPlatformAdmin: true }
    const target = toTarget(m)
    const denegado = evaluateMembershipRemoval(actor, target)

    if (denegado) {
      if (target.orgRole === 'owner') {
        return fallo(
          'No se puede retirar al propietario: la organización se quedaría sin ninguno.',
        )
      }
      return fallo('No puedes retirar tu propia pertenencia.')
    }

    const antes = membershipSnapshot(m)

    const { error } = await supabase.from('organization_members').delete().eq('id', membershipId)

    if (error) {
      console.error(membershipErrorDetail('retirada de pertenencia', error))
      return fallo(translateMembershipError(error))
    }

    await writeAuditEntry(supabase, {
      actorId,
      action: 'membership.removed',
      targetUserId: m.user_id,
      targetOrganizationId: m.organization_id,
      before: antes,
      after: null,
    })

    refrescar(m.user_id, m.organization_id)
    return { ok: true }
  })
}

// ═══════════════════════════════════════════════════════════════════════════
// 6. Datos del perfil
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Modifica los datos NO privilegiados de un perfil.
 *
 * `role` y `status` no se pueden tocar desde aquí aunque vengan en el objeto:
 * `pickEditableProfileFields` es una allowlist y los descarta antes del UPDATE.
 * Cada uno tiene su acción propia, con su confirmación.
 */
export async function updateUserProfileFields(
  userId: string,
  fields: Record<string, unknown>,
): Promise<AdminActionResult> {
  return ejecutar(async () => {
    const { supabase, userId: actorId } = await requirePlatformAdmin('throw')

    const cambios = pickEditableProfileFields(fields)
    if (Object.keys(cambios).length === 0) return fallo('No hay ningún cambio que guardar.')

    const { data: antes } = await supabase
      .from('profiles')
      .select('first_name, last_name, phone, preferred_locale, preferred_currency, preferred_country')
      .eq('id', userId)
      .maybeSingle()

    if (!antes) return fallo(MESSAGES.usuarioNoExiste)

    const { error } = await supabase.from('profiles').update(cambios).eq('id', userId)

    if (error) {
      console.error(`[user-admin] actualización de perfil falló: ${error.code ?? '?'} ${error.message}`)
      return fallo(MESSAGES.generico)
    }

    await writeAuditEntry(supabase, {
      actorId,
      action: 'profile.updated',
      targetUserId: userId,
      before: antes,
      after: { ...antes, ...cambios },
    })

    refrescar(userId)
    return { ok: true }
  })
}

// ═══════════════════════════════════════════════════════════════════════════
// 7. Rol de PLATAFORMA — acción separada y reforzada
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Concede o retira `platform_admin`.
 *
 * ── Por qué no está en el desplegable de rol de organización ────────────────
 *
 * Porque no es un rol de empresa. `platform_admin` da acceso al panel de MIRA
 * —a TODOS los clientes, a todos los precios y a la exportación de
 * proveedores—, y ofrecerlo en la misma lista que «Miembro» hace inevitable
 * concederlo por error algún día.
 *
 * ── Protecciones ───────────────────────────────────────────────────────────
 *
 *   · solo otro `platform_admin` puede ejecutarla;
 *   · nunca sobre uno mismo, ni para ascender ni para renunciar: así siempre
 *     hay una segunda persona que ha visto el cambio;
 *   · no se degrada al último administrador ACTIVO — el trigger de 039 lo
 *     rechaza también, y esta comprobación existe para poder explicarlo antes
 *     de intentarlo;
 *   · queda registrado en la auditoría.
 */
export async function setUserPlatformRole(
  userId: string,
  role: string,
): Promise<AdminActionResult> {
  return ejecutar(async () => {
    const { supabase, userId: actorId } = await requirePlatformAdmin('throw')

    const nuevo = normalizeAssignablePlatformRole(role)
    if (!nuevo) return fallo(MESSAGES.rolNoValido)

    const { data: perfil } = await supabase
      .from('profiles')
      .select('id, role, status')
      .eq('id', userId)
      .maybeSingle()

    if (!perfil) return fallo(MESSAGES.usuarioNoExiste)

    const actual: PlatformRole | null = normalizePlatformRole(perfil.role)
    if (actual === nuevo) return fallo('El usuario ya tiene ese rol de plataforma.')

    // Recuento de administradores ACTIVOS, incluido el objetivo. `head: true`
    // no trae filas: solo el total.
    const { count } = await supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'platform_admin')
      .eq('status', 'active')

    const actor: AdminActor = { userId: actorId, isPlatformAdmin: true }
    const denegado = evaluatePlatformRoleChange(
      actor,
      { userId, currentRole: actual, isActive: perfil.status === 'active' },
      nuevo,
      count ?? 0,
    )

    if (denegado) {
      if (actorId === userId) {
        return fallo(
          'No puedes cambiar tu propio rol de plataforma. Pídeselo a otro administrador.',
        )
      }
      return fallo(
        'No se puede degradar al último administrador de plataforma activo: nadie podría volver a entrar en el panel.',
      )
    }

    const { error } = await supabase.from('profiles').update({ role: nuevo }).eq('id', userId)

    if (error) {
      console.error(`[user-admin] cambio de rol de plataforma falló: ${error.code ?? '?'} ${error.message}`)
      // El trigger de 039 usa 23514 para el último administrador.
      if (error.code === '23514') {
        return fallo('No se puede degradar al último administrador de plataforma activo.')
      }
      return fallo(adminActionDenialMessage('FORBIDDEN'))
    }

    await writeAuditEntry(supabase, {
      actorId,
      action: 'profile.platform_role_changed',
      targetUserId: userId,
      before: { role: perfil.role },
      after: { role: nuevo },
    })

    refrescar(userId)
    return { ok: true }
  })
}

// ═══════════════════════════════════════════════════════════════════════════
// 8. Estado del perfil
// ═══════════════════════════════════════════════════════════════════════════

const PROFILE_STATUSES_ASSIGNABLE = ['active', 'suspended'] as const

export async function setUserProfileStatus(
  userId: string,
  status: string,
): Promise<AdminActionResult> {
  return ejecutar(async () => {
    const { supabase, userId: actorId } = await requirePlatformAdmin('throw')

    if (!(PROFILE_STATUSES_ASSIGNABLE as readonly string[]).includes(status)) {
      return fallo(MESSAGES.estadoNoValido)
    }
    if (actorId === userId) {
      return fallo('No puedes cambiar tu propio estado. Pídeselo a otro administrador.')
    }

    const { data: perfil } = await supabase
      .from('profiles')
      .select('id, role, status')
      .eq('id', userId)
      .maybeSingle()

    if (!perfil) return fallo(MESSAGES.usuarioNoExiste)
    if (perfil.status === status) return fallo('El usuario ya está en ese estado.')

    const { error } = await supabase.from('profiles').update({ status }).eq('id', userId)

    if (error) {
      console.error(`[user-admin] cambio de estado de perfil falló: ${error.code ?? '?'} ${error.message}`)
      if (error.code === '23514') {
        return fallo('No se puede suspender al último administrador de plataforma activo.')
      }
      return fallo(MESSAGES.generico)
    }

    await writeAuditEntry(supabase, {
      actorId,
      action: 'profile.status_changed',
      targetUserId: userId,
      before: { status: perfil.status },
      after: { status },
    })

    refrescar(userId)
    return { ok: true }
  })
}

// Reexport de tipos que la interfaz necesita tipar sin importar el módulo puro.
export type { AssignableOrgRole, AssignableMembershipStatus }

// ═══════════════════════════════════════════════════════════════════════════
// ALTA ADMINISTRATIVA DE USUARIOS  ·  crear e invitar
// ═══════════════════════════════════════════════════════════════════════════

export interface CreateAndInviteUserInput {
  firstName: string
  lastName?: string | null
  email: string
  phone?: string | null
  platformRole: string
  organizationId?: string | null
  orgRole?: string | null
  canBuy?: boolean
  canSell?: boolean
}

export type CreateAndInviteUserResult =
  | { ok: true; userId: string; warning?: string }
  | { ok: false; error: string }

/**
 * Crea una cuenta y le envía la invitación de Supabase.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ORDEN DE ESCRITURA, Y POR QUÉ ES ESTE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Auth y PostgreSQL son dos sistemas distintos: NO existe una transacción que
 * abarque a los dos. Da igual cómo se ordene, siempre hay una ventana. Lo que
 * sí se puede elegir es DÓNDE cae esa ventana y qué queda si se cae dentro.
 *
 *   1. autorizar                     ─┐
 *   2. validar la forma de la entrada │ nada escrito todavía:
 *   3. leer y validar la organización │ un fallo aquí no deja rastro
 *   4. comprobar duplicado de correo ─┘
 *   ────────────────────────────────────────────────────────────────────────
 *   5. invitar  → Supabase crea auth.users, el trigger `on_auth_user_created`
 *                 crea `profiles` en la MISMA transacción, y sale el correo
 *   6. completar el perfil (teléfono, rol de plataforma)
 *   7. crear la pertenencia
 *   8. auditar
 *
 * Todo lo que puede fallar por datos ocurre ANTES del paso 5. A partir de ahí
 * solo quedan fallos de infraestructura.
 *
 * ── Qué pasa si algo falla después del paso 5 ────────────────────────────
 *
 * Falla el paso 6 → la cuenta existe y puede entrar; le falta el teléfono o
 *                   sigue siendo `user` en vez de administrador. Se AVISA al
 *                   administrador con el detalle y se arregla desde la ficha.
 *
 * Falla el paso 7 → la cuenta existe, sin organización. Se AVISA, y se arregla
 *                   con «Asignar a organización», que ya existe. Es el estado
 *                   parcial menos malo posible: la persona puede entrar, y lo
 *                   que falta se ve en su ficha.
 *
 * En los dos casos el resultado es `ok: true` CON `warning`, no un éxito
 * silencioso ni un error que haga pensar que no se ha creado nada — eso llevaría
 * a reintentar y a chocar contra el duplicado.
 *
 * ── Por qué NO se borra la cuenta para compensar ─────────────────────────
 *
 * Porque el correo de invitación YA HA SALIDO en el paso 5: `inviteUserByEmail`
 * crea y envía en la misma llamada. Borrar la cuenta dejaría un enlace vivo
 * apuntando a un usuario inexistente, y a alguien con un correo que dice que
 * tiene acceso a MIRA cuando no lo tiene. Un borrado automático es además la
 * clase de operación que, con un fallo de lógica, acaba borrando cuentas
 * legítimas. Se prefiere un estado parcial VISIBLE y reparable a uno destruido.
 *
 * ── Por qué la invitación no puede fallar «a medias» ─────────────────────
 *
 * `inviteUserByEmail` crea el usuario Y manda el correo. Si el correo no sale,
 * la llamada devuelve error y NO hay usuario: no existe el caso «cuenta creada
 * sin invitación». Por eso el envío está en el paso 5 y no al final.
 *
 * ── El cliente privilegiado ──────────────────────────────────────────────
 *
 * `createSupabaseAdminClient()` usa `SUPABASE_SERVICE_ROLE_KEY`, sin prefijo
 * `NEXT_PUBLIC_`, así que Next no la incrusta en ningún bundle del navegador.
 * Este archivo es `'use server'` y ningún componente cliente lo referencia. El
 * cliente se crea DENTRO de la función, después de autorizar, y no se devuelve.
 * Su único cometido es dar de alta en Auth: el perfil y la pertenencia se
 * escriben con el cliente NORMAL, sujeto a RLS.
 */
export async function createAndInviteUser(
  input: CreateAndInviteUserInput,
): Promise<CreateAndInviteUserResult> {
  try {
    // ── 1. Autorización ────────────────────────────────────────────────
    const { supabase, userId: actorId } = await requirePlatformAdmin('throw')

    // ── 2. Forma de la entrada ─────────────────────────────────────────
    const platformRole = normalizeNewUserPlatformRole(input.platformRole)
    if (!platformRole) return { ok: false, error: NEW_USER_MESSAGES.rolPlataforma }

    const organizationId = input.organizationId?.trim() || null
    const orgRole = organizationId ? normalizeNewUserOrgRole(input.orgRole) : null

    const fallo = validateNewUser({
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      phone: input.phone,
      platformRole,
      organizationId,
      orgRole,
    })
    if (fallo) return { ok: false, error: fallo }

    const email = normalizeEmail(input.email)
    const firstName = normalizeName(input.firstName)!
    const lastName = normalizeName(input.lastName)
    const phone = normalizePhone(input.phone)

    // ── 3. La organización, contra la BASE ─────────────────────────────
    //
    // El `organization_id` llega del formulario, así que aquí no se da NADA por
    // bueno: se relee la fila, se comprueba que existe, que su estado admite
    // miembros y que el perfil comercial soporta las capacidades pedidas. Un
    // identificador manipulado no encuentra fila y se rechaza.
    let capacidades = { canBuy: false, canSell: false }
    let organizationName: string | null = null

    if (organizationId) {
      const { data: org } = await supabase
        .from('organizations')
        .select('id, name, status, commercial_profile')
        .eq('id', organizationId)
        .maybeSingle()

      if (!org) return { ok: false, error: NEW_USER_MESSAGES.orgNoExiste }
      if (!organizationAcceptsNewMembers(org.status as string | null)) {
        return { ok: false, error: NEW_USER_MESSAGES.orgNoAdmite }
      }

      const perfil = normalizeCommercialProfile(org.commercial_profile)

      // Se pide algo que el perfil no permite → se FALLA, no se recorta en
      // silencio: quien marcó la casilla tiene que enterarse.
      if (capabilitiesExceedOrganization(perfil, input)) {
        return { ok: false, error: NEW_USER_MESSAGES.capacidad }
      }

      capacidades = resolveCapabilities(perfil, input)
      organizationName = org.name as string
    }

    // ── 4. ¿Existe ya esa cuenta? ──────────────────────────────────────
    //
    // Antes de crear nada. La RPC de 045 hace una búsqueda EXACTA por correo
    // completo y solo responde a un administrador: no es una vía de enumeración.
    const { data: existentes, error: errorBusqueda } = await supabase.rpc(
      'admin_find_user_by_email',
      { p_email: email },
    )

    if (errorBusqueda) {
      console.error(
        `[user-admin] la búsqueda por correo falló: ${errorBusqueda.code ?? '?'} ${errorBusqueda.message}`,
      )
      return { ok: false, error: NEW_USER_MESSAGES.generico }
    }

    const existente = Array.isArray(existentes) ? existentes[0] : null

    if (existente?.user_id) {
      // No se reutiliza la cuenta en silencio: se dice que ya existe y cuál es
      // el camino correcto, que es el flujo de asignación que ya hay.
      if (!organizationId) {
        return { ok: false, error: NEW_USER_MESSAGES.yaExiste }
      }

      const { data: pertenencia } = await supabase
        .from('organization_members')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('user_id', existente.user_id as string)
        .maybeSingle()

      return {
        ok: false,
        error: pertenencia
          ? `${NEW_USER_MESSAGES.yaExiste} Además, esa persona ya pertenece a ${organizationName}.`
          : `${NEW_USER_MESSAGES.yaExiste} Para añadirla a ${organizationName}, usa «Asignar a organización» desde su ficha.`,
      }
    }

    // ══ A partir de aquí SÍ se escribe ═════════════════════════════════

    // ── 5. Invitar. Crea la cuenta, el perfil (trigger) y manda el correo ──
    //
    // `redirectTo` sale del helper que se corrigió en el hotfix de Auth: valida
    // el host y devuelve `null` si la base no es utilizable, en cuyo caso se
    // omite y Supabase usa su Site URL. Nunca puede colarse `0.0.0.0` ni
    // `localhost` en producción.
    //
    // El destino es el mismo que el de recuperación de contraseña
    // (`/auth/callback?next=/actualizar-password`): la persona invitada tiene
    // que ESTABLECER su contraseña, que es exactamente lo que hace esa página.
    const redirectTo = buildRecoveryRedirectUrl(process.env.NEXT_PUBLIC_APP_URL)

    const admin = await createSupabaseAdminClient()
    const { data: invitado, error: errorInvitacion } = await admin.auth.admin.inviteUserByEmail(
      email,
      {
        // `first_name` y `last_name` los lee el trigger `handle_new_user` para
        // rellenar el perfil en la misma transacción que crea la cuenta.
        data: { first_name: firstName, last_name: lastName },
        ...(redirectTo ? { redirectTo } : {}),
      },
    )

    if (errorInvitacion || !invitado?.user?.id) {
      // Puede ser un correo ya registrado que la búsqueda no vio —una cuenta de
      // Auth sin perfil, que no debería existir pero no es imposible—, o un
      // fallo del servicio. No se filtra el mensaje del proveedor.
      console.error(
        `[user-admin] la invitación falló: ${errorInvitacion?.name ?? 'sin nombre'} ` +
          `${errorInvitacion?.status ?? ''} ${errorInvitacion?.message ?? ''} · admin=${actorId}`,
      )
      return {
        ok: false,
        error:
          errorInvitacion?.status === 422
            ? NEW_USER_MESSAGES.yaExiste
            : 'No se ha podido enviar la invitación. Comprueba el correo e inténtalo de nuevo.',
      }
    }

    const nuevoUserId = invitado.user.id
    const avisos: string[] = []

    // ── 6. Completar el perfil ─────────────────────────────────────────
    //
    // El trigger ya ha creado la fila con el nombre y `role = 'client_member'`,
    // que `normalizePlatformRole` interpreta como «Usuario». Aquí se fija el rol
    // de forma explícita —para que el dato no dependa de un valor heredado— y se
    // guarda el teléfono, que el trigger no conoce.
    const { error: errorPerfil } = await supabase
      .from('profiles')
      .update({ phone, role: platformRole, status: 'active' })
      .eq('id', nuevoUserId)

    if (errorPerfil) {
      console.error(
        `[user-admin] la cuenta ${nuevoUserId} se creó pero su perfil no se completó: ` +
          `${errorPerfil.code ?? '?'} ${errorPerfil.message} · admin=${actorId}`,
      )
      avisos.push('no se pudieron guardar todos los datos del perfil')
    }

    // ── 7. Pertenencia ─────────────────────────────────────────────────
    if (organizationId && orgRole) {
      const { error: errorMiembro } = await supabase.from('organization_members').insert({
        organization_id: organizationId,
        user_id: nuevoUserId,
        org_role: orgRole,
        role: LEGACY_ROLE_FOR_ASSIGNABLE[orgRole],
        status: 'active',
        can_buy: capacidades.canBuy,
        can_sell: capacidades.canSell,
        invited_by: actorId,
      })

      if (errorMiembro) {
        console.error(
          `${membershipErrorDetail('alta de usuario nuevo', errorMiembro)} · ` +
            `cuenta ${nuevoUserId} creada SIN organización, requiere asignación manual · admin=${actorId}`,
        )
        avisos.push(
          `no se pudo asignar a ${organizationName}. Hazlo desde su ficha con «Asignar a organización»`,
        )
      }
    }

    // ── 8. Auditoría ───────────────────────────────────────────────────
    //
    // Sin correo, sin teléfono y sin nada que no haga falta para responder a
    // «¿quién creó esta cuenta, cuándo y con qué permisos?».
    await writeAuditEntry(supabase, {
      actorId,
      action: 'user.invited',
      targetUserId: nuevoUserId,
      targetOrganizationId: organizationId,
      before: null,
      after: {
        platform_role: platformRole,
        profile_status: 'active',
        org_role: orgRole,
        can_buy: capacidades.canBuy,
        can_sell: capacidades.canSell,
        invited: true,
      },
    })

    refrescar(nuevoUserId, organizationId)

    return avisos.length > 0
      ? { ok: true, userId: nuevoUserId, warning: `La invitación se envió, pero ${avisos.join(' y ')}.` }
      : { ok: true, userId: nuevoUserId }
  } catch (e) {
    if (isAuthorizationError(e)) return { ok: false, error: NEW_USER_MESSAGES.permiso }
    throw e
  }
}

'use server'

// Gestión del equipo desde el PORTAL DE CLIENTE (Bloque 1).
//
// ── Por qué un archivo aparte de `actions/user-admin.ts` ───────────────────
//
// Porque el actor es distinto y las reglas también. `user-admin.ts` lo usa
// `platform_admin` sobre CUALQUIER organización; esto lo usa una persona de la
// empresa sobre la SUYA. Mezclarlos obligaría a que cada función decidiera a
// mitad de cuerpo con qué sombrero está actuando, que es justo el error que
// produce los agujeros de autorización.
//
// ── Contrato de todas las acciones de este archivo ─────────────────────────
//
//   1. `requireMembership()` en la PRIMERA línea: sesión, pertenencia ACTIVA y
//      organización ACTIVA. Es el mismo criterio que `is_org_member(uuid)`.
//   2. La pertenencia objetivo se RELEE de la base y se comprueba que pertenece
//      a la organización del actor. Nada que venga del navegador se usa para
//      decidir: el `membershipId` es un dato, no una autorización.
//   3. La decisión la toma `lib/auth/team.ts`, que es puro y está probado.
//   4. La base de datos vuelve a comprobarlo TODO por su cuenta: las policies
//      `members_admin_*` exigen `is_org_admin(organization_id)` y el trigger
//      `enforce_membership_rules` (023) impone las invariantes del propietario,
//      la coherencia rol/legacy y el techo comercial. Esto es la primera
//      barrera, nunca la única.
//   5. Se devuelve `{ ok }` o `{ ok: false, error }` con un mensaje mostrable.
//      Nunca SQLSTATE ni texto interno de PostgreSQL.
//
// NO se usa `service_role` en NINGUNA escritura de este archivo. Las
// modificaciones viajan por el cliente normal, sujetas a RLS.
//
// ── Qué NO hay aquí, y por qué ─────────────────────────────────────────────
//
// Alta de miembros. Dar de alta exige resolver un correo a un usuario, y un
// cliente no puede leer `auth.users`; hacerlo con `service_role` desde una
// acción del portal convertiría el formulario en un oráculo de enumeración de
// cuentas («ese correo existe / no existe»). Mientras no haya un flujo de
// invitación real —que necesita envío de correo, y eso es otro bloque—, el alta
// sigue en el panel de MIRA. La pantalla lo dice en lugar de ofrecer un botón
// que no puede funcionar.

import { revalidatePath } from 'next/cache'
import { requireMembership } from '@/lib/auth/guards'
import { isAuthorizationError } from '@/lib/auth/errors'
import {
  TEAM_MESSAGES,
  canManageTeam,
  evaluateMemberCapabilityChange,
  evaluateMemberStatusChange,
  evaluateMemberUpdate,
  evaluateMemberRemoval,
  teamDenialMessage,
  type AssignableTeamStatus,
  type TeamActor,
  type TeamTarget,
} from '@/lib/auth/team'
import {
  buildMembershipRoleUpdate,
  membershipErrorDetail,
  normalizeManageableRole,
  translateMembershipError,
} from '@/lib/auth/member-write'
import { normalizeOrganizationRole } from '@/lib/identity'

export type TeamActionResult = { ok: true } | { ok: false; error: string }

function fallo(error: string): TeamActionResult {
  return { ok: false, error }
}

/**
 * Convierte un fallo de autorización en un resultado en vez de una excepción
 * sin capturar. `requireMembership` lanza `AuthorizationError`; cualquier otro
 * error se propaga, porque un fallo de programación no debe disfrazarse de
 * «no tienes permiso».
 */
async function ejecutar(fn: () => Promise<TeamActionResult>): Promise<TeamActionResult> {
  try {
    return await fn()
  } catch (e) {
    if (isAuthorizationError(e)) return fallo(TEAM_MESSAGES.sinPermiso)
    throw e
  }
}

function refrescar() {
  revalidatePath('/app/mi-organizacion')
  revalidatePath('/app/mi-organizacion/equipo')
}

interface MembershipRow {
  id: string
  organization_id: string
  user_id: string
  org_role: string | null
  role: string | null
  status: string | null
  can_buy: boolean | null
  can_sell: boolean | null
}

const MEMBERSHIP_COLUMNS = 'id, organization_id, user_id, org_role, role, status, can_buy, can_sell'

function toTarget(m: MembershipRow): TeamTarget {
  return {
    userId: m.user_id,
    orgRole: normalizeOrganizationRole(m.org_role ?? m.role),
  }
}

interface Contexto {
  supabase: Awaited<ReturnType<typeof requireMembership>>['supabase']
  actor: TeamActor
  membership: Awaited<ReturnType<typeof requireMembership>>['membership']
  target: MembershipRow
}

/**
 * Carga común a todas las acciones: autoriza al actor y resuelve la pertenencia
 * objetivo COMPROBANDO que es de su misma organización.
 *
 * ── La comprobación que evita el IDOR ──────────────────────────────────────
 *
 * `.eq('organization_id', membership.organizationId)` no es redundante con RLS:
 * es lo que hace que un identificador de otra empresa devuelva «ya no
 * pertenece» en lugar de llegar al UPDATE y depender de que la policy lo pare.
 * Las dos barreras existen a propósito; si un día alguien relajara la policy,
 * esta seguiría cerrada.
 */
async function cargar(membershipId: string): Promise<Contexto | TeamActionResult> {
  const id = typeof membershipId === 'string' ? membershipId.trim() : ''
  if (!id) return fallo(TEAM_MESSAGES.sinMiembro)

  const { supabase, context, membership } = await requireMembership()

  const actor: TeamActor = {
    userId: context.user.id,
    orgRole: membership.orgRole,
    // Deliberadamente `false`: esta es la superficie del cliente. Un
    // `platform_admin` que además fuera miembro NO obtiene aquí sus privilegios
    // de plataforma; para eso está /admin, donde la operación queda auditada.
    isPlatformAdmin: false,
  }

  // Puerta temprana: quien no gestiona equipo no avanza ni un paso más. Cada
  // acción vuelve a decidir después con la regla concreta —y RLS y el trigger
  // por debajo—, pero cortar aquí evita que un `member` llegue siquiera a
  // consultar la fila que pretende cambiar.
  if (!canManageTeam(actor)) return fallo(TEAM_MESSAGES.soloOwnerAdmin)

  const { data: target } = await supabase
    .from('organization_members')
    .select(MEMBERSHIP_COLUMNS)
    .eq('id', id)
    .eq('organization_id', membership.organizationId)
    .maybeSingle<MembershipRow>()

  if (!target) return fallo(TEAM_MESSAGES.sinMiembro)

  return { supabase, actor, membership, target }
}

function esResultado(v: Contexto | TeamActionResult): v is TeamActionResult {
  return 'ok' in v
}

// ═══════════════════════════════════════════════════════════════════════════
// 1. Rol dentro de la organización
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Cambia el rol de un miembro entre `admin` y `member`.
 *
 * `owner` NO es asignable: la propiedad no se crea ni se transfiere desde el
 * portal de cliente. `normalizeManageableRole` lo rechaza, y el trigger de 023
 * lo rechazaría igualmente.
 */
export async function updateTeamMemberRole(
  membershipId: string,
  role: string,
): Promise<TeamActionResult> {
  return ejecutar(async () => {
    const cargado = await cargar(membershipId)
    if (esResultado(cargado)) return cargado
    const { supabase, actor, target } = cargado

    const nuevoRol = normalizeManageableRole(role)
    if (!nuevoRol) return fallo(TEAM_MESSAGES.rolNoValido)

    const objetivo = toTarget(target)
    const denegado = evaluateMemberUpdate(actor, objetivo, nuevoRol)
    if (denegado) {
      // Caso propio: solo el propietario concede el rol de administrador.
      if (nuevoRol === 'admin' && actor.orgRole !== 'owner' && objetivo.orgRole !== 'admin') {
        return fallo(TEAM_MESSAGES.soloOwnerConcedeAdmin)
      }
      return fallo(teamDenialMessage(denegado, { actor, target: objetivo }))
    }

    // Canónico y legacy SIEMPRE juntos: el trigger rechaza una fila incoherente.
    const { error } = await supabase
      .from('organization_members')
      .update(buildMembershipRoleUpdate(nuevoRol))
      .eq('id', target.id)

    if (error) {
      console.error(membershipErrorDetail('cambio de rol (portal cliente)', error))
      return fallo(translateMembershipError(error))
    }

    refrescar()
    return { ok: true }
  })
}

// ═══════════════════════════════════════════════════════════════════════════
// 2. Estado de la pertenencia
// ═══════════════════════════════════════════════════════════════════════════

const ESTADOS_ASIGNABLES: AssignableTeamStatus[] = ['active', 'suspended']

/**
 * Activa o desactiva a un miembro sin sacarlo de la organización.
 *
 * Desactivar conserva su histórico y su fila; retirarlo es otra acción. Al
 * propietario no se le desactiva: la organización se quedaría sin propietario
 * activo y el trigger lo rechaza con `23514`.
 */
export async function updateTeamMemberStatus(
  membershipId: string,
  status: string,
): Promise<TeamActionResult> {
  return ejecutar(async () => {
    const cargado = await cargar(membershipId)
    if (esResultado(cargado)) return cargado
    const { supabase, actor, target } = cargado

    const nuevoStatus = ESTADOS_ASIGNABLES.find((s) => s === status)
    if (!nuevoStatus) return fallo(TEAM_MESSAGES.estadoNoValido)

    const objetivo = toTarget(target)
    const denegado = evaluateMemberStatusChange(actor, objetivo, nuevoStatus)
    if (denegado) return fallo(teamDenialMessage(denegado, { actor, target: objetivo }))

    const { error } = await supabase
      .from('organization_members')
      .update({ status: nuevoStatus })
      .eq('id', target.id)

    if (error) {
      console.error(membershipErrorDetail('cambio de estado (portal cliente)', error))
      return fallo(translateMembershipError(error))
    }

    refrescar()
    return { ok: true }
  })
}

// ═══════════════════════════════════════════════════════════════════════════
// 3. Capacidades comerciales
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Concede o retira `can_buy` / `can_sell`.
 *
 * El techo lo pone `organizations.commercial_profile`, que viaja en el contexto
 * de autorización y NO se acepta del navegador. Una organización `buyer` no
 * habilita la venta a nadie, por mucho que llegue `canSell: true`.
 */
export async function updateTeamMemberCapabilities(
  membershipId: string,
  capabilities: { canBuy: boolean; canSell: boolean },
): Promise<TeamActionResult> {
  return ejecutar(async () => {
    const cargado = await cargar(membershipId)
    if (esResultado(cargado)) return cargado
    const { supabase, actor, membership, target } = cargado

    // Solo `true` estricto concede. Cualquier otra cosa es `false`.
    const canBuy = capabilities?.canBuy === true
    const canSell = capabilities?.canSell === true

    const objetivo = toTarget(target)
    const denegado = evaluateMemberCapabilityChange(actor, objetivo, membership, {
      canBuy,
      canSell,
    })

    if (denegado) {
      // Se distingue el techo comercial del resto: lleva a una acción distinta
      // —hablar con MIRA—, no a «no tienes permiso».
      const sinPermisoSobreFila = evaluateMemberUpdate(actor, objetivo)
      if (!sinPermisoSobreFila) {
        return fallo(
          'Tu organización no admite esa capacidad comercial. Contacta con MIRA para ampliar su perfil.',
        )
      }
      return fallo(teamDenialMessage(sinPermisoSobreFila, { actor, target: objetivo }))
    }

    const { error } = await supabase
      .from('organization_members')
      .update({ can_buy: canBuy, can_sell: canSell })
      .eq('id', target.id)

    if (error) {
      console.error(membershipErrorDetail('cambio de capacidades (portal cliente)', error))
      return fallo(translateMembershipError(error))
    }

    refrescar()
    return { ok: true }
  })
}

// ═══════════════════════════════════════════════════════════════════════════
// 4. Retirar a un miembro
// ═══════════════════════════════════════════════════════════════════════════

/** Saca a alguien de la organización. Al propietario no se le retira. */
export async function removeTeamMember(membershipId: string): Promise<TeamActionResult> {
  return ejecutar(async () => {
    const cargado = await cargar(membershipId)
    if (esResultado(cargado)) return cargado
    const { supabase, actor, target } = cargado

    const objetivo = toTarget(target)
    const denegado = evaluateMemberRemoval(actor, objetivo)
    if (denegado) return fallo(teamDenialMessage(denegado, { actor, target: objetivo }))

    const { error } = await supabase
      .from('organization_members')
      .delete()
      .eq('id', target.id)

    if (error) {
      console.error(membershipErrorDetail('retirada de miembro (portal cliente)', error))
      return fallo(translateMembershipError(error))
    }

    refrescar()
    return { ok: true }
  })
}

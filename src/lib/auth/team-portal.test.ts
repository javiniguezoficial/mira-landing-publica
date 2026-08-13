// Gestión de equipo desde el PORTAL DE CLIENTE (Bloque 1).
//
// `team.test.ts` ya cubre las reglas base de la migración 023. Aquí se fija lo
// que añade este bloque: la puerta de entrada (`canManageTeam`), las dos
// decisiones compuestas (estado y capacidades) y los mensajes que explican una
// denegación.
//
// Estos tests NO prueban RLS. La autoridad sigue siendo la base de datos:
//
//   · policies `members_admin_insert` / `_update` / `_delete`, todas con
//     `is_org_admin(organization_id)` y `user_id <> auth.uid()`;
//   · trigger `enforce_membership_rules()`, que impone las invariantes del
//     propietario, la coherencia rol/legacy y el techo comercial.
//
// El actor del portal SIEMPRE se construye con `isPlatformAdmin: false`, aunque
// la persona sea administradora de MIRA: en la superficie del cliente nadie usa
// privilegios de plataforma. Por eso aquí no hay ningún caso `PLATAFORMA`.

import { describe, expect, it } from 'vitest'
import {
  TEAM_MESSAGES,
  canManageTeam,
  evaluateMemberCapabilityChange,
  evaluateMemberStatusChange,
  evaluateMemberRemoval,
  evaluateMemberUpdate,
  teamDenialMessage,
  type TeamActor,
  type TeamTarget,
} from './team'

const OWNER: TeamActor = { orgRole: 'owner', userId: 'u-owner', isPlatformAdmin: false }
const ADMIN: TeamActor = { orgRole: 'admin', userId: 'u-admin', isPlatformAdmin: false }
const ADMIN_2: TeamActor = { orgRole: 'admin', userId: 'u-admin-2', isPlatformAdmin: false }
const MEMBER: TeamActor = { orgRole: 'member', userId: 'u-member', isPlatformAdmin: false }
const EXTERNO: TeamActor = { orgRole: null, userId: 'u-externo', isPlatformAdmin: false }

const T_OWNER: TeamTarget = { orgRole: 'owner', userId: 'u-owner' }
const T_ADMIN: TeamTarget = { orgRole: 'admin', userId: 'u-admin' }
const T_MEMBER: TeamTarget = { orgRole: 'member', userId: 'u-member' }

const ORG_COMPRADORA = { commercialProfile: 'buyer' as const }
const ORG_VENDEDORA = { commercialProfile: 'seller' as const }
const ORG_MIXTA = { commercialProfile: 'buyer_seller' as const }

// ═══════════════════════════════════════════════════════════════════════════
// La puerta: quién alcanza la gestión de equipo
// ═══════════════════════════════════════════════════════════════════════════

describe('canManageTeam — la diferencia real entre admin y member', () => {
  it('el propietario y el administrador gestionan el equipo', () => {
    expect(canManageTeam(OWNER)).toBe(true)
    expect(canManageTeam(ADMIN)).toBe(true)
  })

  it('un MIEMBRO no gestiona el equipo', () => {
    expect(canManageTeam(MEMBER)).toBe(false)
  })

  it('quien no pertenece a la organización tampoco', () => {
    expect(canManageTeam(EXTERNO)).toBe(false)
  })

  it('FAIL-CLOSED: un rol que no se reconoce no gestiona nada', () => {
    expect(canManageTeam({ orgRole: null, userId: 'u-x' })).toBe(false)
  })
})

describe('un member no puede administrar a nadie', () => {
  it('ni cambiar roles, ni estados, ni capacidades, ni retirar', () => {
    expect(evaluateMemberUpdate(MEMBER, T_ADMIN, 'member')).toBe('FORBIDDEN')
    expect(evaluateMemberStatusChange(MEMBER, T_ADMIN, 'suspended')).toBe('FORBIDDEN')
    expect(
      evaluateMemberCapabilityChange(MEMBER, T_ADMIN, ORG_MIXTA, { canBuy: true }),
    ).toBe('FORBIDDEN')
    expect(evaluateMemberRemoval(MEMBER, T_ADMIN)).toBe('FORBIDDEN')
  })

  it('tampoco sobre otro member', () => {
    const otro: TeamTarget = { orgRole: 'member', userId: 'u-otro' }
    expect(evaluateMemberUpdate(MEMBER, otro, 'admin')).toBe('FORBIDDEN')
    expect(evaluateMemberRemoval(MEMBER, otro)).toBe('FORBIDDEN')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// El administrador: qué sí y qué no
// ═══════════════════════════════════════════════════════════════════════════

describe('un admin gestiona miembros', () => {
  const objetivo: TeamTarget = { orgRole: 'member', userId: 'u-otro' }

  it('cambia el estado de un miembro', () => {
    expect(evaluateMemberStatusChange(ADMIN, objetivo, 'suspended')).toBeNull()
    expect(evaluateMemberStatusChange(ADMIN, objetivo, 'active')).toBeNull()
  })

  it('cambia las capacidades dentro del techo de la empresa', () => {
    expect(evaluateMemberCapabilityChange(ADMIN, objetivo, ORG_COMPRADORA, { canBuy: true })).toBeNull()
    expect(evaluateMemberCapabilityChange(ADMIN, objetivo, ORG_COMPRADORA, { canSell: true })).toBe('FORBIDDEN')
    expect(evaluateMemberCapabilityChange(ADMIN, objetivo, ORG_VENDEDORA, { canSell: true })).toBeNull()
    expect(evaluateMemberCapabilityChange(ADMIN, objetivo, ORG_MIXTA, { canBuy: true, canSell: true })).toBeNull()
  })

  it('retira a un miembro', () => {
    expect(evaluateMemberRemoval(ADMIN, objetivo)).toBeNull()
  })

  it('NO concede el rol de administrador — eso es del propietario', () => {
    expect(evaluateMemberUpdate(ADMIN, objetivo, 'admin')).toBe('FORBIDDEN')
    expect(evaluateMemberUpdate(OWNER, objetivo, 'admin')).toBeNull()
  })

  it('NO gestiona a OTRO administrador', () => {
    expect(evaluateMemberUpdate(ADMIN_2, T_ADMIN, 'member')).toBe('FORBIDDEN')
    expect(evaluateMemberStatusChange(ADMIN_2, T_ADMIN, 'suspended')).toBe('FORBIDDEN')
    expect(evaluateMemberCapabilityChange(ADMIN_2, T_ADMIN, ORG_MIXTA, { canBuy: true })).toBe('FORBIDDEN')
    expect(evaluateMemberRemoval(ADMIN_2, T_ADMIN)).toBe('FORBIDDEN')
  })

  it('el propietario SÍ gestiona a un administrador', () => {
    expect(evaluateMemberUpdate(OWNER, T_ADMIN, 'member')).toBeNull()
    expect(evaluateMemberStatusChange(OWNER, T_ADMIN, 'suspended')).toBeNull()
    expect(evaluateMemberRemoval(OWNER, T_ADMIN)).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Protección del propietario
// ═══════════════════════════════════════════════════════════════════════════

describe('al propietario no se le toca desde el portal', () => {
  it('un admin no lo degrada, ni lo suspende, ni lo retira', () => {
    expect(evaluateMemberUpdate(ADMIN, T_OWNER, 'member')).toBe('FORBIDDEN')
    expect(evaluateMemberStatusChange(ADMIN, T_OWNER, 'suspended')).toBe('FORBIDDEN')
    expect(evaluateMemberRemoval(ADMIN, T_OWNER)).toBe('FORBIDDEN')
  })

  it('tampoco le cambia las capacidades — evita la escalada lateral', () => {
    // El trigger de 023 sí lo permitiría (solo protege rol y estado del owner),
    // pero en el portal se cierra: retirar `can_buy` al propietario bloquearía a
    // quien manda sin poder degradarlo.
    expect(evaluateMemberCapabilityChange(ADMIN, T_OWNER, ORG_MIXTA, { canBuy: false })).toBe('FORBIDDEN')
  })

  it('ni siquiera el propio propietario se modifica a sí mismo', () => {
    expect(evaluateMemberUpdate(OWNER, T_OWNER, 'member')).toBe('FORBIDDEN')
    expect(evaluateMemberStatusChange(OWNER, T_OWNER, 'suspended')).toBe('FORBIDDEN')
    expect(evaluateMemberRemoval(OWNER, T_OWNER)).toBe('FORBIDDEN')
  })

  it('la organización nunca se queda sin propietario activo', () => {
    // No hay actor ni combinación que consiga desactivar al propietario.
    for (const actor of [OWNER, ADMIN, ADMIN_2, MEMBER, EXTERNO]) {
      expect(evaluateMemberStatusChange(actor, T_OWNER, 'suspended')).toBe('FORBIDDEN')
      expect(evaluateMemberRemoval(actor, T_OWNER)).toBe('FORBIDDEN')
    }
  })
})

describe('nadie modifica su propia pertenencia', () => {
  it('ni el admin sobre sí mismo', () => {
    expect(evaluateMemberUpdate(ADMIN, T_ADMIN, 'member')).toBe('FORBIDDEN')
    expect(evaluateMemberStatusChange(ADMIN, T_ADMIN, 'suspended')).toBe('FORBIDDEN')
    expect(evaluateMemberCapabilityChange(ADMIN, T_ADMIN, ORG_MIXTA, { canBuy: true })).toBe('FORBIDDEN')
    expect(evaluateMemberRemoval(ADMIN, T_ADMIN)).toBe('FORBIDDEN')
  })

  it('ni un member sobre sí mismo — no se autoconcede can_buy', () => {
    expect(evaluateMemberCapabilityChange(MEMBER, T_MEMBER, ORG_COMPRADORA, { canBuy: true })).toBe('FORBIDDEN')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Mensajes
// ═══════════════════════════════════════════════════════════════════════════

describe('teamDenialMessage explica el motivo correcto', () => {
  it('la propia fila', () => {
    expect(teamDenialMessage('FORBIDDEN', { actor: ADMIN, target: T_ADMIN })).toBe(TEAM_MESSAGES.propiaFila)
  })

  it('el propietario', () => {
    expect(teamDenialMessage('FORBIDDEN', { actor: ADMIN, target: T_OWNER })).toBe(
      TEAM_MESSAGES.propietarioIntocable,
    )
  })

  it('un administrador ajeno', () => {
    expect(teamDenialMessage('FORBIDDEN', { actor: ADMIN_2, target: T_ADMIN })).toBe(
      TEAM_MESSAGES.soloOwnerSobreAdmin,
    )
  })

  it('un member que no alcanza la gestión', () => {
    const otro: TeamTarget = { orgRole: 'member', userId: 'u-otro' }
    expect(teamDenialMessage('FORBIDDEN', { actor: MEMBER, target: otro })).toBe(
      TEAM_MESSAGES.soloOwnerAdmin,
    )
  })

  it('la pertenencia ya no existe', () => {
    expect(teamDenialMessage('NO_ORGANIZATION')).toBe(TEAM_MESSAGES.sinMiembro)
  })

  it('nunca filtra SQLSTATE, nombres de policy ni texto de PostgreSQL', () => {
    const prohibido = /policy|trigger|row-level|rls|sqlstate|23514|42501|organization_members|pg_/i
    for (const texto of Object.values(TEAM_MESSAGES)) {
      expect(texto).not.toMatch(prohibido)
    }
  })
})

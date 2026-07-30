// Estado de acceso organizativo — Bloque 6B.5.1.
//
// Módulo puro: fija QUÉ se le dice a cada persona y por qué. La seguridad ya la
// imponen 6B.5 y las migraciones 022/025; aquí solo se comprueba que una
// suspensión no se presente como una ausencia de organización.

import { describe, expect, it } from 'vitest'
import {
  ORGANIZATION_ACCESS_MESSAGES,
  ORGANIZATION_EDIT_MESSAGES,
  accessAuthorizationCode,
  evaluateOrganizationEdit,
  resolveOrganizationAccess,
  resolveOrganizationAccessFromContext,
  type OrganizationAccessState,
} from './access'
import type { AuthContext, AuthMembership } from './types'
import { DEFAULT_ORGANIZATION_MODULES } from './modules'

const ORG = 'org-acme'
const OTRA_ORG = 'org-externa'

function contexto(overrides: Partial<AuthContext> = {}): AuthContext {
  return {
    user: { id: 'u-ana', email: 'ana@example.com' },
    platformRole: 'user',
    profileStatus: 'active',
    memberships: [],
    ...overrides,
  }
}

function pertenencia(overrides: Partial<AuthMembership> = {}): AuthMembership {
  return {
    organizationId: ORG,
    organizationName: 'Acme',
    orgRole: 'owner',
    membershipStatus: 'active',
    canBuy: true,
    canSell: false,
    joinedAt: '2026-01-01T00:00:00Z',
    organizationStatus: 'active',
    commercialProfile: 'buyer',
    ...overrides,
    // 1.4 — los módulos son obligatorios en AuthMembership. Por defecto ambos
    // activos, igual que el DEFAULT de la columna en la migración 027.
    modules: overrides.modules ?? { ...DEFAULT_ORGANIZATION_MODULES },
  }
}

function estado(
  ctx: AuthContext | null,
  m: AuthMembership | null,
): OrganizationAccessState {
  return resolveOrganizationAccess(ctx, m).state
}

// ── Resolución de estado ────────────────────────────────────────────────────

describe('resolveOrganizationAccess', () => {
  it('1. sin membership → no_membership', () => {
    expect(estado(contexto(), null)).toBe('no_membership')
  })

  it('2. perfil suspendido → profile_inactive', () => {
    expect(estado(contexto({ profileStatus: 'suspended' }), pertenencia())).toBe('profile_inactive')
  })

  it.each(['pending', 'rejected'] as const)('3. perfil %s → profile_inactive', (s) => {
    expect(estado(contexto({ profileStatus: s }), pertenencia())).toBe('profile_inactive')
  })

  it('4. membership invited → membership_invited', () => {
    // El esquema NO tiene 'pending' en organization_members: la invitación sin
    // aceptar se representa con 'invited'.
    expect(estado(contexto(), pertenencia({ membershipStatus: 'invited' }))).toBe('membership_invited')
  })

  it('5. membership suspended → membership_suspended', () => {
    expect(estado(contexto(), pertenencia({ membershipStatus: 'suspended' }))).toBe(
      'membership_suspended',
    )
  })

  it('6. estado de membership no reconocido → membership_inactive', () => {
    expect(estado(contexto(), pertenencia({ membershipStatus: null }))).toBe('membership_inactive')
  })

  it('7. organización suspendida → organization_inactive', () => {
    expect(estado(contexto(), pertenencia({ organizationStatus: 'suspended' }))).toBe(
      'organization_inactive',
    )
  })

  it.each(['pending', 'rejected'] as const)('8. organización %s → organization_inactive', (s) => {
    expect(estado(contexto(), pertenencia({ organizationStatus: s }))).toBe('organization_inactive')
  })

  it('9. sin contexto → invalid_context', () => {
    expect(estado(null, pertenencia())).toBe('invalid_context')
    expect(estado(null, null)).toBe('invalid_context')
  })

  it('10. todo activo → active', () => {
    const acceso = resolveOrganizationAccess(contexto(), pertenencia())
    expect(acceso.state).toBe('active')
    expect(acceso.canOperate).toBe(true)
    expect(acceso.message).toBe('')
  })

  it('11. una membership inactiva NO desaparece del resultado', () => {
    // Es el defecto que corrige el bloque: devolver null convertía una
    // suspensión en «no tienes ninguna organización».
    const m = pertenencia({ membershipStatus: 'suspended' })
    const acceso = resolveOrganizationAccess(contexto(), m)
    expect(acceso.membership).toBe(m)
    expect(acceso.membership?.organizationId).toBe(ORG)
    expect(acceso.state).not.toBe('no_membership')
  })

  it('12. con varias pertenencias se prefiere la activa', () => {
    const activa = pertenencia({ organizationId: 'org-viva', orgRole: 'member' })
    const suspendida = pertenencia({ organizationId: 'org-muerta', membershipStatus: 'suspended' })
    const acceso = resolveOrganizationAccessFromContext(
      contexto({ memberships: [suspendida, activa] }),
    )
    expect(acceso.state).toBe('active')
    expect(acceso.membership?.organizationId).toBe('org-viva')
  })

  it('13. si ninguna es activa se conserva la más relevante, no null', () => {
    const owner = pertenencia({ organizationId: 'org-a', orgRole: 'owner', membershipStatus: 'suspended' })
    const member = pertenencia({ organizationId: 'org-b', orgRole: 'member', membershipStatus: 'suspended' })
    const acceso = resolveOrganizationAccessFromContext(contexto({ memberships: [member, owner] }))
    expect(acceso.state).toBe('membership_suspended')
    expect(acceso.membership?.organizationId).toBe('org-a')
  })

  it('el orden es de fuera hacia dentro: perfil, luego organización, luego asiento', () => {
    // Con todo suspendido a la vez, el motivo mostrado es el más amplio: es el
    // que decide a qué puerta llamar.
    const todo = resolveOrganizationAccess(
      contexto({ profileStatus: 'suspended' }),
      pertenencia({ organizationStatus: 'suspended', membershipStatus: 'suspended' }),
    )
    expect(todo.state).toBe('profile_inactive')

    const orgYAsiento = resolveOrganizationAccess(
      contexto(),
      pertenencia({ organizationStatus: 'suspended', membershipStatus: 'suspended' }),
    )
    expect(orgYAsiento.state).toBe('organization_inactive')
  })

  it('ningún estado salvo active autoriza a operar', () => {
    const casos: Array<[AuthContext | null, AuthMembership | null]> = [
      [null, null],
      [contexto(), null],
      [contexto({ profileStatus: 'suspended' }), pertenencia()],
      [contexto(), pertenencia({ organizationStatus: 'suspended' })],
      [contexto(), pertenencia({ membershipStatus: 'invited' })],
      [contexto(), pertenencia({ membershipStatus: 'suspended' })],
      [contexto(), pertenencia({ membershipStatus: null })],
    ]
    for (const [c, m] of casos) {
      expect(resolveOrganizationAccess(c, m).canOperate).toBe(false)
    }
  })
})

describe('accessAuthorizationCode', () => {
  it('traduce cada estado a un código coherente', () => {
    expect(accessAuthorizationCode(resolveOrganizationAccess(contexto(), pertenencia()))).toBeNull()
    expect(accessAuthorizationCode(resolveOrganizationAccess(null, null))).toBe('UNAUTHENTICATED')
    expect(accessAuthorizationCode(resolveOrganizationAccess(contexto(), null))).toBe('NO_ORGANIZATION')
    expect(
      accessAuthorizationCode(
        resolveOrganizationAccess(contexto(), pertenencia({ membershipStatus: 'suspended' })),
      ),
    ).toBe('FORBIDDEN')
  })
})

// ── Edición de Mi organización ──────────────────────────────────────────────

describe('evaluateOrganizationEdit', () => {
  const activo = () => resolveOrganizationAccess(contexto(), pertenencia())

  it('14. owner activo puede editar', () => {
    expect(evaluateOrganizationEdit(activo(), true)).toBeNull()
  })

  it('15. owner con perfil suspendido no edita', () => {
    const a = resolveOrganizationAccess(contexto({ profileStatus: 'suspended' }), pertenencia())
    expect(evaluateOrganizationEdit(a, true)).toBe(ORGANIZATION_ACCESS_MESSAGES.profile_inactive)
  })

  it('16. owner con membership suspendida no edita', () => {
    const a = resolveOrganizationAccess(contexto(), pertenencia({ membershipStatus: 'suspended' }))
    expect(evaluateOrganizationEdit(a, true)).toBe(ORGANIZATION_ACCESS_MESSAGES.membership_suspended)
  })

  it('17. owner con invitación pendiente no edita', () => {
    const a = resolveOrganizationAccess(contexto(), pertenencia({ membershipStatus: 'invited' }))
    expect(evaluateOrganizationEdit(a, true)).toBe(ORGANIZATION_ACCESS_MESSAGES.membership_invited)
  })

  it('18. owner con organización suspendida no edita', () => {
    const a = resolveOrganizationAccess(contexto(), pertenencia({ organizationStatus: 'suspended' }))
    expect(evaluateOrganizationEdit(a, true)).toBe(ORGANIZATION_ACCESS_MESSAGES.organization_inactive)
  })

  it('19. un member activo no edita como propietario', () => {
    expect(evaluateOrganizationEdit(activo(), false)).toBe(ORGANIZATION_EDIT_MESSAGES.soloPropietario)
  })

  it('20. una organización objetivo distinta se deniega', () => {
    expect(evaluateOrganizationEdit(activo(), true, OTRA_ORG)).toBe(
      ORGANIZATION_EDIT_MESSAGES.organizacionDistinta,
    )
    expect(evaluateOrganizationEdit(activo(), true, ORG)).toBeNull()
  })

  it('21. una suspensión posterior a abrir la página bloquea la acción', () => {
    // La página se pintó con acceso activo; el envío se evalúa contra un
    // contexto recargado, que ya está suspendido.
    const alPintar = activo()
    expect(evaluateOrganizationEdit(alPintar, true)).toBeNull()

    const alEnviar = resolveOrganizationAccess(
      contexto(),
      pertenencia({ membershipStatus: 'suspended' }),
    )
    expect(evaluateOrganizationEdit(alEnviar, true)).toBe(
      ORGANIZATION_ACCESS_MESSAGES.membership_suspended,
    )
  })

  it('22. los mensajes de escritura no filtran detalles internos', () => {
    for (const mensaje of Object.values(ORGANIZATION_EDIT_MESSAGES)) {
      for (const tecnico of ['SQLSTATE', 'policy', 'RLS', 'organizations', 'row-level', 'pg_']) {
        expect(mensaje.toLowerCase()).not.toContain(tecnico.toLowerCase())
      }
    }
  })

  it('23. sin contexto tampoco se edita', () => {
    const a = resolveOrganizationAccess(null, null)
    expect(evaluateOrganizationEdit(a, true)).toBe(ORGANIZATION_ACCESS_MESSAGES.invalid_context)
  })
})

// ── Mensajes ────────────────────────────────────────────────────────────────

describe('mensajes de acceso', () => {
  it('24. cada estado produce su mensaje', () => {
    expect(resolveOrganizationAccess(contexto(), null).message).toBe(
      ORGANIZATION_ACCESS_MESSAGES.no_membership,
    )
    expect(
      resolveOrganizationAccess(contexto({ profileStatus: 'suspended' }), pertenencia()).message,
    ).toBe(ORGANIZATION_ACCESS_MESSAGES.profile_inactive)
    expect(
      resolveOrganizationAccess(contexto(), pertenencia({ organizationStatus: 'suspended' })).message,
    ).toBe(ORGANIZATION_ACCESS_MESSAGES.organization_inactive)
    expect(
      resolveOrganizationAccess(contexto(), pertenencia({ membershipStatus: 'invited' })).message,
    ).toBe(ORGANIZATION_ACCESS_MESSAGES.membership_invited)
    expect(resolveOrganizationAccess(null, null).message).toBe(
      ORGANIZATION_ACCESS_MESSAGES.invalid_context,
    )
  })

  it('25. ningún mensaje visible contiene nombres técnicos', () => {
    for (const mensaje of Object.values(ORGANIZATION_ACCESS_MESSAGES)) {
      for (const tecnico of [
        'membership', 'profileStatus', 'organizationStatus', 'status', 'can_buy', 'can_sell',
        'RLS', 'policy', 'trigger', 'SQLSTATE', 'supabase', 'postgres', 'org_role',
        'organization_members', 'null', 'undefined',
      ]) {
        expect(mensaje.toLowerCase()).not.toContain(tecnico.toLowerCase())
      }
    }
  })

  it('26. un contexto desconocido falla de forma segura, no como ausencia', () => {
    const a = resolveOrganizationAccess(contexto(), pertenencia({ membershipStatus: null }))
    expect(a.canOperate).toBe(false)
    expect(a.state).not.toBe('no_membership')
    expect(a.state).not.toBe('active')
  })

  it('27. NUNCA se usa el mensaje de «sin organización» para una pertenencia inactiva', () => {
    const inactivos = [
      resolveOrganizationAccess(contexto(), pertenencia({ membershipStatus: 'suspended' })),
      resolveOrganizationAccess(contexto(), pertenencia({ membershipStatus: 'invited' })),
      resolveOrganizationAccess(contexto(), pertenencia({ membershipStatus: null })),
      resolveOrganizationAccess(contexto(), pertenencia({ organizationStatus: 'suspended' })),
      resolveOrganizationAccess(contexto({ profileStatus: 'suspended' }), pertenencia()),
    ]
    for (const a of inactivos) {
      expect(a.message).not.toBe(ORGANIZATION_ACCESS_MESSAGES.no_membership)
      expect(a.message.length).toBeGreaterThan(0)
    }
  })

  it('los detalles de registro no incluyen datos personales', () => {
    const a = resolveOrganizationAccess(contexto(), pertenencia({ membershipStatus: 'suspended' }))
    expect(a.detail).toBe('pertenencia=suspended')
    expect(a.detail).not.toContain('ana@example.com')
    expect(a.detail).not.toContain('u-ana')
  })
})

// ── Soporte: excepción deliberada ───────────────────────────────────────────

describe('soporte sigue disponible con estados inactivos', () => {
  it('28. un perfil suspendido conserva una pertenencia utilizable para el ticket', () => {
    // Soporte NO usa `canOperate`: usa la pertenencia resuelta, exista o no
    // acceso activo. Por eso el modelo la conserva.
    const a = resolveOrganizationAccessFromContext(
      contexto({ profileStatus: 'suspended', memberships: [pertenencia()] }),
    )
    expect(a.canOperate).toBe(false)
    expect(a.membership?.organizationId).toBe(ORG)
  })

  it('29. una membership suspendida conserva la asociación organizativa', () => {
    const a = resolveOrganizationAccessFromContext(
      contexto({ memberships: [pertenencia({ membershipStatus: 'suspended' })] }),
    )
    expect(a.membership?.organizationId).toBe(ORG)
  })

  it('30. sin membership el ticket puede ir sin organización', () => {
    const a = resolveOrganizationAccessFromContext(contexto({ memberships: [] }))
    expect(a.membership).toBeNull()
    expect(a.state).toBe('no_membership')
  })

  it('31. el acceso activo y la asociación para soporte son decisiones distintas', () => {
    const suspendida = resolveOrganizationAccessFromContext(
      contexto({ memberships: [pertenencia({ membershipStatus: 'suspended' })] }),
    )
    // Una deniega operar; la otra sigue identificando la organización.
    expect(suspendida.canOperate).toBe(false)
    expect(suspendida.membership).not.toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 6C — organización recién registrada, todavía pendiente
// ═══════════════════════════════════════════════════════════════════════════
//
// Un alta desde la landing nace `pending`. La organización NO es legible en ese
// estado —`org_members_select` exige `is_org_member`—, así que el contexto
// recibe la pertenencia con `organizationStatus` en null. Lo importante es que
// eso se clasifique como «tu organización no está activa» y NUNCA como «no
// tienes organización»: la persona acaba de dar de alta su empresa.

describe('alta pendiente de revisión', () => {
  it('una pertenencia visible con organización ilegible NO es ausencia de organización', () => {
    const recienRegistrada = pertenencia({ organizationStatus: null, organizationName: '' })
    const acceso = resolveOrganizationAccess(contexto(), recienRegistrada)

    expect(acceso.state).toBe('organization_inactive')
    expect(acceso.state).not.toBe('no_membership')
    expect(acceso.message).not.toBe(ORGANIZATION_ACCESS_MESSAGES.no_membership)
    expect(acceso.message).toBe(ORGANIZATION_ACCESS_MESSAGES.organization_inactive)
  })

  it('no concede ninguna operación comercial', () => {
    const acceso = resolveOrganizationAccess(contexto(), pertenencia({ organizationStatus: null }))
    expect(acceso.canOperate).toBe(false)
  })

  it('conserva la pertenencia, que es lo que soporte necesita para asociar el ticket', () => {
    const m = pertenencia({ organizationStatus: null })
    const acceso = resolveOrganizationAccess(contexto(), m)
    expect(acceso.membership).toBe(m)
    expect(acceso.membership?.organizationId).toBe(ORG)
  })

  it('una organización explícitamente pending se clasifica igual', () => {
    expect(estado(contexto(), pertenencia({ organizationStatus: 'pending' }))).toBe(
      'organization_inactive',
    )
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// REGRESIÓN — incidente tras desplegar 6C (026)
// ═══════════════════════════════════════════════════════════════════════════
//
// Ana, propietaria ACTIVA de Acme, veía «No hemos podido comprobar tu acceso a
// la organización», es decir `invalid_context`.
//
// La causa NO estaba aquí: la resolución de acceso era correcta. 026 añadió
// `organizations.requested_plan_id`, con lo que `organizations` pasó a tener
// DOS claves ajenas hacia `plans`; el embed `plan:plans(...)` de `getActiveOrg`
// y `getMyOrganization` se volvió ambiguo y PostgREST devolvía PGRST201. Esas
// dos funciones traducen «organización no legible con acceso activo» a
// `invalid_context`, y ahí es donde se veía el síntoma.
//
// Estos tests fijan que, con los datos reales de Ana, la resolución dé `active`.

describe('regresión 026: Ana propietaria activa de Acme', () => {
  // Copia literal de la fila real, comprobada en Supabase:
  //   profiles:            status=active, role=user
  //   organization_members: status=active, org_role=owner, role=client_owner,
  //                         can_buy=true, can_sell=false
  //   organizations:        status=active, commercial_profile=buyer,
  //                         signup_source=admin, plan_id=Starter,
  //                         requested_plan_id=null, plan_approved_by=null,
  //                         modules={"markets": true, "quotes": true}  (1.4)
  const ANA: AuthContext = {
    user: { id: 'ef9f8075-f79f-4cde-8d4c-5e48df0b88e6', email: 'ana@acme.example' },
    platformRole: 'user',
    profileStatus: 'active',
    memberships: [
      {
        organizationId: '35fe4e45-f546-415e-b2e1-01017c200f7f',
        organizationName: 'Acme Distribución S.L.',
        orgRole: 'owner',
        membershipStatus: 'active',
        canBuy: true,
        canSell: false,
        joinedAt: '2026-06-04T12:26:05.000Z',
        organizationStatus: 'active',
        commercialProfile: 'buyer',
        modules: { ...DEFAULT_ORGANIZATION_MODULES },
      },
    ],
  }

  it('1-8. la estructura real de Ana resuelve ACTIVE', () => {
    const acceso = resolveOrganizationAccessFromContext(ANA)
    expect(acceso.state).toBe('active')
    expect(acceso.canOperate).toBe(true)
    expect(acceso.message).toBe('')
  })

  it('9-10. dashboard y Mi organización NO reciben invalid_context', () => {
    const acceso = resolveOrganizationAccessFromContext(ANA)
    expect(acceso.state).not.toBe('invalid_context')
    expect(acceso.message).not.toBe(ORGANIZATION_ACCESS_MESSAGES.invalid_context)
    expect(acceso.state).not.toBe('no_membership')
  })

  it('los campos nuevos de 026 son opcionales: no intervienen en la resolución', () => {
    // `signup_source`, `requested_plan_id` y `plan_approved_by` no forman parte
    // de `AuthMembership` y no deben influir. Acme los tiene a null salvo
    // signup_source='admin', y sigue resolviendo active.
    expect(resolveOrganizationAccessFromContext(ANA).state).toBe('active')
  })

  it('sigue distinguiendo el resto de estados', () => {
    const conMembership = (over: Partial<AuthMembership>) =>
      resolveOrganizationAccessFromContext({ ...ANA, memberships: [{ ...ANA.memberships[0], ...over }] }).state

    expect(conMembership({ organizationStatus: 'pending' })).toBe('organization_inactive')
    expect(conMembership({ membershipStatus: 'suspended' })).toBe('membership_suspended')
    expect(conMembership({ membershipStatus: 'invited' })).toBe('membership_invited')
    expect(resolveOrganizationAccessFromContext({ ...ANA, memberships: [] }).state).toBe('no_membership')
    expect(resolveOrganizationAccessFromContext({ ...ANA, profileStatus: 'suspended' }).state).toBe('profile_inactive')
    expect(resolveOrganizationAccessFromContext(null).state).toBe('invalid_context')
  })
})

// Autorización y transiciones de cotizaciones — espejo de la migración 024.
//
// Estos tests NO prueban RLS. Fijan la semántica que la interfaz debe anticipar
// y que las policies y el trigger imponen de verdad. La verificación real está
// en supabase/checks/6B4_*.sql.

import { describe, expect, it } from 'vitest'
import {
  FINAL_RFQ_STATUSES,
  RFQ_MESSAGES,
  evaluateRfqContentEdit,
  evaluateRfqCreation,
  evaluateRfqManagement,
  evaluateRfqVisibility,
  isFinalRfqStatus,
  isRfqContentEditable,
  isValidRfqTransition,
  rfqErrorDetail,
  translateRfqError,
  type RfqActor,
  type RfqRef,
  type RfqStatus,
} from './rfq'
import { evaluateCommercialAction } from './policy'
import type { AuthContext, AuthMembership } from './types'
import { DEFAULT_ORGANIZATION_MODULES } from './modules'

const ORG = 'org-acme'
const OTRA_ORG = 'org-externa'

function pertenencia(overrides: Partial<AuthMembership> = {}): AuthMembership {
  return {
    organizationId: ORG,
    organizationName: 'Acme',
    orgRole: 'member',
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

function cotizacion(overrides: Partial<RfqRef> = {}): RfqRef {
  return { organizationId: ORG, createdBy: 'u-creador', status: 'draft', ...overrides }
}

const OWNER: RfqActor = { userId: 'u-owner', orgRole: 'owner' }
const ADMIN: RfqActor = { userId: 'u-admin', orgRole: 'admin' }
const MEMBER: RfqActor = { userId: 'u-creador', orgRole: 'member' }
const OTRO_MEMBER: RfqActor = { userId: 'u-otro', orgRole: 'member' }
const PLATAFORMA: RfqActor = { userId: 'u-mira', orgRole: null, isPlatformAdmin: true }

// ── Creación ────────────────────────────────────────────────────────────────

describe('crear cotizaciones', () => {
  it('un miembro con capacidad de compra puede crear', () => {
    expect(evaluateRfqCreation(pertenencia({ canBuy: true, commercialProfile: 'buyer' }))).toBeNull()
  })

  it('sin can_buy NO puede crear', () => {
    expect(evaluateRfqCreation(pertenencia({ canBuy: false }))).toBe('FORBIDDEN')
  })

  it('el propietario sin can_buy tampoco crea: el rol no sustituye la capacidad', () => {
    expect(evaluateRfqCreation(pertenencia({ orgRole: 'owner', canBuy: false }))).toBe('FORBIDDEN')
  })

  it('una organización vendedora NO compra, aunque el miembro tenga can_buy', () => {
    expect(
      evaluateRfqCreation(pertenencia({ canBuy: true, commercialProfile: 'seller' })),
    ).toBe('FORBIDDEN')
  })

  it('buyer_seller con can_buy sí crea', () => {
    expect(
      evaluateRfqCreation(pertenencia({ canBuy: true, commercialProfile: 'buyer_seller' })),
    ).toBeNull()
  })

  it('un perfil comercial desconocido no habilita nada', () => {
    expect(evaluateRfqCreation(pertenencia({ canBuy: true, commercialProfile: null }))).toBe('FORBIDDEN')
  })

  it('sin organización no se puede crear', () => {
    expect(evaluateRfqCreation(null)).toBe('NO_ORGANIZATION')
  })
})

// ── Gestión: la cotización pertenece a la organización ──────────────────────

describe('gestionar cotizaciones', () => {
  it('quien la creó puede gestionarla', () => {
    expect(evaluateRfqManagement(MEMBER, cotizacion(), pertenencia())).toBeNull()
  })

  it('el propietario gestiona la cotización de un miembro suyo', () => {
    // Corrige el vacío detectado: antes `created_by = auth.uid()` lo impedía.
    expect(
      evaluateRfqManagement(OWNER, cotizacion(), pertenencia({ orgRole: 'owner' })),
    ).toBeNull()
  })

  it('un administrador también gestiona la de un miembro', () => {
    expect(
      evaluateRfqManagement(ADMIN, cotizacion(), pertenencia({ orgRole: 'admin' })),
    ).toBeNull()
  })

  it('un miembro NO gestiona la cotización de otro', () => {
    expect(
      evaluateRfqManagement(OTRO_MEMBER, cotizacion(), pertenencia({ orgRole: 'member' })),
    ).toBe('FORBIDDEN')
  })

  it('sin can_buy nadie gestiona, ni siquiera el propietario', () => {
    expect(
      evaluateRfqManagement(OWNER, cotizacion(), pertenencia({ orgRole: 'owner', canBuy: false })),
    ).toBe('FORBIDDEN')
    expect(
      evaluateRfqManagement(MEMBER, cotizacion(), pertenencia({ canBuy: false })),
    ).toBe('FORBIDDEN')
  })

  it('una organización vendedora no gestiona cotizaciones de compra', () => {
    expect(
      evaluateRfqManagement(OWNER, cotizacion(), pertenencia({ orgRole: 'owner', commercialProfile: 'seller' })),
    ).toBe('FORBIDDEN')
  })

  it('un usuario de OTRA organización no gestiona nada', () => {
    expect(
      evaluateRfqManagement(OWNER, cotizacion({ organizationId: OTRA_ORG }), pertenencia({ orgRole: 'owner' })),
    ).toBe('FORBIDDEN')
  })

  it('un usuario sin organización no gestiona nada', () => {
    expect(evaluateRfqManagement(MEMBER, cotizacion(), null)).toBe('FORBIDDEN')
  })

  it('platform_admin gestiona cualquier cotización sin pertenecer a la organización', () => {
    expect(evaluateRfqManagement(PLATAFORMA, cotizacion({ organizationId: OTRA_ORG }), null)).toBeNull()
  })
})

// ── Visibilidad del histórico ───────────────────────────────────────────────

describe('ver el histórico', () => {
  it('un miembro SIN can_buy sigue viendo el histórico de su organización', () => {
    // Retirar la capacidad de comprar no borra lo que la empresa ya solicitó.
    expect(evaluateRfqVisibility(pertenencia({ canBuy: false }), cotizacion())).toBeNull()
  })

  it('un usuario de otra organización no ve nada', () => {
    expect(
      evaluateRfqVisibility(pertenencia({ organizationId: OTRA_ORG }), cotizacion()),
    ).toBe('FORBIDDEN')
  })

  it('sin organización no ve nada', () => {
    expect(evaluateRfqVisibility(null, cotizacion())).toBe('NO_ORGANIZATION')
  })
})

// ── Contenido congelado en cuanto sale de borrador ──────────────────────────

describe('editar el contenido de una cotización', () => {
  const PUBLICADOS: RfqStatus[] = ['open', 'closed', 'awarded', 'cancelled']

  it('el contenido solo se escribe mientras es borrador', () => {
    expect(isRfqContentEditable('draft')).toBe(true)
    for (const estado of PUBLICADOS) expect(isRfqContentEditable(estado)).toBe(false)
    expect(isRfqContentEditable(null)).toBe(false)
  })

  it('quien puede gestionar edita el borrador', () => {
    expect(evaluateRfqContentEdit(MEMBER, cotizacion(), pertenencia())).toBeNull()
    expect(evaluateRfqContentEdit(OWNER, cotizacion(), pertenencia({ orgRole: 'owner' }))).toBeNull()
  })

  it('una vez publicada, el cliente ya no la reescribe', () => {
    for (const estado of PUBLICADOS) {
      expect(
        evaluateRfqContentEdit(OWNER, cotizacion({ status: estado }), pertenencia({ orgRole: 'owner' })),
      ).toBe('FORBIDDEN')
    }
  })

  it('platform_admin NO modifica el contenido de una cotización open', () => {
    // Lo que los proveedores han visto no se reescribe sin versionado ni traza.
    expect(evaluateRfqContentEdit(PLATAFORMA, cotizacion({ status: 'open' }), null)).toBe('FORBIDDEN')
  })

  it('platform_admin tampoco en closed, awarded ni cancelled', () => {
    for (const estado of PUBLICADOS) {
      expect(evaluateRfqContentEdit(PLATAFORMA, cotizacion({ status: estado }), null)).toBe('FORBIDDEN')
    }
  })

  it('reabrir closed → open devuelve el estado, no la escritura del contenido', () => {
    expect(isValidRfqTransition('closed', 'open', true)).toBe(true)
    expect(evaluateRfqContentEdit(PLATAFORMA, cotizacion({ status: 'open' }), null)).toBe('FORBIDDEN')
  })

  it('platform_admin conserva sus transiciones administrativas', () => {
    expect(isValidRfqTransition('open', 'closed', true)).toBe(true)
    expect(isValidRfqTransition('open', 'awarded', true)).toBe(true)
    expect(isValidRfqTransition('closed', 'awarded', true)).toBe(true)
    expect(isValidRfqTransition('closed', 'open', true)).toBe(true)
  })

  it('platform_admin sí edita un borrador: ahí todavía no hay nada publicado', () => {
    expect(evaluateRfqContentEdit(PLATAFORMA, cotizacion({ status: 'draft' }), null)).toBeNull()
  })

  it('sin can_buy no se edita, ni siquiera el borrador propio', () => {
    expect(evaluateRfqContentEdit(MEMBER, cotizacion(), pertenencia({ canBuy: false }))).toBe('FORBIDDEN')
  })
})

// ── Usuario sin ninguna pertenencia ─────────────────────────────────────────

describe('usuario sin ninguna organización', () => {
  const HUERFANO: RfqActor = { userId: 'u-sin-org', orgRole: null }

  it('no ve el histórico', () => {
    expect(evaluateRfqVisibility(null, cotizacion())).toBe('NO_ORGANIZATION')
  })

  it('no crea', () => {
    expect(evaluateRfqCreation(null)).toBe('NO_ORGANIZATION')
  })

  it('no gestiona ni edita', () => {
    expect(evaluateRfqManagement(HUERFANO, cotizacion(), null)).toBe('FORBIDDEN')
    expect(evaluateRfqContentEdit(HUERFANO, cotizacion(), null)).toBe('FORBIDDEN')
  })
})

// ── Publicar exige capacidad, no solo una transición válida ─────────────────

describe('publicar sin capacidad de compra', () => {
  it('draft → open es una transición válida en abstracto', () => {
    expect(isValidRfqTransition('draft', 'open')).toBe(true)
  })

  it('pero sin can_buy nadie la ejecuta: la gestión se deniega antes', () => {
    expect(evaluateRfqManagement(MEMBER, cotizacion(), pertenencia({ canBuy: false }))).toBe('FORBIDDEN')
    expect(
      evaluateRfqManagement(OWNER, cotizacion(), pertenencia({ orgRole: 'owner', canBuy: false })),
    ).toBe('FORBIDDEN')
  })

  it('tampoco se cancela una cotización ya abierta', () => {
    expect(
      evaluateRfqManagement(
        OWNER,
        cotizacion({ status: 'open' }),
        pertenencia({ orgRole: 'owner', canBuy: false }),
      ),
    ).toBe('FORBIDDEN')
  })

  it('una organización vendedora tampoco publica', () => {
    expect(
      evaluateRfqManagement(OWNER, cotizacion(), pertenencia({ orgRole: 'owner', commercialProfile: 'seller' })),
    ).toBe('FORBIDDEN')
  })
})

// ── Transiciones de estado ──────────────────────────────────────────────────

describe('transiciones de cliente', () => {
  it('draft → open', () => {
    expect(isValidRfqTransition('draft', 'open')).toBe(true)
  })

  it('draft → cancelled', () => {
    expect(isValidRfqTransition('draft', 'cancelled')).toBe(true)
  })

  it('open → cancelled', () => {
    expect(isValidRfqTransition('open', 'cancelled')).toBe(true)
  })

  it('un estado que no cambia siempre se admite', () => {
    for (const s of ['draft', 'open', 'closed', 'awarded', 'cancelled'] as RfqStatus[]) {
      expect(isValidRfqTransition(s, s)).toBe(true)
    }
  })

  it('el cliente NO cierra ni adjudica', () => {
    expect(isValidRfqTransition('open', 'closed')).toBe(false)
    expect(isValidRfqTransition('open', 'awarded')).toBe(false)
  })

  it('no se retrocede a borrador', () => {
    expect(isValidRfqTransition('open', 'draft')).toBe(false)
    expect(isValidRfqTransition('closed', 'draft')).toBe(false)
  })
})

describe('estados finales', () => {
  it('awarded y cancelled son finales', () => {
    expect(FINAL_RFQ_STATUSES.sort()).toEqual(['awarded', 'cancelled'])
    expect(isFinalRfqStatus('awarded')).toBe(true)
    expect(isFinalRfqStatus('cancelled')).toBe(true)
    expect(isFinalRfqStatus('open')).toBe(false)
  })

  it('no se sale de un estado final, ni siquiera desde la plataforma', () => {
    for (const final of FINAL_RFQ_STATUSES) {
      for (const destino of ['draft', 'open', 'closed'] as RfqStatus[]) {
        expect(isValidRfqTransition(final, destino, false)).toBe(false)
        expect(isValidRfqTransition(final, destino, true)).toBe(false)
      }
    }
  })
})

describe('transiciones de plataforma', () => {
  it('puede cerrar y adjudicar desde open', () => {
    expect(isValidRfqTransition('open', 'closed', true)).toBe(true)
    expect(isValidRfqTransition('open', 'awarded', true)).toBe(true)
  })

  it('puede adjudicar o reabrir desde closed', () => {
    expect(isValidRfqTransition('closed', 'awarded', true)).toBe(true)
    expect(isValidRfqTransition('closed', 'open', true)).toBe(true)
  })

  it('conserva las transiciones de cliente', () => {
    expect(isValidRfqTransition('draft', 'open', true)).toBe(true)
    expect(isValidRfqTransition('open', 'cancelled', true)).toBe(true)
  })

  it('tiene más transiciones, no menos reglas', () => {
    // No puede inventar destinos fuera del CHECK ni revertir finales.
    expect(isValidRfqTransition('awarded', 'open', true)).toBe(false)
    expect(isValidRfqTransition('open', 'draft', true)).toBe(false)
  })
})

// ── Mensajes de error ───────────────────────────────────────────────────────

describe('translateRfqError', () => {
  it('estado final → mensaje de cotización cerrada', () => {
    expect(
      translateRfqError({ code: '23514', message: 'Esta cotización ya no se puede modificar.' }),
    ).toBe(RFQ_MESSAGES.finalizada)
  })

  it('transición inválida → mensaje de cambio de estado', () => {
    expect(
      translateRfqError({ code: '23514', message: 'No se puede realizar ese cambio de estado.' }),
    ).toBe(RFQ_MESSAGES.transicionInvalida)
  })

  it('identificadores internos → mensaje propio', () => {
    expect(
      translateRfqError({ code: '23514', message: 'No se pueden modificar los datos internos de la cotización.' }),
    ).toBe(RFQ_MESSAGES.datosInternos)
  })

  it('violación de RLS → sin acceso', () => {
    expect(
      translateRfqError({ code: '42501', message: 'new row violates row-level security policy for table "rfqs"' }),
    ).toBe(RFQ_MESSAGES.sinAcceso)
  })

  it('un error desconocido cae en el mensaje genérico', () => {
    expect(translateRfqError({ code: 'XX000', message: 'PG::InternalError pg_catalog' })).toBe(
      RFQ_MESSAGES.generico,
    )
    expect(translateRfqError(null)).toBe(RFQ_MESSAGES.generico)
  })

  it('nunca filtra SQLSTATE, nombres de policy, de trigger ni jerga de PostgreSQL', () => {
    const entradas = [
      { code: '23514', message: 'violates check constraint "rfqs_status_check"' },
      { code: '42501', message: 'new row violates row-level security policy for table "rfqs"' },
      { code: 'P0001', message: 'RAISE en public.enforce_rfq_integrity()' },
      { code: '23505', message: 'duplicate key value violates unique constraint' },
      null,
    ]
    for (const entrada of entradas) {
      const salida = translateRfqError(entrada)
      for (const prohibido of [
        'constraint', 'relation', 'pg_', 'public.', 'SQLSTATE', '23514', '42501', 'P0001',
        'row-level', 'enforce_rfq_integrity', 'rfqs_status_check', 'policy',
      ]) {
        expect(salida.toLowerCase()).not.toContain(prohibido.toLowerCase())
      }
    }
  })

  it('los mensajes visibles no mencionan términos técnicos como can_buy', () => {
    for (const mensaje of Object.values(RFQ_MESSAGES)) {
      for (const tecnico of ['can_buy', 'can_sell', 'org_role', 'rfq_', 'RLS', 'policy']) {
        expect(mensaje.toLowerCase()).not.toContain(tecnico.toLowerCase())
      }
    }
  })
})

describe('rfqErrorDetail (registro de servidor)', () => {
  it('conserva el código para diagnosticar', () => {
    expect(rfqErrorDetail('publicación', { code: '23514', message: 'x' })).toContain('23514')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// 6B.5 — Estados activos: la interfaz decide igual que can_buy_in_org()
// ═══════════════════════════════════════════════════════════════════════════

const CONTEXTO_ACTIVO: AuthContext = {
  user: { id: 'u-creador', email: 'ana@example.com' },
  platformRole: 'user',
  profileStatus: 'active',
  memberships: [],
}

function contexto(overrides: Partial<AuthContext> = {}): AuthContext {
  return { ...CONTEXTO_ACTIVO, ...overrides }
}

const COMPRADORA = { canBuy: true, commercialProfile: 'buyer' } as const

// ── Creación ────────────────────────────────────────────────────────────────

describe('6B.5 · crear cotizaciones con estados', () => {
  it('1. todo activo + buyer + can_buy: permitido', () => {
    expect(evaluateCommercialAction(contexto(), pertenencia(COMPRADORA), 'buy')).toBeNull()
  })

  it('2. perfil suspendido: denegado aunque la capacidad esté vigente', () => {
    expect(
      evaluateCommercialAction(contexto({ profileStatus: 'suspended' }), pertenencia(COMPRADORA), 'buy'),
    ).toBe('FORBIDDEN')
  })

  it('3. pertenencia suspendida: denegado', () => {
    const m = pertenencia({ ...COMPRADORA, membershipStatus: 'suspended' })
    expect(evaluateRfqCreation(m)).toBe('FORBIDDEN')
    expect(evaluateCommercialAction(contexto(), m, 'buy')).toBe('FORBIDDEN')
  })

  it('4. organización suspendida: denegado', () => {
    const m = pertenencia({ ...COMPRADORA, organizationStatus: 'suspended' })
    expect(evaluateRfqCreation(m)).toBe('FORBIDDEN')
    expect(evaluateCommercialAction(contexto(), m, 'buy')).toBe('FORBIDDEN')
  })

  it('5. can_buy=false: denegado', () => {
    expect(evaluateRfqCreation(pertenencia({ canBuy: false }))).toBe('FORBIDDEN')
  })

  it('6. seller con can_buy=true: denegado — el perfil comercial es el techo', () => {
    expect(evaluateRfqCreation(pertenencia({ canBuy: true, commercialProfile: 'seller' }))).toBe(
      'FORBIDDEN',
    )
  })

  it('7. buyer_seller con can_buy=true: permitido', () => {
    expect(
      evaluateRfqCreation(pertenencia({ canBuy: true, commercialProfile: 'buyer_seller' })),
    ).toBeNull()
  })

  it('8. contexto incompleto: denegado, nunca se asume activo', () => {
    expect(evaluateRfqCreation(pertenencia({ ...COMPRADORA, membershipStatus: null }))).toBe('FORBIDDEN')
    expect(evaluateRfqCreation(pertenencia({ ...COMPRADORA, organizationStatus: null }))).toBe('FORBIDDEN')
    expect(evaluateRfqCreation(pertenencia({ ...COMPRADORA, commercialProfile: null }))).toBe('FORBIDDEN')
    expect(evaluateCommercialAction(contexto({ profileStatus: null }), pertenencia(COMPRADORA), 'buy')).toBe(
      'FORBIDDEN',
    )
  })

  it('9. una pertenencia invited todavía no crea', () => {
    expect(evaluateRfqCreation(pertenencia({ ...COMPRADORA, membershipStatus: 'invited' }))).toBe(
      'FORBIDDEN',
    )
  })

  it('10. sin organización: denegado', () => {
    expect(evaluateRfqCreation(null)).toBe('NO_ORGANIZATION')
    expect(evaluateCommercialAction(contexto(), null, 'buy')).toBe('NO_ORGANIZATION')
  })

  it('11. sin sesión: denegado', () => {
    expect(evaluateCommercialAction(null, pertenencia(COMPRADORA), 'buy')).toBe('UNAUTHENTICATED')
  })
})

// ── Gestión ─────────────────────────────────────────────────────────────────

describe('6B.5 · gestionar cotizaciones con estados', () => {
  it('12. owner activo gestiona una cotización de su organización', () => {
    expect(
      evaluateRfqManagement(OWNER, cotizacion(), pertenencia({ ...COMPRADORA, orgRole: 'owner' })),
    ).toBeNull()
  })

  it('13. admin activo también', () => {
    expect(
      evaluateRfqManagement(ADMIN, cotizacion(), pertenencia({ ...COMPRADORA, orgRole: 'admin' })),
    ).toBeNull()
  })

  it('14. member activo gestiona la propia', () => {
    expect(evaluateRfqManagement(MEMBER, cotizacion(), pertenencia(COMPRADORA))).toBeNull()
  })

  it('15. member no gestiona una ajena', () => {
    expect(evaluateRfqManagement(OTRO_MEMBER, cotizacion(), pertenencia(COMPRADORA))).toBe('FORBIDDEN')
  })

  it('16. pertenencia suspendida no gestiona, ni siendo owner', () => {
    const m = pertenencia({ ...COMPRADORA, orgRole: 'owner', membershipStatus: 'suspended' })
    expect(evaluateRfqManagement(OWNER, cotizacion(), m)).toBe('FORBIDDEN')
  })

  it('17. organización suspendida no gestiona, ni siendo owner', () => {
    const m = pertenencia({ ...COMPRADORA, orgRole: 'owner', organizationStatus: 'suspended' })
    expect(evaluateRfqManagement(OWNER, cotizacion(), m)).toBe('FORBIDDEN')
  })

  it('18. sin can_buy no gestiona', () => {
    expect(evaluateRfqManagement(MEMBER, cotizacion(), pertenencia({ canBuy: false }))).toBe('FORBIDDEN')
  })

  it('19. una suspensión nunca devuelve NO_ORGANIZATION: la pertenencia existe', () => {
    // El motivo importa: la Server Action traduce NO_ORGANIZATION y FORBIDDEN a
    // mensajes distintos, y decir «no tienes organización» a alguien suspendido
    // sería falso.
    const m = pertenencia({ ...COMPRADORA, membershipStatus: 'suspended' })
    expect(evaluateRfqManagement(MEMBER, cotizacion(), m)).toBe('FORBIDDEN')
  })

  it('20. el contenido publicado sigue congelado con estados activos', () => {
    // 6B.5 no toca la matriz aprobada en 6B.4.
    expect(
      evaluateRfqContentEdit(OWNER, cotizacion({ status: 'open' }), pertenencia({ ...COMPRADORA, orgRole: 'owner' })),
    ).toBe('FORBIDDEN')
    expect(evaluateRfqContentEdit(PLATAFORMA, cotizacion({ status: 'open' }), null)).toBe('FORBIDDEN')
  })

  it('21. platform_admin conserva su rama explícita, sin pertenencia', () => {
    expect(evaluateRfqManagement(PLATAFORMA, cotizacion({ organizationId: OTRA_ORG }), null)).toBeNull()
    expect(isValidRfqTransition('open', 'closed', true)).toBe(true)
    expect(isValidRfqTransition('closed', 'open', true)).toBe(true)
  })
})

// ── Lectura del histórico ───────────────────────────────────────────────────

describe('6B.5 · ver el histórico reproduce is_org_member()', () => {
  it('22. miembro activo SIN can_buy conserva la lectura', () => {
    expect(evaluateRfqVisibility(pertenencia({ canBuy: false }), cotizacion())).toBeNull()
  })

  it.each(['invited', 'suspended'] as const)(
    '23. pertenencia %s: sin lectura, igual que SQL',
    (estado) => {
      expect(evaluateRfqVisibility(pertenencia({ membershipStatus: estado }), cotizacion())).toBe(
        'FORBIDDEN',
      )
    },
  )

  it.each(['pending', 'suspended', 'rejected'] as const)(
    '24. organización %s: sin lectura, igual que SQL',
    (estado) => {
      expect(evaluateRfqVisibility(pertenencia({ organizationStatus: estado }), cotizacion())).toBe(
        'FORBIDDEN',
      )
    },
  )

  it('25. usuario de otra organización no lee', () => {
    expect(evaluateRfqVisibility(pertenencia({ organizationId: OTRA_ORG }), cotizacion())).toBe(
      'FORBIDDEN',
    )
  })

  it('26. sin contexto no lee', () => {
    expect(evaluateRfqVisibility(null, cotizacion())).toBe('NO_ORGANIZATION')
  })

  it('27. la lectura NO depende de la capacidad de compra', () => {
    // Si dependiera, retirar can_buy borraría el histórico de la vista.
    const sinCapacidad = pertenencia({ canBuy: false })
    expect(evaluateRfqVisibility(sinCapacidad, cotizacion())).toBeNull()
    expect(evaluateRfqCreation(sinCapacidad)).toBe('FORBIDDEN')
  })
})

// ── Coherencia entre lectura y capacidad ────────────────────────────────────

describe('6B.5 · coherencia de la interfaz', () => {
  it('28. quien puede crear siempre puede leer', () => {
    // La ruta /app/rfqs/nueva redirige a /app/rfqs, que debe tener contenido.
    const m = pertenencia(COMPRADORA)
    expect(evaluateRfqCreation(m)).toBeNull()
    expect(evaluateRfqVisibility(m, cotizacion())).toBeNull()
  })

  it('29. una suspensión retira lectura Y capacidad a la vez', () => {
    for (const m of [
      pertenencia({ ...COMPRADORA, membershipStatus: 'suspended' }),
      pertenencia({ ...COMPRADORA, organizationStatus: 'suspended' }),
    ]) {
      expect(evaluateRfqVisibility(m, cotizacion())).toBe('FORBIDDEN')
      expect(evaluateRfqCreation(m)).toBe('FORBIDDEN')
    }
  })

  it('30. ningún mensaje visible menciona estados internos ni jerga técnica', () => {
    for (const mensaje of Object.values(RFQ_MESSAGES)) {
      for (const tecnico of [
        'can_buy', 'can_sell', 'membership', 'RLS', 'policy', 'suspended', 'active',
        'organization_members', 'status', 'trigger',
      ]) {
        expect(mensaje.toLowerCase()).not.toContain(tecnico.toLowerCase())
      }
    }
  })
})

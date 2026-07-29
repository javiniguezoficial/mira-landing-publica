// Alta de organización con propietario — Bloque 6C.
//
// Módulo puro: fija la semántica que impone `create_organization_with_owner()`.
// La verificación real de RLS y de la atomicidad vive en SQL; estos tests
// detectan que el código y la función se separen.

import { describe, expect, it } from 'vitest'
import {
  ADMIN_ORGANIZATION_STATUSES,
  COMMERCIAL_PROFILE_OPTIONS,
  SIGNUP_MESSAGES,
  evaluateActivation,
  isValidInitialStatus,
  isValidOrganizationStatus,
  resolveInitialStatus,
  resolveOwnerCapabilities,
  signupErrorDetail,
  translateSignupError,
  validateNewOwner,
  validateOrganizationSignup,
} from './signup'

const PLANES = ['starter', 'business', 'enterprise']

function alta(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Acme Distribución S.L.',
    planSlug: 'business',
    commercialProfile: 'buyer',
    ...overrides,
  }
}

// ── 1-3. Registro, plan y manipulación ──────────────────────────────────────

describe('validateOrganizationSignup', () => {
  it('1. un alta completa y coherente se admite', () => {
    expect(validateOrganizationSignup(alta(), PLANES)).toBeNull()
  })

  it('2. solo se admiten planes del catálogo activo', () => {
    for (const slug of PLANES) {
      expect(validateOrganizationSignup(alta({ planSlug: slug }), PLANES)).toBeNull()
    }
  })

  it('3. un plan manipulado se rechaza', () => {
    // Inventado, desactivado, vacío o con precio incrustado: todos fuera.
    for (const slug of ['gratis', 'enterprise-pro', '', null, undefined, 'starter; drop table']) {
      expect(validateOrganizationSignup(alta({ planSlug: slug }), PLANES)).toBe(SIGNUP_MESSAGES.plan)
    }
  })

  it('3b. un plan que existe pero NO está activo se rechaza', () => {
    // La allowlist es la lista de activos, no el catálogo entero.
    expect(validateOrganizationSignup(alta({ planSlug: 'legacy' }), PLANES)).toBe(SIGNUP_MESSAGES.plan)
  })

  it('el nombre de empresa es obligatorio', () => {
    for (const nombre of ['', '   ', null, undefined]) {
      expect(validateOrganizationSignup(alta({ name: nombre }), PLANES)).toBe(SIGNUP_MESSAGES.nombre)
    }
  })

  it('el tipo comercial solo admite los tres valores reales del esquema', () => {
    for (const perfil of COMMERCIAL_PROFILE_OPTIONS) {
      expect(validateOrganizationSignup(alta({ commercialProfile: perfil }), PLANES)).toBeNull()
    }
    for (const perfil of ['admin', 'both', '', null, 'BUYER']) {
      expect(validateOrganizationSignup(alta({ commercialProfile: perfil }), PLANES)).toBe(
        SIGNUP_MESSAGES.perfilComercial,
      )
    }
  })

  it('sin planes disponibles no se puede dar de alta nada', () => {
    expect(validateOrganizationSignup(alta(), [])).toBe(SIGNUP_MESSAGES.plan)
  })
})

// ── 5. Propietario único y sus capacidades ──────────────────────────────────

describe('capacidades del propietario', () => {
  it('una empresa compradora concede can_buy', () => {
    expect(resolveOwnerCapabilities('buyer')).toEqual({ canBuy: true, canSell: false })
  })

  it('una empresa vendedora concede can_sell', () => {
    expect(resolveOwnerCapabilities('seller')).toEqual({ canBuy: false, canSell: true })
  })

  it('buyer_seller NO concede las dos: vender se habilita a mano', () => {
    // El portal de vendedor no existe todavía; conceder can_sell aquí sería
    // abrir una capacidad sin superficie que la ejercite.
    expect(resolveOwnerCapabilities('buyer_seller')).toEqual({ canBuy: true, canSell: false })
  })

  it('un perfil desconocido no concede nada', () => {
    expect(resolveOwnerCapabilities(null)).toEqual({ canBuy: false, canSell: false })
    expect(resolveOwnerCapabilities('otro')).toEqual({ canBuy: false, canSell: false })
  })
})

// ── Estado inicial: nunca lo decide el usuario ──────────────────────────────

describe('estado inicial de la empresa', () => {
  it('desde la landing SIEMPRE nace pendiente', () => {
    expect(resolveInitialStatus(false)).toBe('pending')
    // Aunque el navegador intente colar otro estado.
    expect(resolveInitialStatus(false, 'active')).toBe('pending')
    expect(resolveInitialStatus(false, 'suspended')).toBe('pending')
  })

  it('8. la administración puede crear ya activa', () => {
    expect(resolveInitialStatus(true, 'active')).toBe('active')
  })

  it('la administración puede dejarla pendiente', () => {
    expect(resolveInitialStatus(true, 'pending')).toBe('pending')
    expect(resolveInitialStatus(true)).toBe('pending')
  })

  it('un estado inválido cae en pendiente, nunca en activo', () => {
    for (const estado of ['suspended', 'rejected', 'borrado', '', null]) {
      expect(resolveInitialStatus(true, estado)).toBe('pending')
    }
  })

  it('solo pending y active son estados iniciales', () => {
    expect(isValidInitialStatus('pending')).toBe(true)
    expect(isValidInitialStatus('active')).toBe(true)
    expect(isValidInitialStatus('suspended')).toBe(false)
    expect(isValidInitialStatus('rejected')).toBe(false)
  })
})

// ── 8-10. Activar, suspender, reactivar ─────────────────────────────────────

describe('estados que la administración puede aplicar', () => {
  it('9-10. activar, suspender y reactivar son transiciones admitidas', () => {
    expect(isValidOrganizationStatus('active')).toBe(true)
    expect(isValidOrganizationStatus('suspended')).toBe(true)
    expect(isValidOrganizationStatus('pending')).toBe(true)
    expect(isValidOrganizationStatus('rejected')).toBe(true)
  })

  it('los cuatro estados coinciden con el CHECK real de organizations', () => {
    expect([...ADMIN_ORGANIZATION_STATUSES].sort()).toEqual(
      ['active', 'pending', 'rejected', 'suspended'],
    )
  })

  it('no se admite ningún estado inventado', () => {
    for (const estado of ['deleted', 'archived', 'cancelled', '', null, undefined]) {
      expect(isValidOrganizationStatus(estado)).toBe(false)
    }
  })
})

// ── Mensajes ────────────────────────────────────────────────────────────────

describe('mensajes de alta', () => {
  it('traduce los fallos de la función SQL', () => {
    expect(translateSignupError({ code: '23514', message: 'El plan seleccionado no está disponible.' }))
      .toBe(SIGNUP_MESSAGES.plan)
    expect(translateSignupError({ code: '23514', message: 'El tipo comercial no es válido.' }))
      .toBe(SIGNUP_MESSAGES.perfilComercial)
    expect(translateSignupError({ code: '42501', message: 'No puedes crear una organización para otra persona.' }))
      .toBe(SIGNUP_MESSAGES.propietario)
    expect(translateSignupError({ code: '42501', message: 'Debes iniciar sesión para crear una organización.' }))
      .toBe(SIGNUP_MESSAGES.sinSesion)
  })

  it('un error desconocido cae en el mensaje genérico', () => {
    expect(translateSignupError({ code: 'XX000', message: 'PG::InternalError' })).toBe(
      SIGNUP_MESSAGES.generico,
    )
    expect(translateSignupError(null)).toBe(SIGNUP_MESSAGES.generico)
  })

  it('ningún mensaje visible filtra jerga técnica', () => {
    const entradas = [
      { code: '23505', message: 'duplicate key value violates unique constraint "organization_members_single_owner_idx"' },
      { code: '42501', message: 'new row violates row-level security policy for table "organizations"' },
      { code: 'P0001', message: 'RAISE en public.create_organization_with_owner()' },
      null,
    ]
    for (const entrada of entradas) {
      const salida = translateSignupError(entrada)
      for (const prohibido of [
        'constraint', 'row-level', 'policy', 'pg_', 'public.', 'SQLSTATE', '23505', '42501',
        'organization_members', 'plan_id', 'signup_source',
      ]) {
        expect(salida.toLowerCase()).not.toContain(prohibido.toLowerCase())
      }
    }
  })

  it('los mensajes fijos tampoco mencionan columnas ni tablas', () => {
    for (const mensaje of Object.values(SIGNUP_MESSAGES)) {
      for (const tecnico of ['plan_id', 'org_role', 'can_buy', 'can_sell', 'RLS', 'policy', 'signup_source']) {
        expect(mensaje.toLowerCase()).not.toContain(tecnico.toLowerCase())
      }
    }
  })

  it('el detalle de registro conserva el código y no lleva datos personales', () => {
    const detalle = signupErrorDetail('alta desde landing', { code: '23514', message: 'x' })
    expect(detalle).toContain('23514')
    expect(detalle).not.toContain('@')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Ajuste 6C — plan SOLICITADO frente a plan ASIGNADO
// ═══════════════════════════════════════════════════════════════════════════
//
// El plan de la landing viaja en la metadata del registro, que el navegador
// escribe. Cambiar 'starter' por 'enterprise' es trivial desde las herramientas
// del navegador, así que nunca puede concederse solo.

describe('activación con plan confirmado', () => {
  it('5. activar exige confirmar un plan', () => {
    for (const sin of [null, undefined, '', '   ']) {
      expect(evaluateActivation(sin, PLANES)).toBe(SIGNUP_MESSAGES.planSinConfirmar)
    }
  })

  it('el plan confirmado debe existir en el catálogo activo', () => {
    expect(evaluateActivation('enterprise', PLANES)).toBeNull()
    expect(evaluateActivation('plan-inventado', PLANES)).toBe(SIGNUP_MESSAGES.plan)
  })

  it('6. pedir Enterprise no activa Enterprise: quien decide es quien activa', () => {
    // Lo solicitado desde la landing y lo asignado son dos cosas distintas.
    // Aquí se comprueba la parte pura: la activación solo mira el plan que la
    // administración confirma, y el solicitado no interviene.
    const solicitadoPorElNavegador = 'enterprise'
    const confirmadoPorAdmin = 'starter'

    expect(evaluateActivation(confirmadoPorAdmin, PLANES)).toBeNull()
    expect(confirmadoPorAdmin).not.toBe(solicitadoPorElNavegador)
  })

  it('el mensaje de plan sin confirmar no menciona columnas ni tablas', () => {
    for (const tecnico of ['plan_id', 'requested_plan_id', 'plan_approved_by', 'organizations']) {
      expect(SIGNUP_MESSAGES.planSinConfirmar.toLowerCase()).not.toContain(tecnico.toLowerCase())
    }
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Ajuste 6C — alta administrativa de un propietario que aún no tiene cuenta
// ═══════════════════════════════════════════════════════════════════════════

describe('propietario nuevo', () => {
  it('2. el correo es obligatorio y debe tener forma de correo', () => {
    for (const email of [null, undefined, '', '  ', 'sin-arroba', 'a@b', 'a@b.']) {
      expect(validateNewOwner({ email, firstName: 'Ana' })).toBe(SIGNUP_MESSAGES.emailInvalido)
    }
  })

  it('el nombre de la persona es obligatorio', () => {
    expect(validateNewOwner({ email: 'ana@empresa.com', firstName: '' })).toBe(
      SIGNUP_MESSAGES.nombrePersona,
    )
    expect(validateNewOwner({ email: 'ana@empresa.com', firstName: '   ' })).toBe(
      SIGNUP_MESSAGES.nombrePersona,
    )
  })

  it('con correo y nombre válidos se admite', () => {
    expect(validateNewOwner({ email: 'ana@empresa.com', firstName: 'Ana', lastName: 'Ruiz' })).toBeNull()
    // Los apellidos no son obligatorios.
    expect(validateNewOwner({ email: 'ana@empresa.com', firstName: 'Ana' })).toBeNull()
  })

  it('el mensaje de fallo no confirma si el correo ya tenía cuenta', () => {
    // Ni «ya existe» ni «no existe»: solo indica la alternativa.
    const mensaje = SIGNUP_MESSAGES.altaPropietario.toLowerCase()
    expect(mensaje).not.toContain('ya existe')
    expect(mensaje).not.toContain('ya está registrado')
    expect(mensaje).not.toContain('no existe')
  })

  it('ningún mensaje nuevo filtra jerga técnica', () => {
    for (const mensaje of [
      SIGNUP_MESSAGES.altaPropietario,
      SIGNUP_MESSAGES.invitacionEnviada,
      SIGNUP_MESSAGES.emailInvalido,
      SIGNUP_MESSAGES.nombrePersona,
    ]) {
      for (const tecnico of ['auth.users', 'service_role', 'RLS', 'policy', 'supabase', 'uuid']) {
        expect(mensaje.toLowerCase()).not.toContain(tecnico.toLowerCase())
      }
    }
  })
})

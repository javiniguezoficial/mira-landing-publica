// Alta administrativa de usuarios — reglas puras.

import { describe, expect, it } from 'vitest'
import {
  DEFAULT_PLATFORM_ROLE,
  NEW_USER_MESSAGES,
  NEW_USER_ORG_ROLES,
  NEW_USER_PLATFORM_ROLES,
  ORG_STATUSES_ACCEPTING_MEMBERS,
  buildNewUserSummary,
  capabilitiesExceedOrganization,
  isValidEmail,
  isValidPhone,
  normalizeEmail,
  normalizeName,
  normalizeNewUserOrgRole,
  normalizeNewUserPlatformRole,
  normalizePhone,
  organizationAcceptsNewMembers,
  resolveCapabilities,
  validateNewUser,
} from './new-user'

const BASE = {
  firstName: 'Ana',
  lastName: 'Pérez',
  email: 'ana@empresa.com',
  phone: '+34 600 000 000',
  platformRole: 'user' as const,
}

// ═══════════════════════════════════════════════════════════════════════════
// Rol de plataforma — la escalada es lo que hay que hacer imposible
// ═══════════════════════════════════════════════════════════════════════════

describe('rol de plataforma', () => {
  it('el valor por defecto es Usuario, nunca administrador', () => {
    expect(DEFAULT_PLATFORM_ROLE).toBe('user')
  })

  it('solo existen dos, y el desplegable empieza por el menos peligroso', () => {
    expect([...NEW_USER_PLATFORM_ROLES]).toEqual(['user', 'platform_admin'])
  })

  it('cualquier otro valor se rechaza: no hay escalada por cadena inventada', () => {
    for (const malo of ['admin', 'superadmin', 'PLATFORM_ADMIN', 'owner', '', null, 7, {}]) {
      expect(normalizeNewUserPlatformRole(malo), String(malo)).toBeNull()
    }
    expect(normalizeNewUserPlatformRole('platform_admin')).toBe('platform_admin')
    expect(normalizeNewUserPlatformRole('user')).toBe('user')
  })

  it('un rol de plataforma manipulado invalida el alta entera', () => {
    expect(validateNewUser({ ...BASE, platformRole: 'root' as never }))
      .toBe(NEW_USER_MESSAGES.rolPlataforma)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Rol de organización — el propietario queda fuera
// ═══════════════════════════════════════════════════════════════════════════

describe('rol dentro de la organización', () => {
  // DECISIÓN: el propietario es único por empresa y no se puede degradar.
  // Crearlo aquí abriría estados que ninguna pantalla sabe deshacer.
  it('NO admite `owner`, ni siquiera enviado a mano', () => {
    expect([...NEW_USER_ORG_ROLES]).toEqual(['admin', 'member'])
    expect(normalizeNewUserOrgRole('owner')).toBeNull()
  })

  it('admite miembro y administrador', () => {
    expect(normalizeNewUserOrgRole('member')).toBe('member')
    expect(normalizeNewUserOrgRole('admin')).toBe('admin')
  })

  it('con organización, el rol es obligatorio', () => {
    expect(validateNewUser({ ...BASE, organizationId: 'org-1', orgRole: null }))
      .toBe(NEW_USER_MESSAGES.rolOrganizacion)
    expect(validateNewUser({ ...BASE, organizationId: 'org-1', orgRole: 'owner' as never }))
      .toBe(NEW_USER_MESSAGES.rolOrganizacion)
  })

  it('sin organización, el rol de organización sobra', () => {
    expect(validateNewUser({ ...BASE, organizationId: null, orgRole: null })).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Correo — duplicados
// ═══════════════════════════════════════════════════════════════════════════

describe('correo electrónico', () => {
  it('se normaliza a minúsculas y sin espacios', () => {
    expect(normalizeEmail('  Ana@Empresa.COM ')).toBe('ana@empresa.com')
    expect(normalizeEmail('ANA@EMPRESA.COM')).toBe('ana@empresa.com')
  })

  // Sin esto se podrían crear dos cuentas para la misma dirección real.
  it('las variantes de mayúsculas son LA MISMA cuenta', () => {
    const variantes = ['ana@empresa.com', 'Ana@Empresa.com', 'ANA@EMPRESA.COM', ' ana@empresa.com ']
    const normalizadas = new Set(variantes.map(normalizeEmail))
    expect(normalizadas.size).toBe(1)
  })

  it('rechaza lo que no es un correo', () => {
    for (const malo of ['', '   ', 'ana', 'ana@', '@empresa.com', 'ana empresa.com', 'ana@empresa', null, undefined]) {
      expect(isValidEmail(malo as string), String(malo)).toBe(false)
    }
    expect(isValidEmail('ana@empresa.com')).toBe(true)
  })

  it('el correo es obligatorio', () => {
    expect(validateNewUser({ ...BASE, email: '' })).toBe(NEW_USER_MESSAGES.email)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Nombre y teléfono
// ═══════════════════════════════════════════════════════════════════════════

describe('nombre y teléfono', () => {
  it('el nombre es obligatorio y no vale en blanco', () => {
    expect(validateNewUser({ ...BASE, firstName: '' })).toBe(NEW_USER_MESSAGES.nombre)
    expect(validateNewUser({ ...BASE, firstName: '   ' })).toBe(NEW_USER_MESSAGES.nombre)
    expect(normalizeName('  Ana  ')).toBe('Ana')
    expect(normalizeName('   ')).toBeNull()
  })

  // `profiles.phone` es nullable y ningún flujo actual lo exige.
  it('el teléfono es OPCIONAL', () => {
    expect(isValidPhone(null)).toBe(true)
    expect(isValidPhone(undefined)).toBe(true)
    expect(isValidPhone('')).toBe(true)
    expect(validateNewUser({ ...BASE, phone: null })).toBeNull()
    expect(normalizePhone('   ')).toBeNull()
  })

  it('pero si se pone, tiene que parecer un teléfono', () => {
    expect(isValidPhone('+34 600 000 000')).toBe(true)
    expect(isValidPhone('600000000')).toBe(true)
    expect(isValidPhone('(+34) 600-00.00.00')).toBe(true)
    expect(isValidPhone('no es un teléfono')).toBe(false)
    expect(isValidPhone('12')).toBe(false)
    expect(validateNewUser({ ...BASE, phone: 'abc' })).toBe(NEW_USER_MESSAGES.telefono)
  })

  it('el teléfono se conserva tal cual lo escribió el administrador', () => {
    // La verificación real (SMS, unicidad) es de otro bloque: aquí solo se guarda.
    expect(normalizePhone(' +34 600 123 456 ')).toBe('+34 600 123 456')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Organizaciones que admiten miembros
// ═══════════════════════════════════════════════════════════════════════════

describe('qué organizaciones admiten un alta', () => {
  it('activa y pendiente sí', () => {
    expect([...ORG_STATUSES_ACCEPTING_MEMBERS]).toEqual(['active', 'pending'])
    expect(organizationAcceptsNewMembers('active')).toBe(true)
    expect(organizationAcceptsNewMembers('pending')).toBe(true)
  })

  // Añadir gente a una empresa suspendida crea cuentas que no pueden entrar.
  it('suspendida y rechazada NO', () => {
    expect(organizationAcceptsNewMembers('suspended')).toBe(false)
    expect(organizationAcceptsNewMembers('rejected')).toBe(false)
  })

  it('un estado desconocido o ausente NO', () => {
    expect(organizationAcceptsNewMembers(null)).toBe(false)
    expect(organizationAcceptsNewMembers(undefined)).toBe(false)
    expect(organizationAcceptsNewMembers('lo-que-sea')).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Capacidades — la tabla del perfil comercial
// ═══════════════════════════════════════════════════════════════════════════

describe('capacidades comerciales según el perfil', () => {
  const TODO = { canBuy: true, canSell: true }

  it('comprador: solo comprar', () => {
    expect(resolveCapabilities('buyer', TODO)).toEqual({ canBuy: true, canSell: false })
  })

  it('vendedor: solo vender', () => {
    expect(resolveCapabilities('seller', TODO)).toEqual({ canBuy: false, canSell: true })
  })

  it('comprador y vendedor: las dos', () => {
    expect(resolveCapabilities('buyer_seller', TODO)).toEqual({ canBuy: true, canSell: true })
  })

  it('sin perfil conocido: ninguna', () => {
    expect(resolveCapabilities(null, TODO)).toEqual({ canBuy: false, canSell: false })
  })

  it('nunca CONCEDE lo que no se pidió', () => {
    expect(resolveCapabilities('buyer_seller', { canBuy: false, canSell: false }))
      .toEqual({ canBuy: false, canSell: false })
    expect(resolveCapabilities('buyer_seller', {})).toEqual({ canBuy: false, canSell: false })
  })

  // Manipular el POST no concede nada: la comprobación es de servidor y compara
  // lo PEDIDO con el techo del perfil.
  it('detecta que se ha pedido más de lo que el perfil admite', () => {
    expect(capabilitiesExceedOrganization('buyer', { canSell: true })).toBe(true)
    expect(capabilitiesExceedOrganization('seller', { canBuy: true })).toBe(true)
    expect(capabilitiesExceedOrganization('buyer', { canBuy: true, canSell: true })).toBe(true)
    expect(capabilitiesExceedOrganization(null, { canBuy: true })).toBe(true)
  })

  it('y no se queja cuando la petición cabe', () => {
    expect(capabilitiesExceedOrganization('buyer', { canBuy: true })).toBe(false)
    expect(capabilitiesExceedOrganization('seller', { canSell: true })).toBe(false)
    expect(capabilitiesExceedOrganization('buyer_seller', { canBuy: true, canSell: true })).toBe(false)
    expect(capabilitiesExceedOrganization('buyer', {})).toBe(false)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Resumen previo
// ═══════════════════════════════════════════════════════════════════════════

describe('el resumen «Al confirmar»', () => {
  it('sin organización lo dice explícitamente', () => {
    const l = buildNewUserSummary({ email: 'ana@empresa.com', platformRole: 'user' })
    expect(l[0]).toContain('ana@empresa.com')
    expect(l[1]).toContain('Usuario')
    expect(l.join(' ')).toContain('No se asignará a ninguna organización')
  })

  it('con organización enumera empresa, rol y capacidades', () => {
    const l = buildNewUserSummary({
      email: 'ana@empresa.com', platformRole: 'user',
      organizationName: 'Acme Distribución S.L.', orgRole: 'member', canBuy: true,
    })
    const texto = l.join(' | ')
    expect(texto).toContain('Acme Distribución S.L.')
    expect(texto).toContain('Miembro')
    expect(texto).toContain('Capacidades: Comprar')
    expect(texto).not.toContain('Vender')
  })

  it('con las dos capacidades las nombra juntas', () => {
    const l = buildNewUserSummary({
      email: 'a@b.com', platformRole: 'user',
      organizationName: 'X', orgRole: 'admin', canBuy: true, canSell: true,
    })
    expect(l.join(' ')).toContain('Comprar y Vender')
  })

  it('sin ninguna capacidad no miente diciendo que hay alguna', () => {
    const l = buildNewUserSummary({
      email: 'a@b.com', platformRole: 'user', organizationName: 'X', orgRole: 'member',
    })
    expect(l.join(' ')).toContain('Sin capacidades comerciales')
  })

  it('el correo del resumen es el NORMALIZADO, que es el que se va a usar', () => {
    const l = buildNewUserSummary({ email: '  Ana@Empresa.COM ', platformRole: 'user' })
    expect(l[0]).toContain('ana@empresa.com')
  })

  it('avisa cuando se va a crear un administrador de MIRA', () => {
    const l = buildNewUserSummary({ email: 'a@b.com', platformRole: 'platform_admin' })
    expect(l[1]).toContain('Administrador MIRA')
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Entrada completa
// ═══════════════════════════════════════════════════════════════════════════

describe('validateNewUser — camino feliz', () => {
  it('acepta un alta mínima', () => {
    expect(validateNewUser({ firstName: 'Ana', email: 'ana@empresa.com', platformRole: 'user' }))
      .toBeNull()
  })

  it('acepta un alta completa con organización', () => {
    expect(validateNewUser({
      ...BASE, organizationId: 'org-1', orgRole: 'member', canBuy: true,
    })).toBeNull()
  })
})

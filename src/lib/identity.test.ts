import { describe, it, expect } from 'vitest'
import {
  resolveMemberRoles,
  resolveActiveMembership,
  normalizeOrganizationRole,
  normalizePlatformRole,
  isOwner,
  isOrgAdmin,
  isOrgMember,
  isPlatformAdmin,
  canBuy,
  canSell,
  organizationRoleLabel,
  platformRoleLabel,
  statusLabel,
  commercialProfileLabel,
  capabilitiesLabel,
  pickOwnerUserId,
  normalizeProfileStatus,
  normalizeOrganizationStatus,
  normalizeMembershipStatus,
  normalizeCommercialProfile,
} from '@/lib/identity'

// Estos helpers deciden quién puede administrar una organización y quién puede
// comprar o vender. La regla que más importa fijar es la negativa: un valor que
// no se reconozca NUNCA debe conceder privilegios. Durante la transición del
// Bloque 6A conviven valores legacy en base de datos, así que los adaptadores
// tienen que traducirlos sin ampliar permisos por accidente.

describe('normalizeOrganizationRole — adaptador legacy', () => {
  it('traduce los valores legacy al modelo nuevo', () => {
    expect(normalizeOrganizationRole('client_owner')).toBe('owner')
    expect(normalizeOrganizationRole('client_member')).toBe('member')
  })

  it('deja intactos los valores canónicos', () => {
    expect(normalizeOrganizationRole('owner')).toBe('owner')
    expect(normalizeOrganizationRole('admin')).toBe('admin')
    expect(normalizeOrganizationRole('member')).toBe('member')
  })

  it('caso inválido: los roles fantasma no se reconocen', () => {
    // org_owner/org_admin/org_member existían en TypeScript pero el CHECK de la
    // base de datos los habría rechazado. Tratarlos como válidos perpetuaría
    // una ficción, así que se consideran desconocidos.
    expect(normalizeOrganizationRole('org_owner')).toBeNull()
    expect(normalizeOrganizationRole('org_admin')).toBeNull()
    expect(normalizeOrganizationRole('org_member')).toBeNull()
  })

  it('caso inválido: nulos, vacíos y basura devuelven null', () => {
    expect(normalizeOrganizationRole(null)).toBeNull()
    expect(normalizeOrganizationRole(undefined)).toBeNull()
    expect(normalizeOrganizationRole('')).toBeNull()
    expect(normalizeOrganizationRole('OWNER')).toBeNull()   // sensible a mayúsculas a propósito
    expect(normalizeOrganizationRole('superadmin')).toBeNull()
  })
})

describe('normalizePlatformRole — adaptador legacy', () => {
  it('conserva platform_admin y colapsa los roles de cliente en user', () => {
    expect(normalizePlatformRole('platform_admin')).toBe('platform_admin')
    expect(normalizePlatformRole('user')).toBe('user')
    expect(normalizePlatformRole('client_owner')).toBe('user')
    expect(normalizePlatformRole('client_member')).toBe('user')
  })

  it('caso inválido: valores desconocidos devuelven null', () => {
    expect(normalizePlatformRole('admin')).toBeNull()   // 'admin' es rol de ORG, no global
    expect(normalizePlatformRole(null)).toBeNull()
    expect(normalizePlatformRole('')).toBeNull()
  })
})

describe('comprobaciones de rol organizativo', () => {
  it('isOwner es estricto: solo el propietario', () => {
    expect(isOwner('owner')).toBe(true)
    expect(isOwner('client_owner')).toBe(true)
    expect(isOwner('admin')).toBe(false)
    expect(isOwner('member')).toBe(false)
  })

  it('isOrgAdmin es jerárquico: el propietario también administra', () => {
    expect(isOrgAdmin('owner')).toBe(true)
    expect(isOrgAdmin('admin')).toBe(true)
    expect(isOrgAdmin('member')).toBe(false)
    expect(isOrgAdmin('client_member')).toBe(false)
  })

  it('isOrgMember acepta cualquier rol válido', () => {
    expect(isOrgMember('owner')).toBe(true)
    expect(isOrgMember('admin')).toBe(true)
    expect(isOrgMember('member')).toBe(true)
    expect(isOrgMember('client_owner')).toBe(true)
  })

  it('caso inválido: un valor desconocido no concede NINGÚN privilegio', () => {
    for (const basura of ['org_owner', 'superadmin', '', null, undefined]) {
      expect(isOwner(basura)).toBe(false)
      expect(isOrgAdmin(basura)).toBe(false)
      expect(isOrgMember(basura)).toBe(false)
    }
  })

  it('isPlatformAdmin no se confunde con el admin de organización', () => {
    expect(isPlatformAdmin('platform_admin')).toBe(true)
    expect(isPlatformAdmin('admin')).toBe(false)   // 'admin' es de organización
    expect(isPlatformAdmin('owner')).toBe(false)
    expect(isPlatformAdmin('user')).toBe(false)
  })
})

describe('capacidades comerciales', () => {
  it('lee can_buy y can_sell de forma independiente', () => {
    expect(canBuy({ can_buy: true, can_sell: false })).toBe(true)
    expect(canSell({ can_buy: true, can_sell: false })).toBe(false)
  })

  it('soporta un usuario con ambas capacidades', () => {
    const ambas = { can_buy: true, can_sell: true }
    expect(canBuy(ambas)).toBe(true)
    expect(canSell(ambas)).toBe(true)
  })

  it('caso límite: usuario sin ninguna capacidad', () => {
    const ninguna = { can_buy: false, can_sell: false }
    expect(canBuy(ninguna)).toBe(false)
    expect(canSell(ninguna)).toBe(false)
  })

  it('caso inválido: solo `true` estricto concede la capacidad', () => {
    // null/undefined/ausente no deben interpretarse como permiso.
    expect(canBuy({ can_buy: null })).toBe(false)
    expect(canBuy({})).toBe(false)
    expect(canBuy(null)).toBe(false)
    expect(canSell(undefined)).toBe(false)
  })
})

describe('etiquetas visibles en español', () => {
  it('traduce roles organizativos, incluidos los legacy', () => {
    expect(organizationRoleLabel('owner')).toBe('Propietario')
    expect(organizationRoleLabel('client_owner')).toBe('Propietario')
    expect(organizationRoleLabel('admin')).toBe('Administrador')
    expect(organizationRoleLabel('member')).toBe('Miembro')
    expect(organizationRoleLabel('client_member')).toBe('Miembro')
  })

  it('traduce roles globales, estados y perfil comercial', () => {
    expect(platformRoleLabel('platform_admin')).toBe('Administrador MIRA')
    expect(platformRoleLabel('user')).toBe('Usuario')
    expect(statusLabel('active')).toBe('Activo')
    expect(statusLabel('pending')).toBe('Pendiente')
    expect(statusLabel('invited')).toBe('Invitado')
    expect(commercialProfileLabel('buyer')).toBe('Comprador')
    expect(commercialProfileLabel('buyer_seller')).toBe('Comprador y vendedor')
  })

  it('resume las capacidades de un miembro', () => {
    expect(capabilitiesLabel({ can_buy: true, can_sell: true })).toBe('Compra y vende')
    expect(capabilitiesLabel({ can_buy: true, can_sell: false })).toBe('Compra')
    expect(capabilitiesLabel({ can_buy: false, can_sell: true })).toBe('Vende')
    expect(capabilitiesLabel({ can_buy: false, can_sell: false })).toBe('Sin capacidades comerciales')
  })

  it('caso inválido: un valor desconocido se muestra como guion, nunca como "undefined"', () => {
    expect(organizationRoleLabel('org_admin')).toBe('—')
    expect(organizationRoleLabel(null)).toBe('—')
    expect(platformRoleLabel('basura')).toBe('—')
    expect(statusLabel(null)).toBe('—')
  })
})

describe('resolveMemberRoles — lista de miembros de la organización', () => {
  // QA detectó "Miembros (0)" con la base de datos llena. La causa era una
  // consulta que fallaba en silencio, pero la resolución de roles también debe
  // ser correcta: el propietario cuenta como miembro y los valores legacy
  // deben seguir resolviéndose durante la transición.

  it('cuenta a TODOS los miembros, incluido el propietario', () => {
    const miembros = [
      { user_id: 'ana',   org_role: 'owner' },
      { user_id: 'luis',  org_role: 'member' },
      { user_id: 'marta', org_role: 'admin' },
    ]
    const resueltos = resolveMemberRoles(miembros)
    expect(resueltos).toHaveLength(3)
    expect(resueltos.map((m) => m.orgRole)).toEqual(['owner', 'member', 'admin'])
  })

  it('el propietario aparece en la lista, no se filtra', () => {
    const resueltos = resolveMemberRoles([{ user_id: 'ana', org_role: 'owner' }])
    expect(resueltos).toHaveLength(1)
    expect(resueltos[0].orgRole).toBe('owner')
  })

  it('usa org_role con prioridad y cae al legacy solo si falta', () => {
    const resueltos = resolveMemberRoles([
      { user_id: 'ana',  org_role: 'owner', role: 'client_owner' },
      { user_id: 'javi', org_role: null,    role: 'client_member' },  // solo legacy
      { user_id: 'eva',                     role: 'client_owner' },   // solo legacy
    ])
    expect(resueltos.map((m) => m.orgRole)).toEqual(['owner', 'member', 'owner'])
  })

  it('conserva el resto de campos y el orden de llegada', () => {
    const resueltos = resolveMemberRoles([
      { user_id: 'b', org_role: 'member', joined_at: '2026-02-01' },
      { user_id: 'a', org_role: 'owner',  joined_at: '2026-01-01' },
    ])
    expect(resueltos.map((m) => m.user_id)).toEqual(['b', 'a'])
    expect(resueltos[1].joined_at).toBe('2026-01-01')
  })

  it('caso límite: sin miembros devuelve lista vacía, no null', () => {
    expect(resolveMemberRoles([])).toEqual([])
    expect(resolveMemberRoles(null)).toEqual([])
    expect(resolveMemberRoles(undefined)).toEqual([])
  })

  it('caso inválido: un rol desconocido resuelve a null, pero el miembro sigue contando', () => {
    // Alguien con rol corrupto sigue siendo parte del equipo; lo que no obtiene
    // es ningún privilegio.
    const resueltos = resolveMemberRoles([{ user_id: 'x', org_role: 'org_admin' }])
    expect(resueltos).toHaveLength(1)
    expect(resueltos[0].orgRole).toBeNull()
  })
})

describe('resolveActiveMembership — pertenencia del usuario', () => {
  it('devuelve la primera pertenencia válida', () => {
    const m = resolveActiveMembership([{ organization_id: 'org-1' }, { organization_id: 'org-2' }])
    expect(m?.organization_id).toBe('org-1')
  })

  it('un platform_admin SIN pertenencia no obtiene ninguna organización', () => {
    // No se le inventa una empresa: gestiona clientes desde /admin.
    expect(resolveActiveMembership([])).toBeNull()
    expect(resolveActiveMembership(null)).toBeNull()
    expect(resolveActiveMembership(undefined)).toBeNull()
  })

  it('caso inválido: ignora filas sin organización', () => {
    expect(resolveActiveMembership([{ organization_id: null }])).toBeNull()
    expect(resolveActiveMembership([{ organization_id: '' }])).toBeNull()
  })
})

describe('etiquetas: ningún valor crudo llega a la interfaz', () => {
  // QA vio "Owner" en inglés en el panel de administración. Ninguna de estas
  // superficies debe mostrar el valor tal y como está en base de datos.
  it('traduce los cinco valores exigidos', () => {
    expect(organizationRoleLabel('owner')).toBe('Propietario')
    expect(organizationRoleLabel('admin')).toBe('Administrador')
    expect(organizationRoleLabel('member')).toBe('Miembro')
    expect(platformRoleLabel('user')).toBe('Usuario')
    expect(platformRoleLabel('platform_admin')).toBe('Administrador MIRA')
  })

  it('ninguna etiqueta devuelve el valor crudo en inglés', () => {
    const crudos = ['owner', 'admin', 'member', 'client_owner', 'client_member']
    for (const v of crudos) {
      const etiqueta = organizationRoleLabel(v)
      expect(etiqueta).not.toBe(v)
      expect(etiqueta).not.toBe('Owner')
      expect(etiqueta).not.toBe('Member')
    }
    for (const v of ['user', 'platform_admin', 'client_member']) {
      expect(platformRoleLabel(v)).not.toBe(v)
    }
  })
})

describe('pickOwnerUserId — elección determinista del propietario', () => {
  const a = { user_id: 'aaaa1111', joined_at: '2026-06-04T18:47:41.582183Z' }
  const b = { user_id: 'bbbb2222', joined_at: '2026-06-04T20:07:37.391177Z' }

  it('elige al miembro con joined_at más antiguo', () => {
    expect(pickOwnerUserId([b, a])).toBe('aaaa1111')
    expect(pickOwnerUserId([a, b])).toBe('aaaa1111')
  })

  it('el resultado no depende del orden de entrada', () => {
    expect(pickOwnerUserId([a, b])).toBe(pickOwnerUserId([b, a]))
  })

  it('caso límite: desempata por user_id cuando joined_at coincide', () => {
    const mismo = '2026-06-04T18:47:41.582183Z'
    const x = { user_id: 'zzzz9999', joined_at: mismo }
    const y = { user_id: 'aaaa0000', joined_at: mismo }
    expect(pickOwnerUserId([x, y])).toBe('aaaa0000')
    expect(pickOwnerUserId([y, x])).toBe('aaaa0000')
  })

  it('caso límite: un único miembro es el propietario', () => {
    expect(pickOwnerUserId([a])).toBe('aaaa1111')
  })

  it('no muta el array recibido', () => {
    const entrada = [b, a]
    pickOwnerUserId(entrada)
    expect(entrada[0].user_id).toBe('bbbb2222')
  })

  it('caso inválido: sin miembros o con datos malformados devuelve null', () => {
    expect(pickOwnerUserId([])).toBeNull()
    expect(pickOwnerUserId(null)).toBeNull()
    expect(pickOwnerUserId(undefined)).toBeNull()
    expect(pickOwnerUserId([{ user_id: null, joined_at: null }] as never)).toBeNull()
  })

  // ── Preferencia por miembro cliente frente a administrador de plataforma ──
  // La propiedad de una empresa cliente no debe recaer en una cuenta interna de
  // MIRA: dejaría al cliente dependiendo de nosotros para gestionar su empresa.

  it('prefiere un miembro normal aunque el platform_admin sea MÁS ANTIGUO', () => {
    // Reproduce el caso real: el admin entró a las 18:47 y el cliente a las 20:07.
    const admin  = { user_id: '867e813e', joined_at: '2026-06-04T18:47:41.582183Z', platform_role: 'platform_admin' }
    const cliente = { user_id: 'ef9f8075', joined_at: '2026-06-04T20:07:37.391177Z', platform_role: 'client_member' }
    expect(pickOwnerUserId([admin, cliente])).toBe('ef9f8075')
    expect(pickOwnerUserId([cliente, admin])).toBe('ef9f8075')
  })

  it('reconoce el rol global tanto legacy como canónico', () => {
    const admin = { user_id: 'aaaa0000', joined_at: '2026-01-01T00:00:00Z', platform_role: 'platform_admin' }
    const legacy = { user_id: 'zzzz9999', joined_at: '2026-02-01T00:00:00Z', platform_role: 'client_member' }
    const canonico = { user_id: 'yyyy8888', joined_at: '2026-03-01T00:00:00Z', platform_role: 'user' }
    expect(pickOwnerUserId([admin, legacy, canonico])).toBe('zzzz9999')
  })

  it('fallback: usa el platform_admin más antiguo si NO hay otro miembro', () => {
    // Una organización sin propietario es peor que una con propietario interno.
    const admin1 = { user_id: 'bbbb2222', joined_at: '2026-06-04T18:47:41Z', platform_role: 'platform_admin' }
    const admin2 = { user_id: 'aaaa1111', joined_at: '2026-06-05T10:00:00Z', platform_role: 'platform_admin' }
    expect(pickOwnerUserId([admin2, admin1])).toBe('bbbb2222')
  })

  it('el fallback también desempata por user_id', () => {
    const mismo = '2026-06-04T18:47:41Z'
    const admin1 = { user_id: 'zzzz9999', joined_at: mismo, platform_role: 'platform_admin' }
    const admin2 = { user_id: 'aaaa0000', joined_at: mismo, platform_role: 'platform_admin' }
    expect(pickOwnerUserId([admin1, admin2])).toBe('aaaa0000')
  })

  it('sin platform_role informado, el miembro se considera candidato normal', () => {
    // Compatibilidad: si no se pasa el rol, no se penaliza al miembro.
    const sinRol = { user_id: 'aaaa1111', joined_at: '2026-06-04T18:47:41Z' }
    const admin  = { user_id: 'bbbb2222', joined_at: '2026-06-03T00:00:00Z', platform_role: 'platform_admin' }
    expect(pickOwnerUserId([admin, sinRol])).toBe('aaaa1111')
  })
})

// ── Normalizadores de estado (6B.1) ─────────────────────────────────────────

describe('normalizadores de estado', () => {
  it('normalizeProfileStatus acepta los cuatro estados canónicos', () => {
    expect(normalizeProfileStatus('pending')).toBe('pending')
    expect(normalizeProfileStatus('active')).toBe('active')
    expect(normalizeProfileStatus('suspended')).toBe('suspended')
    expect(normalizeProfileStatus('rejected')).toBe('rejected')
  })

  it('normalizeProfileStatus devuelve null ante lo desconocido', () => {
    expect(normalizeProfileStatus('activo')).toBeNull()
    expect(normalizeProfileStatus('')).toBeNull()
    expect(normalizeProfileStatus(null)).toBeNull()
    expect(normalizeProfileStatus(undefined)).toBeNull()
  })

  it('normalizeOrganizationStatus acepta los estados canónicos', () => {
    expect(normalizeOrganizationStatus('active')).toBe('active')
    expect(normalizeOrganizationStatus('suspended')).toBe('suspended')
    expect(normalizeOrganizationStatus('invited')).toBeNull()
  })

  it('normalizeMembershipStatus distingue invited de los demás', () => {
    expect(normalizeMembershipStatus('invited')).toBe('invited')
    expect(normalizeMembershipStatus('active')).toBe('active')
    expect(normalizeMembershipStatus('suspended')).toBe('suspended')
    expect(normalizeMembershipStatus('rejected')).toBeNull()
  })

  it('normalizeCommercialProfile acepta los tres perfiles', () => {
    expect(normalizeCommercialProfile('buyer')).toBe('buyer')
    expect(normalizeCommercialProfile('seller')).toBe('seller')
    expect(normalizeCommercialProfile('buyer_seller')).toBe('buyer_seller')
    expect(normalizeCommercialProfile('comprador')).toBeNull()
  })
})

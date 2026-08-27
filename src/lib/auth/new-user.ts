// Alta administrativa de usuarios: reglas y validación.
//
// Módulo PURO. No importa Supabase ni React: solo decide qué entrada es válida
// y qué está permitido. Lo usan la Server Action y la pantalla, para que no
// puedan contradecirse.
//
// ═══════════════════════════════════════════════════════════════════════════
// QUÉ RESUELVE ESTE FLUJO, Y QUÉ NO
// ═══════════════════════════════════════════════════════════════════════════
//
// Hasta ahora había dos formas de que naciera una cuenta:
//
//   · registro público — la persona se da de alta y crea su empresa;
//   · `createOrganizationForNewOwner` — alta de una empresa NUEVA junto con su
//     propietario, en un solo paso.
//
// Faltaba la tercera, que es la que se pide: dar de alta a UNA PERSONA, con o
// sin empresa, sin obligarla a pasar por el registro público. El registro
// público sigue intacto: son dos canales distintos y no comparten pantalla.
//
// ── Lo que este flujo NO hace, a propósito ───────────────────────────────
//
//   · no crea organizaciones. Se elige una que ya existe, o ninguna;
//   · no asigna `owner`. El propietario tiene reglas propias —es único por
//     empresa y no se puede degradar— y crearlo desde aquí abriría estados
//     incoherentes que hoy nadie sabe deshacer. Para eso está
//     `createOrganizationForNewOwner`;
//   · no pide contraseña. Nadie de MIRA debe conocer la de un cliente: la
//     establece la propia persona desde el enlace de la invitación;
//   · no toca planes ni trials;
//   · no lo puede usar un administrador de organización. En esta fase solo
//     `platform_admin` crea cuentas.

import type { CommercialProfile } from '@/lib/identity'
import { organizationAllows } from './user-admin'

// ═══════════════════════════════════════════════════════════════════════════
// Rol dentro de la organización
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Los roles que ESTE flujo admite. `owner` queda fuera deliberadamente.
 *
 * No es la misma lista que `ASSIGNABLE_ORG_ROLES` de `user-admin.ts`, que sí
 * incluye `owner` porque allí se asigna una cuenta YA EXISTENTE a una empresa
 * que puede no tener propietario todavía. Aquí la cuenta se está creando: si el
 * alta fallara a medias, un `owner` a medio crear deja la empresa en un estado
 * que ninguna pantalla sabe arreglar.
 */
export const NEW_USER_ORG_ROLES = ['admin', 'member'] as const
export type NewUserOrgRole = (typeof NEW_USER_ORG_ROLES)[number]

export const NEW_USER_ORG_ROLE_LABELS: Record<NewUserOrgRole, string> = {
  admin: 'Administrador',
  member: 'Miembro',
}

export function normalizeNewUserOrgRole(raw: unknown): NewUserOrgRole | null {
  if (typeof raw !== 'string') return null
  return NEW_USER_ORG_ROLES.find((r) => r === raw) ?? null
}

// ═══════════════════════════════════════════════════════════════════════════
// Rol de plataforma
// ═══════════════════════════════════════════════════════════════════════════

/**
 * `user` es el valor por defecto y `platform_admin` hay que elegirlo a mano.
 *
 * Conceder `platform_admin` da acceso al panel de MIRA entero: a todos los
 * clientes, a todos los precios y a la exportación de proveedores. Que el
 * desplegable empiece en `Usuario` no es cortesía: es lo que hace que el error
 * por descuido sea imposible en la dirección peligrosa.
 */
export const NEW_USER_PLATFORM_ROLES = ['user', 'platform_admin'] as const
export type NewUserPlatformRole = (typeof NEW_USER_PLATFORM_ROLES)[number]

export const DEFAULT_PLATFORM_ROLE: NewUserPlatformRole = 'user'

export const NEW_USER_PLATFORM_ROLE_LABELS: Record<NewUserPlatformRole, string> = {
  user: 'Usuario',
  platform_admin: 'Administrador MIRA',
}

export function normalizeNewUserPlatformRole(raw: unknown): NewUserPlatformRole | null {
  if (typeof raw !== 'string') return null
  return NEW_USER_PLATFORM_ROLES.find((r) => r === raw) ?? null
}

// ═══════════════════════════════════════════════════════════════════════════
// Entrada
// ═══════════════════════════════════════════════════════════════════════════

export interface NewUserInput {
  firstName: string
  lastName?: string | null
  email: string
  phone?: string | null
  platformRole: NewUserPlatformRole
  /** `null` = sin organización. */
  organizationId?: string | null
  orgRole?: NewUserOrgRole | null
  canBuy?: boolean
  canSell?: boolean
}

export const NEW_USER_MESSAGES = {
  nombre: 'El nombre es obligatorio.',
  email: 'Introduce un correo electrónico válido.',
  telefono: 'El teléfono introducido no es válido.',
  rolPlataforma: 'El rol de plataforma seleccionado no es válido.',
  rolOrganizacion: 'Elige el rol que tendrá dentro de la organización.',
  orgNoExiste: 'La organización seleccionada ya no existe.',
  orgNoAdmite: 'La organización seleccionada no admite nuevos miembros ahora mismo.',
  capacidad:
    'La organización seleccionada no admite esa capacidad comercial según su perfil.',
  permiso: 'No tienes permiso para realizar esta acción.',
  yaExiste: 'Ya existe una cuenta de MIRA con ese correo electrónico.',
  generico: 'No se ha podido crear el usuario. Vuelve a intentarlo en unos minutos.',
} as const

/**
 * Normaliza el correo para poder compararlo.
 *
 * Minúsculas y sin espacios: `Ana@Empresa.com`, `ana@empresa.com` y
 * ` ana@empresa.com ` son la MISMA cuenta. Sin esto, el administrador podría
 * crear un duplicado que después nadie sabría distinguir, y el usuario tendría
 * dos cuentas con la misma dirección real.
 *
 * La misma normalización se aplica en SQL (`admin_find_user_by_email`, 045), y
 * es imprescindible que las dos coincidan: si aquí se compara en minúsculas y
 * allí no, la comprobación de duplicados no serviría de nada.
 */
export function normalizeEmail(raw: string | null | undefined): string {
  return typeof raw === 'string' ? raw.trim().toLowerCase() : ''
}

/** Mismo patrón que `validateNewOwner`, para no tener dos ideas de «correo válido». */
export function isValidEmail(raw: string | null | undefined): boolean {
  const email = typeof raw === 'string' ? raw.trim() : ''
  return email.length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

/**
 * Teléfono: OPCIONAL en este bloque.
 *
 * `profiles.phone` es nullable y ningún flujo actual lo exige, así que aquí
 * tampoco. Solo se rechaza lo que evidentemente no es un teléfono, para no
 * guardar basura. La VERIFICACIÓN real —SMS, unicidad, antifraude— pertenece al
 * bloque de prevención de abuso y no se adelanta aquí.
 */
export function isValidPhone(raw: string | null | undefined): boolean {
  if (raw === null || raw === undefined) return true
  const v = String(raw).trim()
  if (v.length === 0) return true

  // Se comprueba en dos pasos en vez de con un patrón único: qué CARACTERES se
  // admiten y cuántos DÍGITOS hay. Un patrón que intente las dos cosas a la vez
  // acaba rechazando formatos legítimos —`(+34) 600-00.00.00` es uno— por el
  // sitio donde cae el `+`.
  if (!/^[+\d\s().-]+$/.test(v)) return false

  const digitos = v.replace(/\D/g, '')
  return digitos.length >= 6 && digitos.length <= 20
}

export function normalizePhone(raw: string | null | undefined): string | null {
  const v = typeof raw === 'string' ? raw.trim() : ''
  return v.length > 0 ? v : null
}

/** Recorta espacios y devuelve `null` si no queda nada. */
export function normalizeName(raw: string | null | undefined): string | null {
  const v = typeof raw === 'string' ? raw.trim() : ''
  return v.length > 0 ? v : null
}

/**
 * Valida la FORMA de la entrada. No mira la base de datos.
 *
 * Devuelve el primer problema, o `null` si todo está bien. Lo que depende del
 * estado —que la organización exista, que no haya un duplicado— se comprueba en
 * la acción, contra la base y después de autorizar.
 */
export function validateNewUser(input: NewUserInput): string | null {
  if (!normalizeName(input.firstName)) return NEW_USER_MESSAGES.nombre
  if (!isValidEmail(input.email)) return NEW_USER_MESSAGES.email
  if (!isValidPhone(input.phone)) return NEW_USER_MESSAGES.telefono
  if (!normalizeNewUserPlatformRole(input.platformRole)) return NEW_USER_MESSAGES.rolPlataforma

  // La organización es opcional; el rol dentro de ella, no. Sin rol no se sabe
  // qué pertenencia crear, y elegir uno por defecto sería decidir por el
  // administrador algo que cambia lo que esa persona podrá hacer.
  if (input.organizationId) {
    if (!normalizeNewUserOrgRole(input.orgRole)) return NEW_USER_MESSAGES.rolOrganizacion
  }

  return null
}

// ═══════════════════════════════════════════════════════════════════════════
// Organizaciones que pueden recibir miembros
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Estados de empresa que admiten un alta.
 *
 * `pending` SÍ entra: es el estado de una empresa recién dada de alta que
 * todavía no se ha activado, y poder ir preparando su equipo antes de abrirle
 * el acceso es justamente para lo que sirve. `suspended` y `rejected` no:
 * añadir gente a una empresa suspendida crea cuentas que no pueden entrar y
 * que nadie recuerda haber creado.
 */
export const ORG_STATUSES_ACCEPTING_MEMBERS = ['active', 'pending'] as const

export function organizationAcceptsNewMembers(status: string | null | undefined): boolean {
  return (ORG_STATUSES_ACCEPTING_MEMBERS as readonly string[]).includes(status ?? '')
}

// ═══════════════════════════════════════════════════════════════════════════
// Capacidades
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Recorta las capacidades al perfil comercial de la empresa.
 *
 * Se apoya en `organizationAllows` de `user-admin.ts`, que es la FUENTE ÚNICA
 * que ya usan la ficha de usuario, el equipo de la organización y la edición
 * administrativa. Aquí no se reimplementa la tabla comprador/vendedor: si esa
 * regla cambia algún día, cambia en un sitio.
 *
 *   comprador           → comprar sí, vender no
 *   vendedor            → comprar no, vender sí
 *   comprador+vendedor  → las dos
 *
 * Solo RETIRA, nunca concede: una capacidad se da porque alguien la marca, no
 * porque el perfil la permita.
 */
export function resolveCapabilities(
  commercialProfile: CommercialProfile | null,
  requested: { canBuy?: boolean; canSell?: boolean },
): { canBuy: boolean; canSell: boolean } {
  return {
    canBuy: requested.canBuy === true && organizationAllows(commercialProfile, 'buy'),
    canSell: requested.canSell === true && organizationAllows(commercialProfile, 'sell'),
  }
}

/**
 * ¿Se ha pedido algo que el perfil no permite?
 *
 * Recortar en silencio sería cómodo y equivocado: el administrador marcó una
 * casilla y tiene que enterarse de que no se le va a conceder. Si la petición
 * excede el techo, la acción FALLA en lugar de crear al usuario con menos
 * permisos de los que se pidió.
 */
export function capabilitiesExceedOrganization(
  commercialProfile: CommercialProfile | null,
  requested: { canBuy?: boolean; canSell?: boolean },
): boolean {
  const permitido = resolveCapabilities(commercialProfile, requested)
  return (
    permitido.canBuy !== (requested.canBuy === true) ||
    permitido.canSell !== (requested.canSell === true)
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// Resumen previo
// ═══════════════════════════════════════════════════════════════════════════

export interface NewUserSummaryInput {
  email: string
  platformRole: NewUserPlatformRole
  organizationName?: string | null
  orgRole?: NewUserOrgRole | null
  canBuy?: boolean
  canSell?: boolean
}

/**
 * Las frases del bloque «Al confirmar».
 *
 * Existe para que lo que se le enseña al administrador salga de los MISMOS
 * datos que se van a enviar, y no de un texto escrito aparte que pueda quedarse
 * desfasado. Un resumen que miente es peor que no tener resumen.
 */
export function buildNewUserSummary(input: NewUserSummaryInput): string[] {
  const lineas = [
    `Se invitará a ${normalizeEmail(input.email) || '—'}`,
    `Su rol de plataforma será ${NEW_USER_PLATFORM_ROLE_LABELS[input.platformRole]}`,
  ]

  if (input.organizationName) {
    lineas.push(`Se añadirá a ${input.organizationName}`)
    if (input.orgRole) lineas.push(`Rol: ${NEW_USER_ORG_ROLE_LABELS[input.orgRole]}`)

    const capacidades = [
      input.canBuy ? 'Comprar' : null,
      input.canSell ? 'Vender' : null,
    ].filter(Boolean)
    lineas.push(
      capacidades.length > 0
        ? `Capacidades: ${capacidades.join(' y ')}`
        : 'Sin capacidades comerciales asignadas',
    )
  } else {
    lineas.push('No se asignará a ninguna organización')
  }

  return lineas
}

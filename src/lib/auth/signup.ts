// Alta de organización con propietario (Bloque 6C).
//
// Módulo PURO. Espeja lo que valida `create_organization_with_owner()` en SQL,
// para dar mensajes claros antes de llegar a la base de datos. La autoridad
// sigue siendo la función: es SECURITY DEFINER y comprueba todo por su cuenta,
// porque el formulario vive en el navegador y no se le puede creer nada.

import type { CommercialProfile } from '@/lib/identity'

/** Perfiles comerciales admitidos al dar de alta una empresa. */
export const COMMERCIAL_PROFILE_OPTIONS = ['buyer', 'seller', 'buyer_seller'] as const

/** Estados que la administración puede fijar al crear. Nunca los elige el usuario. */
export const ADMIN_INITIAL_STATUSES = ['pending', 'active'] as const
export type AdminInitialStatus = (typeof ADMIN_INITIAL_STATUSES)[number]

/** Estados de organización que la administración puede aplicar después del alta. */
export const ADMIN_ORGANIZATION_STATUSES = ['pending', 'active', 'suspended', 'rejected'] as const
export type AdminOrganizationStatus = (typeof ADMIN_ORGANIZATION_STATUSES)[number]

export interface OrganizationSignupInput {
  name?: string | null
  planSlug?: string | null
  commercialProfile?: string | null
  cifNif?: string | null
  country?: string | null
  phone?: string | null
}

export const SIGNUP_MESSAGES = {
  nombre: 'El nombre de la empresa es obligatorio.',
  plan: 'El plan seleccionado no está disponible.',
  perfilComercial: 'El tipo comercial no es válido.',
  estado: 'El estado indicado no es válido.',
  propietario: 'Selecciona la persona que será propietaria de la empresa.',
  yaTieneOrganizacion: 'Esta persona ya pertenece a una organización.',
  generico: 'No se ha podido completar el alta. Vuelve a intentarlo.',
  sinSesion: 'Debes iniciar sesión para completar el alta.',
  planSinConfirmar: 'Confirma el plan asignado antes de activar el cliente.',
  emailInvalido: 'Introduce un correo electrónico válido.',
  nombrePersona: 'El nombre de la persona propietaria es obligatorio.',
  altaPropietario:
    'No se ha podido preparar el alta con ese correo. Si esa persona ya tiene cuenta, selecciónala en la lista de usuarios.',
  invitacionEnviada:
    'Hemos preparado el alta. La persona propietaria recibirá un correo para establecer su contraseña.',
} as const

/**
 * ¿Es válido el alta?
 *
 * `planesDisponibles` son los slugs que la base de datos tiene ACTIVOS. Se pasa
 * como parámetro en lugar de codificarlo aquí: el catálogo vive en `plans` y
 * codificarlo sería inventarse una segunda fuente de verdad que se
 * desincronizaría en cuanto alguien añadiera un plan.
 *
 * Devuelve el mensaje de error, o `null` si el alta puede seguir.
 */
export function validateOrganizationSignup(
  input: OrganizationSignupInput,
  planesDisponibles: readonly string[],
): string | null {
  if (!input.name || input.name.trim().length === 0) return SIGNUP_MESSAGES.nombre

  const perfil = input.commercialProfile
  if (!perfil || !COMMERCIAL_PROFILE_OPTIONS.includes(perfil as never)) {
    return SIGNUP_MESSAGES.perfilComercial
  }

  // Allowlist real: el slug tiene que existir y estar activo. Ni el precio ni
  // los límites del plan viajan nunca desde el navegador.
  const slug = input.planSlug?.trim()
  if (!slug || !planesDisponibles.includes(slug)) return SIGNUP_MESSAGES.plan

  return null
}

/**
 * Capacidades del propietario según el perfil comercial de su empresa.
 *
 * Réplica exacta de la función SQL, y coherente con el techo que impone
 * `enforce_membership_rules`. En `buyer_seller` NO se conceden las dos: vender
 * se habilita a mano cuando exista el portal de vendedor.
 */
export function resolveOwnerCapabilities(
  commercialProfile: CommercialProfile | string | null | undefined,
): { canBuy: boolean; canSell: boolean } {
  return {
    canBuy: commercialProfile === 'buyer' || commercialProfile === 'buyer_seller',
    canSell: commercialProfile === 'seller',
  }
}

/** ¿Puede la administración fijar este estado al crear la empresa? */
export function isValidInitialStatus(status: string | null | undefined): status is AdminInitialStatus {
  return ADMIN_INITIAL_STATUSES.includes(status as never)
}

/** ¿Puede la administración aplicar este estado a una empresa existente? */
export function isValidOrganizationStatus(
  status: string | null | undefined,
): status is AdminOrganizationStatus {
  return ADMIN_ORGANIZATION_STATUSES.includes(status as never)
}

/**
 * Estado con el que nace una empresa según quién la crea.
 *
 * Desde la landing SIEMPRE `pending`: no hay cobro y el acceso da entrada a
 * Market Intelligence y al catálogo de proveedores, así que activa una persona.
 * La administración sí puede crear ya activa.
 */
export function resolveInitialStatus(
  esPlatformAdmin: boolean,
  solicitado?: string | null,
): AdminInitialStatus {
  if (!esPlatformAdmin) return 'pending'
  return isValidInitialStatus(solicitado) ? solicitado : 'pending'
}

/**
 * ¿Se puede activar esta organización?
 *
 * Activar exige confirmar el plan ASIGNADO. El plan que llegó de la landing es
 * solo una solicitud —viaja en la metadata del registro, que el navegador
 * escribe—, así que nunca basta por sí solo. Réplica de la puerta que impone
 * `protect_organization_columns` en SQL.
 *
 * Devuelve el mensaje de error, o `null` si se puede activar.
 */
export function evaluateActivation(
  planSlugAprobado: string | null | undefined,
  planesDisponibles: readonly string[],
): string | null {
  const slug = planSlugAprobado?.trim()
  if (!slug) return SIGNUP_MESSAGES.planSinConfirmar
  if (!planesDisponibles.includes(slug)) return SIGNUP_MESSAGES.plan
  return null
}

/** Datos mínimos para dar de alta a un propietario que todavía no tiene cuenta. */
export interface NewOwnerInput {
  email?: string | null
  firstName?: string | null
  lastName?: string | null
}

/** Validación del propietario nuevo. Devuelve el mensaje de error, o `null`. */
export function validateNewOwner(input: NewOwnerInput): string | null {
  const email = input.email?.trim() ?? ''
  // Comprobación deliberadamente simple: quien valida de verdad el correo es
  // Supabase Auth al enviar la invitación.
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return SIGNUP_MESSAGES.emailInvalido
  if (!input.firstName || input.firstName.trim().length === 0) return SIGNUP_MESSAGES.nombrePersona
  return null
}

/** Traduce un fallo de la RPC a un mensaje mostrable, sin filtrar nada interno. */
export function translateSignupError(error: { code?: string | null; message?: string | null } | null): string {
  if (!error) return SIGNUP_MESSAGES.generico

  const texto = (error.message ?? '').toLowerCase()

  if (texto.includes('plan seleccionado')) return SIGNUP_MESSAGES.plan
  if (texto.includes('tipo comercial')) return SIGNUP_MESSAGES.perfilComercial
  if (texto.includes('nombre de la empresa')) return SIGNUP_MESSAGES.nombre
  if (texto.includes('estado indicado')) return SIGNUP_MESSAGES.estado
  if (texto.includes('iniciar sesión')) return SIGNUP_MESSAGES.sinSesion
  if (texto.includes('usuario indicado no existe')) return SIGNUP_MESSAGES.propietario
  if (texto.includes('otra persona')) return SIGNUP_MESSAGES.propietario

  return SIGNUP_MESSAGES.generico
}

/** Detalle para el registro del servidor. Sin datos personales. */
export function signupErrorDetail(
  operacion: string,
  error: { code?: string | null; message?: string | null } | null | undefined,
): string {
  return `[alta] ${operacion} falló: ${error?.code ?? 'sin código'} ${error?.message ?? ''}`.trim()
}

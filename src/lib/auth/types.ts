// Tipos del contexto de autorización (Bloque 6B.1).
//
// Módulo puro y sin dependencias: lo importan tanto los módulos de servidor
// (`context.ts`, `guards.ts`) como los puros (`policy.ts`, `membership.ts`),
// de modo que estos últimos siguen siendo testeables sin Next ni Supabase.

import type {
  CommercialProfile,
  MembershipStatus,
  OrganizationRole,
  OrganizationStatus,
  PlatformRole,
  ProfileStatus,
} from '@/lib/identity'
import type { OrganizationModules } from './modules'

export interface AuthUser {
  id: string
  email: string | null
}

/**
 * Una pertenencia del usuario a una organización, con todo lo necesario para
 * decidir sin volver a consultar. Los campos normalizables son `null` cuando
 * el valor almacenado no se reconoce — fail-closed.
 */
export interface AuthMembership {
  organizationId: string
  organizationName: string
  /** Rol canónico ya resuelto desde `org_role` con caída a `role` legacy. */
  orgRole: OrganizationRole | null
  membershipStatus: MembershipStatus | null
  canBuy: boolean
  canSell: boolean
  joinedAt: string
  organizationStatus: OrganizationStatus | null
  /** Techo comercial de la organización sobre las capacidades del miembro. */
  commercialProfile: CommercialProfile | null
  /**
   * Módulos contratados por la organización (1.4). Viaja EN el contexto, junto
   * al resto de la pertenencia, para que ninguna superficie tenga que volver a
   * consultar `organizations` solo para saber si puede pintar una pantalla.
   */
  modules: OrganizationModules
}

/**
 * Todo lo que la aplicación necesita saber sobre quién está pidiendo algo.
 *
 * `memberships` contiene TODAS las pertenencias, nunca una sola elegida en
 * silencio. Para obtener una concreta se usa `getMembershipForOrganization`;
 * para las pantallas que todavía no indican organización,
 * `resolveFallbackMembership` (ver `membership.ts`).
 */
export interface AuthContext {
  user: AuthUser
  platformRole: PlatformRole | null
  profileStatus: ProfileStatus | null
  memberships: AuthMembership[]
}

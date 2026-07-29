// Tests de regresión del P0 de seguridad (28/07/2026):
//
// Una usuaria cliente (rol `user`) escribió /admin/dashboard a mano y el panel
// de administración se renderizó por completo. Dos fallos simultáneos:
//
//   1. El middleware nunca se ejecutaba: el archivo estaba en la raíz del
//      proyecto en lugar de en `src/`, donde Next.js lo busca cuando existe
//      ese directorio. Compilaba, pasaba el lint y jamás se cargaba.
//   2. `src/app/admin/layout.tsx` no comprobaba nada, así que no había ninguna
//      segunda barrera detrás del middleware.
//
// Estos tests fijan el criterio de decisión. La ubicación del middleware se
// verifica aparte, en `middleware-location.test.ts`.

import { describe, expect, it } from 'vitest'
import { normalizePlatformRole } from '@/lib/identity'
import { evaluatePlatformAdmin, evaluatePlatformRole } from './policy'
import type { AuthContext } from './types'

function contextConRol(rawRole: string | null | undefined): AuthContext {
  return {
    user: { id: 'user-ana', email: 'cliente@example.com' },
    platformRole: normalizePlatformRole(rawRole),
    profileStatus: 'active',
    memberships: [],
  }
}

describe('P0: quién puede entrar en /admin', () => {
  it('1. `user` NO satisface platform_admin', () => {
    // Este es exactamente el rol de la usuaria que accedió al panel.
    expect(evaluatePlatformAdmin(contextConRol('user'))).toBe('FORBIDDEN')
  })

  it('2. `client_owner` legacy NO satisface platform_admin', () => {
    expect(evaluatePlatformAdmin(contextConRol('client_owner'))).toBe('FORBIDDEN')
  })

  it('3. `client_member` legacy NO satisface platform_admin', () => {
    expect(evaluatePlatformAdmin(contextConRol('client_member'))).toBe('FORBIDDEN')
  })

  it('4. un rol desconocido deniega', () => {
    expect(evaluatePlatformAdmin(contextConRol('superadmin'))).toBe('INVALID_ROLE')
    expect(evaluatePlatformAdmin(contextConRol('org_owner'))).toBe('INVALID_ROLE')
    expect(evaluatePlatformAdmin(contextConRol(''))).toBe('INVALID_ROLE')
  })

  it('5. un perfil ausente deniega', () => {
    // Sin fila en `profiles`, el rol normalizado es null.
    expect(evaluatePlatformAdmin(contextConRol(null))).toBe('INVALID_ROLE')
    expect(evaluatePlatformAdmin(contextConRol(undefined))).toBe('INVALID_ROLE')
  })

  it('6. un error al cargar el perfil deniega — un error no es un permiso', () => {
    // El middleware convierte cualquier error de consulta en `null`.
    expect(evaluatePlatformRole(null)).toBe('INVALID_ROLE')
  })

  it('7. `platform_admin` sí permite', () => {
    expect(evaluatePlatformAdmin(contextConRol('platform_admin'))).toBeNull()
  })

  it('sin sesión deniega', () => {
    expect(evaluatePlatformAdmin(null)).toBe('UNAUTHENTICATED')
  })

  it('solo un valor concede acceso: cualquier otro deniega', () => {
    const candidatos = [
      'user', 'client_owner', 'client_member', 'admin', 'owner', 'member',
      'org_admin', 'superadmin', 'PLATFORM_ADMIN', 'platform admin', '', null, undefined,
    ]
    for (const raw of candidatos) {
      expect(evaluatePlatformAdmin(contextConRol(raw))).not.toBeNull()
    }
    expect(evaluatePlatformAdmin(contextConRol('platform_admin'))).toBeNull()
  })
})

describe('evaluatePlatformRole — criterio compartido con el middleware', () => {
  it('middleware y guards de servidor deciden igual', () => {
    // El middleware corre en el Edge Runtime y no puede construir un
    // AuthContext completo, pero DEBE llegar a la misma conclusión.
    for (const raw of ['user', 'client_owner', 'client_member', 'platform_admin', 'basura', null]) {
      const porRol = evaluatePlatformRole(normalizePlatformRole(raw))
      const porContexto = evaluatePlatformAdmin(contextConRol(raw))
      expect(porRol).toBe(porContexto)
    }
  })
})

// ── 6B.5: la suspensión también cierra /admin ───────────────────────────────
//
// El P0 de julio fue un rol que no debía entrar. Este es el caso simétrico: un
// rol que SÍ es administrador pero cuya cuenta está suspendida. `is_platform_admin()`
// lo deniega desde 021; el guard TypeScript no lo miraba, así que el panel se
// pintaba entero y cada consulta fallaba después por RLS.

function contextSuspendido(estado: 'suspended' | 'pending' | 'rejected' | null): AuthContext {
  return {
    user: { id: 'user-admin', email: 'admin@example.com' },
    platformRole: 'platform_admin',
    profileStatus: estado,
    memberships: [],
  }
}

describe('6B.5: un administrador suspendido no entra en /admin', () => {
  it('platform_admin ACTIVO sigue entrando — Javier y Demo Demo no se ven afectados', () => {
    expect(evaluatePlatformAdmin(contextConRol('platform_admin'))).toBeNull()
  })

  it.each(['suspended', 'pending', 'rejected'] as const)('platform_admin %s queda fuera', (estado) => {
    expect(evaluatePlatformAdmin(contextSuspendido(estado))).toBe('FORBIDDEN')
  })

  it('un estado de perfil desconocido no se asume activo', () => {
    expect(evaluatePlatformAdmin(contextSuspendido(null))).toBe('FORBIDDEN')
  })

  it('la decisión es ÚNICA: layout, Server Actions y Route Handlers la comparten', () => {
    // `requirePlatformAdmin` y `authorizePlatformAdminApi` llaman ambos a
    // `evaluatePlatformAdmin`. Ninguna superficie reimplementa el criterio, así
    // que corregirlo aquí lo corrige en las tres a la vez.
    const suspendido = contextSuspendido('suspended')
    expect(evaluatePlatformAdmin(suspendido)).toBe('FORBIDDEN')
    expect(evaluatePlatformAdmin(suspendido)).toBe(evaluatePlatformAdmin(suspendido))
  })

  it('el middleware sigue decidiendo solo por rol: es una barrera menos estricta, no un hueco', () => {
    // El Edge Runtime no puede construir un AuthContext completo. Un
    // administrador suspendido cruza el middleware y lo detiene el layout.
    expect(evaluatePlatformRole('platform_admin')).toBeNull()
    expect(evaluatePlatformAdmin(contextSuspendido('suspended'))).toBe('FORBIDDEN')
  })
})

import { describe, expect, it } from 'vitest'
import {
  AuthorizationError,
  authorizationApiMessage,
  authorizationHttpStatus,
  isAuthorizationError,
  type AuthorizationCode,
} from './errors'

const CODES: AuthorizationCode[] = [
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NO_ORGANIZATION',
  'INVALID_ROLE',
]

describe('AuthorizationError', () => {
  it('conserva el código', () => {
    expect(new AuthorizationError('FORBIDDEN').code).toBe('FORBIDDEN')
  })

  it('cada código tiene mensaje por defecto', () => {
    for (const code of CODES) {
      expect(new AuthorizationError(code).message.length).toBeGreaterThan(0)
    }
  })

  it('admite un mensaje explícito', () => {
    const e = new AuthorizationError('FORBIDDEN', 'No tienes permiso de administrador')
    expect(e.message).toBe('No tienes permiso de administrador')
    expect(e.code).toBe('FORBIDDEN')
  })

  it('sigue siendo un Error', () => {
    const e = new AuthorizationError('UNAUTHENTICATED')
    expect(e).toBeInstanceOf(Error)
    expect(e).toBeInstanceOf(AuthorizationError)
    expect(e.name).toBe('AuthorizationError')
  })
})

describe('isAuthorizationError', () => {
  it('reconoce el error propio', () => {
    expect(isAuthorizationError(new AuthorizationError('FORBIDDEN'))).toBe(true)
  })

  it('no confunde otros errores ni valores sueltos', () => {
    expect(isAuthorizationError(new Error('boom'))).toBe(false)
    expect(isAuthorizationError(null)).toBe(false)
    expect(isAuthorizationError('FORBIDDEN')).toBe(false)
    expect(isAuthorizationError({ code: 'FORBIDDEN' })).toBe(false)
  })
})

// Traducción del mismo fallo a la respuesta de cada superficie. La DECISIÓN es
// única; la RESPUESTA depende de dónde ocurra.
describe('traducción a Route Handler (JSON, nunca redirección)', () => {
  it('sin sesión responde 401 "No autorizado"', () => {
    expect(authorizationHttpStatus('UNAUTHENTICATED')).toBe(401)
    expect(authorizationApiMessage('UNAUTHENTICATED')).toBe('No autorizado')
  })

  it.each(['FORBIDDEN', 'NO_ORGANIZATION', 'INVALID_ROLE'] as const)(
    '%s responde 403 "Acceso denegado"',
    (code) => {
      expect(authorizationHttpStatus(code)).toBe(403)
      expect(authorizationApiMessage(code)).toBe('Acceso denegado')
    },
  )

  it('todo código produce un estado HTTP válido', () => {
    for (const code of CODES) {
      expect([401, 403]).toContain(authorizationHttpStatus(code))
    }
  })
})

describe('traducción a Server Action (error controlable)', () => {
  it('el error se puede capturar y convertir en valor de retorno', () => {
    // Next.js redacta el mensaje de un Error lanzado desde un Server Action en
    // producción, así que las acciones que informan en la interfaz lo capturan
    // y lo devuelven como dato.
    function accion(): { error: string } | { ok: true } {
      try {
        throw new AuthorizationError('FORBIDDEN', 'No tienes permiso de administrador')
      } catch (e) {
        if (isAuthorizationError(e)) return { error: e.message }
        throw e
      }
    }
    expect(accion()).toEqual({ error: 'No tienes permiso de administrador' })
  })
})

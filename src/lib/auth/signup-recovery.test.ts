// Recuperación del alta pública · las decisiones puras.
//
// El caso real (14-09-2026): correo confirmado 5 min 25 s después del
// registro, canje PKCE muerto con `flow_state_expired`, cuenta activa sin
// organización y un `/login?error=auth` que además no pintaba mensaje.

import { describe, expect, it } from 'vitest'
import {
  AUTH_ERROR_LOGIN_PATH,
  EMAIL_CONFIRMED_LOGIN_PATH,
  FLOW_STATE_ERROR_CODES,
  LOGIN_NOTICES,
  ONBOARDING_COMPLETED_KEY,
  callbackFailureRedirect,
  isFlowStateError,
  loginNoticeFor,
  needsOnboardingCompletion,
} from './signup-recovery'

describe('isFlowStateError', () => {
  it('reconoce los dos códigos de flow state de GoTrue', () => {
    expect(isFlowStateError('flow_state_expired')).toBe(true)
    expect(isFlowStateError('flow_state_not_found')).toBe(true)
    expect(FLOW_STATE_ERROR_CODES.size).toBe(2)
  })

  it('cualquier otro código NO lo es: un token inválido de verdad no debe decir «confirmado»', () => {
    for (const code of ['otp_expired', 'access_denied', 'bad_code_verifier', '', null, undefined]) {
      expect(isFlowStateError(code), String(code)).toBe(false)
    }
  })
})

describe('callbackFailureRedirect', () => {
  it('flow state caducado → «tu correo ya está confirmado», porque /verify ya corrió', () => {
    expect(callbackFailureRedirect('flow_state_expired')).toBe(EMAIL_CONFIRMED_LOGIN_PATH)
    expect(callbackFailureRedirect('flow_state_not_found')).toBe(EMAIL_CONFIRMED_LOGIN_PATH)
  })

  it('el resto conserva el destino genérico de siempre', () => {
    expect(callbackFailureRedirect('otp_expired')).toBe(AUTH_ERROR_LOGIN_PATH)
    expect(callbackFailureRedirect(undefined)).toBe(AUTH_ERROR_LOGIN_PATH)
  })

  it('los dos destinos son rutas internas: sin esquema, sin host', () => {
    for (const ruta of [EMAIL_CONFIRMED_LOGIN_PATH, AUTH_ERROR_LOGIN_PATH]) {
      expect(ruta.startsWith('/')).toBe(true)
      expect(ruta.startsWith('//')).toBe(false)
      expect(ruta).not.toContain('://')
    }
  })
})

describe('loginNoticeFor', () => {
  it('email-confirmado pinta el aviso informativo, no un error', () => {
    const aviso = loginNoticeFor({ aviso: 'email-confirmado' })
    expect(aviso).toBe(LOGIN_NOTICES.emailConfirmado)
    expect(aviso?.tone).toBe('info')
    expect(aviso?.text).toContain('ya está confirmado')
    // Nunca decir que el enlace es inválido cuando la confirmación SÍ ocurrió.
    expect(aviso?.text.toLowerCase()).not.toContain('inválido')
  })

  it('error=auth por fin cuenta algo, y en tono de error', () => {
    const aviso = loginNoticeFor({ error: 'auth' })
    expect(aviso?.tone).toBe('error')
    expect(aviso?.text).toContain('caducado')
  })

  it('lista cerrada: valores desconocidos no pintan nada (no hay inyección de texto)', () => {
    expect(loginNoticeFor({})).toBeNull()
    expect(loginNoticeFor({ aviso: '<script>alert(1)</script>' })).toBeNull()
    expect(loginNoticeFor({ error: 'otra-cosa' })).toBeNull()
    expect(loginNoticeFor({ aviso: 'EMAIL-CONFIRMADO' })).toBeNull()
  })
})

describe('needsOnboardingCompletion', () => {
  const META_PENDIENTE = {
    company: 'Entornodev Multimedia SLU',
    plan_slug: 'starter',
    commercial_profile: 'buyer_seller',
    cif_nif: 'B38179334',
  }

  it('empresa en metadata y sin marca → alta pendiente', () => {
    expect(needsOnboardingCompletion(META_PENDIENTE)).toBe(true)
  })

  it('con la marca de completado deja de disparar: no hay llamada en cada login', () => {
    expect(
      needsOnboardingCompletion({ ...META_PENDIENTE, [ONBOARDING_COMPLETED_KEY]: '2026-09-14T17:00:00Z' }),
    ).toBe(false)
  })

  it('una cuenta invitada por un administrador nunca dispara: no lleva company', () => {
    expect(needsOnboardingCompletion({ first_name: 'Ana', last_name: 'López' })).toBe(false)
  })

  it('metadata incompleta o rara falla en seco hacia «no»', () => {
    expect(needsOnboardingCompletion(null)).toBe(false)
    expect(needsOnboardingCompletion(undefined)).toBe(false)
    expect(needsOnboardingCompletion({})).toBe(false)
    expect(needsOnboardingCompletion({ company: '' })).toBe(false)
    expect(needsOnboardingCompletion({ company: '   ' })).toBe(false)
    expect(needsOnboardingCompletion({ company: 42 })).toBe(false)
  })
})

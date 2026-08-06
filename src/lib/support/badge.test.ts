// Aviso de tickets de soporte (039).

import { describe, expect, it } from 'vitest'
import {
  BADGE_MAX,
  PENDING_TICKET_STATUSES,
  badgeAriaLabel,
  formatBadgeCount,
  isPendingTicketStatus,
} from './badge'

describe('qué cuenta como pendiente', () => {
  // `support_tickets` NO tiene ninguna columna de lectura, así que «no leído»
  // no se puede responder con el modelo real. Se cuenta lo que sí sabe decir.
  it('son exactamente open e in_progress', () => {
    expect([...PENDING_TICKET_STATUSES]).toEqual(['open', 'in_progress'])
  })

  it('un ticket resuelto o cerrado ya no requiere atención', () => {
    expect(isPendingTicketStatus('resolved')).toBe(false)
    expect(isPendingTicketStatus('closed')).toBe(false)
  })

  it('reconoce los pendientes y rechaza lo que no conoce', () => {
    expect(isPendingTicketStatus('open')).toBe(true)
    expect(isPendingTicketStatus('in_progress')).toBe(true)
    expect(isPendingTicketStatus('')).toBe(false)
    expect(isPendingTicketStatus(null)).toBe(false)
    expect(isPendingTicketStatus(3)).toBe(false)
  })
})

describe('formatBadgeCount', () => {
  // Un «0» permanente junto a Soporte comunica lo mismo que no poner nada y
  // además parece un aviso.
  it('0 no pinta badge', () => {
    expect(formatBadgeCount(0)).toBeNull()
  })

  it('1 pinta «1»', () => {
    expect(formatBadgeCount(1)).toBe('1')
  })

  it('99 pinta «99»', () => {
    expect(formatBadgeCount(99)).toBe('99')
  })

  it('100 pinta «99+»', () => {
    expect(formatBadgeCount(100)).toBe('99+')
  })

  it('cualquier cantidad mayor sigue siendo «99+»', () => {
    expect(formatBadgeCount(4321)).toBe('99+')
  })

  it('el tope es 99', () => {
    expect(BADGE_MAX).toBe(99)
    expect(formatBadgeCount(BADGE_MAX)).toBe('99')
    expect(formatBadgeCount(BADGE_MAX + 1)).toBe('99+')
  })

  // Un contador roto no debe pintar un aviso falso.
  it('caso inválido: negativo, NaN, null y no numérico no pintan nada', () => {
    for (const v of [-1, -99, Number.NaN, Infinity, null, undefined]) {
      expect(formatBadgeCount(v as number), `${v}`).toBeNull()
    }
  })

  it('trunca decimales en lugar de redondear hacia arriba', () => {
    expect(formatBadgeCount(2.9)).toBe('2')
    expect(formatBadgeCount(0.9)).toBeNull()
  })
})

describe('texto accesible', () => {
  // El badge es un número suelto: para un lector de pantalla «Soporte 3» no
  // dice qué son esos tres.
  it('sin pendientes deja la etiqueta tal cual', () => {
    expect(badgeAriaLabel('Soporte', 0)).toBe('Soporte')
    expect(badgeAriaLabel('Soporte', null)).toBe('Soporte')
  })

  it('con uno concuerda en singular', () => {
    expect(badgeAriaLabel('Soporte', 1)).toBe('Soporte: 1 ticket pendiente')
  })

  it('con varios usa el plural y el número REAL, no el recortado', () => {
    expect(badgeAriaLabel('Soporte', 5)).toBe('Soporte: 5 tickets pendientes')
    // Aunque el badge diga «99+», quien lo oye recibe la cifra exacta.
    expect(badgeAriaLabel('Soporte', 250)).toBe('Soporte: 250 tickets pendientes')
  })
})

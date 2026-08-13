// Estado de respuesta de un ticket para su propietario (Bloque 2).
//
// Estos tests congelan la conclusión del análisis que hay en `ticket-view.ts`:
// con el esquema ACTUAL se puede decir «tiene respuesta» y no se puede decir
// «no leída». Si alguien añadiera después una función que pretenda saberlo sin
// migración, aquí quedará claro que el dato no existe.

import { describe, expect, it } from 'vitest'
import {
  TICKET_RESPONSE_LABELS,
  countAnswered,
  hasAdminResponse,
  ticketListHint,
  ticketResponseState,
} from './ticket-view'

describe('hasAdminResponse', () => {
  it('detecta una respuesta con contenido', () => {
    expect(hasAdminResponse({ admin_response: 'Ya está resuelto.', status: 'resolved' })).toBe(true)
  })

  it('un ticket SIN respuesta no inventa ninguna', () => {
    expect(hasAdminResponse({ admin_response: null, status: 'open' })).toBe(false)
  })

  it('una respuesta en blanco NO cuenta como respuesta', () => {
    // El formulario del administrador guarda `null` cuando el textarea queda
    // vacío, pero un guardado con solo espacios no debe encender la señal.
    for (const vacio of ['', '   ', '\n', '\t  \n']) {
      expect(hasAdminResponse({ admin_response: vacio, status: 'open' }), JSON.stringify(vacio)).toBe(false)
    }
  })

  it('tolera entradas ausentes', () => {
    expect(hasAdminResponse(null)).toBe(false)
    expect(hasAdminResponse(undefined)).toBe(false)
  })
})

describe('ticketResponseState', () => {
  it('answered cuando hay respuesta, awaiting cuando no', () => {
    expect(ticketResponseState({ admin_response: 'Hola', status: 'in_progress' })).toBe('answered')
    expect(ticketResponseState({ admin_response: null, status: 'open' })).toBe('awaiting')
  })

  it('responder NO es lo mismo que resolver: son ejes distintos', () => {
    // Respondido pero todavía en proceso.
    expect(ticketResponseState({ admin_response: 'Lo miramos', status: 'in_progress' })).toBe('answered')
    // Cerrado sin haber escrito respuesta.
    expect(ticketResponseState({ admin_response: null, status: 'closed' })).toBe('awaiting')
  })

  it('las etiquetas nombran la marca y no filtran nada técnico', () => {
    expect(TICKET_RESPONSE_LABELS.answered).toContain('MIRA')
    for (const t of Object.values(TICKET_RESPONSE_LABELS)) {
      expect(t).not.toMatch(/admin_response|status|null|rls|policy/i)
    }
  })
})

describe('recuento y texto de ayuda del listado', () => {
  const conRespuesta = { admin_response: 'Hecho', status: 'resolved' }
  const sinRespuesta = { admin_response: null, status: 'open' }

  it('cuenta solo las que tienen respuesta real', () => {
    expect(countAnswered([conRespuesta, sinRespuesta, { admin_response: '  ', status: 'open' }])).toBe(1)
    expect(countAnswered([])).toBe(0)
  })

  it('sin solicitudes no se dice nada', () => {
    expect(ticketListHint([])).toBe('')
  })

  it('sin respuestas todavía, se promete el aviso por correo', () => {
    expect(ticketListHint([sinRespuesta])).toContain('correo')
  })

  it('con respuestas, se dice cuántas — en singular y en plural', () => {
    expect(ticketListHint([conRespuesta, sinRespuesta])).toContain('1 de tus solicitudes')
    expect(ticketListHint([conRespuesta, conRespuesta])).toContain('2 de tus solicitudes')
  })
})

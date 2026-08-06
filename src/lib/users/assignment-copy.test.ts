// Textos del bloque de asignación a organizaciones.

import { describe, expect, it } from 'vitest'
import {
  CURRENT_MEMBERSHIPS_SECTION,
  OWNER_ASSIGNMENT_ACKNOWLEDGEMENT,
  OWNER_ASSIGNMENT_WARNING,
  assignmentSectionHelp,
  assignmentSectionTitle,
  requiresOwnerConfirmation,
} from './assignment-copy'

describe('título del bloque', () => {
  it('sin ninguna organización dice «Asignar a una organización»', () => {
    expect(assignmentSectionTitle(0)).toBe('Asignar a una organización')
  })

  // El fallo detectado en pruebas: con un usuario que YA pertenecía a una
  // empresa, «Asignar a una organización» invitaba a usar este bloque para
  // moverlo de sitio, cuando lo que hace es añadirle una segunda pertenencia.
  it('con una o más dice «Añadir a otra organización»', () => {
    expect(assignmentSectionTitle(1)).toBe('Añadir a otra organización')
    expect(assignmentSectionTitle(4)).toBe('Añadir a otra organización')
  })

  it('los dos títulos son distintos', () => {
    expect(assignmentSectionTitle(0)).not.toBe(assignmentSectionTitle(1))
  })
})

describe('texto aclaratorio', () => {
  it('sin organizaciones explica que no crea cuentas ni invitaciones', () => {
    const t = assignmentSectionHelp(0)
    expect(t).toContain('empresa existente')
    expect(t).toContain('No crea cuentas')
  })

  // Las tres cosas que el texto tiene que dejar dichas cuando ya hay
  // pertenencias: que crea una nueva, que no edita las actuales, y dónde se
  // editan las actuales.
  it('con organizaciones dice que crea una NUEVA', () => {
    expect(assignmentSectionHelp(1)).toContain('NUEVA')
  })

  it('con organizaciones dice que NO modifica las que ya tiene', () => {
    expect(assignmentSectionHelp(1)).toContain('no modifica las que ya tiene')
  })

  it('con organizaciones remite a «Organizaciones y permisos»', () => {
    expect(assignmentSectionHelp(1)).toContain(CURRENT_MEMBERSHIPS_SECTION)
    expect(CURRENT_MEMBERSHIPS_SECTION).toBe('Organizaciones y permisos')
  })

  it('los dos textos son distintos y ninguno está vacío', () => {
    expect(assignmentSectionHelp(0)).not.toBe(assignmentSectionHelp(1))
    expect(assignmentSectionHelp(0).length).toBeGreaterThan(20)
    expect(assignmentSectionHelp(1).length).toBeGreaterThan(20)
  })
})

describe('advertencia de propiedad', () => {
  // Conceder la propiedad es la única asignación que el panel no puede deshacer
  // después, porque retirar o degradar al único propietario dejaría la
  // organización sin ninguno.
  it('solo se exige confirmación reforzada para «owner»', () => {
    expect(requiresOwnerConfirmation('owner')).toBe(true)
    expect(requiresOwnerConfirmation('admin')).toBe(false)
    expect(requiresOwnerConfirmation('member')).toBe(false)
  })

  it('la advertencia dice qué pasa y por qué no se puede revertir', () => {
    expect(OWNER_ASSIGNMENT_WARNING).toContain('se convertirá en propietaria')
    expect(OWNER_ASSIGNMENT_WARNING).toContain('única propietaria')
    expect(OWNER_ASSIGNMENT_WARNING).toContain('no podrá degradarse')
    expect(OWNER_ASSIGNMENT_WARNING).toContain('desactivarse')
    expect(OWNER_ASSIGNMENT_WARNING).toContain('retirarse')
    expect(OWNER_ASSIGNMENT_WARNING).toContain('transferir la propiedad')
  })

  it('la casilla de confirmación dice exactamente qué se está aceptando', () => {
    expect(OWNER_ASSIGNMENT_ACKNOWLEDGEMENT).toContain('no se puede deshacer')
  })

  // La advertencia informa; NO relaja ninguna regla. Si algún día alguien
  // añadiera aquí una excepción, este test lo delata.
  it('no promete ninguna excepción ni forma de saltarse la protección', () => {
    const texto = `${OWNER_ASSIGNMENT_WARNING} ${OWNER_ASSIGNMENT_ACKNOWLEDGEMENT}`.toLowerCase()
    for (const palabra of ['excepto', 'salvo que', 'podrás retirarlo', 'forzar']) {
      expect(texto, palabra).not.toContain(palabra)
    }
  })
})

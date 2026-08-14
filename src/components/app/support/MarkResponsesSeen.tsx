'use client'

import { useEffect, useRef } from 'react'
import { markMySupportResponsesSeen } from '@/lib/actions/support'

interface Props {
  /**
   * Cuántas respuestas SIN LEER trae la página renderizada en servidor.
   * Con `0` no se hace absolutamente nada: ni una llamada.
   */
  unreadCount: number
}

/**
 * Marca las respuestas propias como vistas al entrar en Ayuda (041/042).
 *
 * No pinta nada. Existe solo porque «leer» es un efecto del navegador —la
 * persona ha llegado a la pantalla donde las respuestas se muestran— y un
 * Server Component no puede escribir durante el render.
 *
 * ── Por qué esto NO genera un bucle ni escrituras por request ─────────────
 *
 * Tres cierres, en este orden:
 *
 *   1. `unreadCount === 0` → no se llama. En la inmensa mayoría de visitas a
 *      Ayuda no hay nada que marcar, y entonces esto no cuesta ni una petición.
 *   2. `yaLanzado` → una sola llamada por montaje, aunque React vuelva a
 *      ejecutar el efecto (Strict Mode en desarrollo lo hace dos veces).
 *   3. la acción NO revalida. El badge se recalcula en el layout en la
 *      siguiente navegación, que es el comportamiento pedido. Si revalidara,
 *      la propia revalidación volvería a montar este componente y ahí sí
 *      habría riesgo de ciclo.
 *
 * ── Por qué no se refresca la pantalla ────────────────────────────────────
 *
 * Porque la persona está leyendo. Refrescar haría desaparecer los marcadores
 * «Nueva» delante de sus ojos, justo mientras mira el texto que los motivó.
 * Se marcan en segundo plano y el aviso baja cuando navegue.
 */
export function MarkResponsesSeen({ unreadCount }: Props) {
  const yaLanzado = useRef(false)

  useEffect(() => {
    if (unreadCount <= 0 || yaLanzado.current) return
    yaLanzado.current = true

    // Sin `await`: el resultado no cambia nada de lo que se está viendo. Los
    // fallos se registran dentro de la acción, que nunca lanza.
    void markMySupportResponsesSeen()
  }, [unreadCount])

  return null
}

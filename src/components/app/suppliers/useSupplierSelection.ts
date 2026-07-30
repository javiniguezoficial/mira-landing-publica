'use client'

import { useMemo, useState } from 'react'

/**
 * Selección múltiple de proveedores (3.3).
 *
 * ── Por qué se reconcilia con lo visible ────────────────────────────────────
 *
 * La selección vive en el navegador, pero el conjunto de resultados lo decide
 * el servidor. Al cambiar un filtro, la búsqueda, el orden o la página, la lista
 * visible cambia entera y los identificadores marcados antes pueden ya no
 * pertenecer a ella.
 *
 * Conservarlos sería peligroso, no cómodo: alguien filtra por España, marca 40
 * proveedores, cambia el filtro a Francia y pulsa «eliminar seleccionados»
 * creyendo que borra lo que ve. Aquí, en cuanto la lista visible cambia, la
 * selección se recorta a lo que sigue estando en pantalla.
 *
 * El alcance es DELIBERADAMENTE la página actual. No existe «seleccionar los
 * 12.288»: para actuar sobre todo el conjunto filtrado está la exportación, que
 * lo resuelve en servidor a partir de los filtros y no de una lista de
 * identificadores que el navegador tendría que mantener.
 */
export function useSupplierSelection(visibleIds: string[]) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set())

  // Firma estable de lo visible: cambia cuando cambia el CONJUNTO, no en cada
  // render.
  const firmaVisible = useMemo(() => visibleIds.join('|'), [visibleIds])
  const [firmaPrevia, setFirmaPrevia] = useState(firmaVisible)

  // ── Reconciliación DURANTE el render, no en un efecto ─────────────────────
  //
  // Es el patrón que React recomienda para ajustar estado cuando cambian las
  // props: con `useEffect` habría un instante en el que la interfaz ya muestra
  // la página nueva y la selección todavía contiene identificadores de la
  // anterior. Aquí el ajuste ocurre antes de pintar, así que ese instante no
  // existe. React vuelve a ejecutar el componente de inmediato, sin pintar el
  // estado intermedio.
  let seleccionActual = selected
  if (firmaVisible !== firmaPrevia) {
    const visibles = new Set(visibleIds)
    const conservados = [...selected].filter((id) => visibles.has(id))

    setFirmaPrevia(firmaVisible)
    if (conservados.length !== selected.size) {
      seleccionActual = new Set(conservados)
      setSelected(seleccionActual)
    }
  }

  const selected_ = seleccionActual
  const selectedIds = useMemo(() => [...selected_], [selected_])

  const todosVisiblesSeleccionados =
    visibleIds.length > 0 && visibleIds.every((id) => selected_.has(id))

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  /** Marca o desmarca todos los de la página actual. */
  function togglePage() {
    setSelected((prev) => {
      if (visibleIds.every((id) => prev.has(id))) {
        const next = new Set(prev)
        for (const id of visibleIds) next.delete(id)
        return next
      }
      return new Set([...prev, ...visibleIds])
    })
  }

  function clear() {
    setSelected(new Set())
  }

  return {
    selectedIds,
    count: selected_.size,
    isSelected: (id: string) => selected_.has(id),
    allVisibleSelected: todosVisiblesSeleccionados,
    toggle,
    togglePage,
    clear,
  }
}

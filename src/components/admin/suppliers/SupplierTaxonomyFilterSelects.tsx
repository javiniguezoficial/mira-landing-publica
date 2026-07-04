'use client'

import { useState } from 'react'
import { miraField, miraLabel } from '@/lib/miraButtons'
import type { SupplierMarketNode } from '@/lib/actions/supplier-taxonomy'

interface Props {
  tree: SupplierMarketNode[]
  values?: {
    supplier_market_id?: string
    supplier_category_id?: string
    supplier_family_id?: string
    supplier_subfamily_id?: string
  }
  labelClassName?: string
}

// 4 selects encadenados de la taxonomía propia de proveedores, pensados para
// vivir dentro de un <form method="GET">. Cada select tiene `name=` para que
// su valor se envíe. El encadenado es client-side sobre el árbol ya cargado
// (sin refetch por nivel). Al cambiar un padre se limpian los hijos.
// El reset visual al "Limpiar filtros" lo garantiza el key={JSON.stringify(filters)}
// del <form> padre, que remonta este componente y reinicia el estado.
export function SupplierTaxonomyFilterSelects({ tree, values, labelClassName = miraLabel }: Props) {
  const [market, setMarket] = useState(values?.supplier_market_id ?? '')
  const [category, setCategory] = useState(values?.supplier_category_id ?? '')
  const [family, setFamily] = useState(values?.supplier_family_id ?? '')
  const [subfamily, setSubfamily] = useState(values?.supplier_subfamily_id ?? '')

  const selMarket = tree.find((m) => m.id === market)
  const categories = selMarket?.categories ?? []
  const selCategory = categories.find((c) => c.id === category)
  const families = selCategory?.families ?? []
  const selFamily = families.find((f) => f.id === family)
  const subfamilies = selFamily?.subfamilies ?? []

  return (
    <>
      <div>
        <label className={labelClassName}>Mercado</label>
        <select
          name="supplier_market_id"
          value={market}
          onChange={(e) => { setMarket(e.target.value); setCategory(''); setFamily(''); setSubfamily('') }}
          className={miraField}
        >
          <option value="">Todos</option>
          {tree.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </div>

      <div>
        <label className={labelClassName}>Categoría</label>
        <select
          name="supplier_category_id"
          value={category}
          disabled={!selMarket}
          onChange={(e) => { setCategory(e.target.value); setFamily(''); setSubfamily('') }}
          className={miraField}
        >
          <option value="">{selMarket ? 'Todas' : 'Elige un mercado'}</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <div>
        <label className={labelClassName}>Familia</label>
        <select
          name="supplier_family_id"
          value={family}
          disabled={!selCategory}
          onChange={(e) => { setFamily(e.target.value); setSubfamily('') }}
          className={miraField}
        >
          <option value="">{selCategory ? 'Todas' : 'Elige una categoría'}</option>
          {families.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </div>

      <div>
        <label className={labelClassName}>Subfamilia</label>
        <select
          name="supplier_subfamily_id"
          value={subfamily}
          disabled={!selFamily}
          onChange={(e) => setSubfamily(e.target.value)}
          className={miraField}
        >
          <option value="">{selFamily ? 'Todas' : 'Elige una familia'}</option>
          {subfamilies.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>
    </>
  )
}

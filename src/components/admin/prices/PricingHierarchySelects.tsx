'use client'

import { useState } from 'react'
import { miraField, miraLabel } from '@/lib/miraButtons'
import type { PricingHierarchy } from '@/lib/actions/prices'

interface Values {
  strategic_market_id?: string
  category_id?: string
  market_id?: string
  product_id?: string
}

interface Props {
  hierarchy: PricingHierarchy
  values?: Values
  labelClassName?: string
  // Modo formulario: notifica el producto seleccionado (y su unidad) al padre.
  onProductChange?: (productId: string, unit: string | null) => void
}

// Selects encadenados de la jerarquía Pricing:
//   Mercado estratégico → Categoría → Mercado → Referencia/producto.
// Cada select lleva name= para funcionar dentro de <form method="GET"> (filtros).
// "Todos" en un nivel muestra todos los hijos del ancestro seleccionado.
// Al cambiar un padre se limpian los hijos. El reset visual al "Limpiar" lo
// da el key={JSON.stringify(filters)} del <form> padre (patrón P1).
export function PricingHierarchySelects({ hierarchy, values, labelClassName = miraLabel, onProductChange }: Props) {
  const [strategic, setStrategic] = useState(values?.strategic_market_id ?? '')
  const [category, setCategory] = useState(values?.category_id ?? '')
  const [market, setMarket] = useState(values?.market_id ?? '')
  const [product, setProduct] = useState(values?.product_id ?? '')

  const categoriesShown = strategic
    ? hierarchy.categories.filter((c) => c.strategic_market_id === strategic)
    : hierarchy.categories

  const marketsShown = category
    ? hierarchy.markets.filter((m) => m.category_id === category)
    : strategic
      ? hierarchy.markets.filter((m) => categoriesShown.some((c) => c.id === m.category_id))
      : hierarchy.markets

  const productsShown = market
    ? hierarchy.products.filter((p) => p.market_id === market)
    : []

  function emitProduct(productId: string) {
    const p = hierarchy.products.find((x) => x.id === productId)
    onProductChange?.(productId, p?.unit ?? null)
  }

  return (
    <>
      <div>
        <label className={labelClassName}>Mercado estratégico</label>
        <select
          name="strategic_market_id"
          value={strategic}
          onChange={(e) => { setStrategic(e.target.value); setCategory(''); setMarket(''); setProduct(''); emitProduct('') }}
          className={miraField}
        >
          <option value="">Todos</option>
          {hierarchy.strategicMarkets.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </div>

      <div>
        <label className={labelClassName}>Categoría</label>
        <select
          name="category_id"
          value={category}
          onChange={(e) => { setCategory(e.target.value); setMarket(''); setProduct(''); emitProduct('') }}
          className={miraField}
        >
          <option value="">Todas</option>
          {categoriesShown.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      <div>
        <label className={labelClassName}>Mercado</label>
        <select
          name="market_id"
          value={market}
          onChange={(e) => { setMarket(e.target.value); setProduct(''); emitProduct('') }}
          className={miraField}
        >
          <option value="">Todos</option>
          {marketsShown.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </div>

      <div>
        <label className={labelClassName}>Referencia / producto</label>
        <select
          name="product_id"
          value={product}
          disabled={!market}
          onChange={(e) => { setProduct(e.target.value); emitProduct(e.target.value) }}
          className={miraField}
        >
          <option value="">{market ? 'Todas' : 'Elige un mercado'}</option>
          {productsShown.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
    </>
  )
}

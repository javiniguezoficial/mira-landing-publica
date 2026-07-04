import { miraField, miraLabel } from '@/lib/miraButtons'
import { unitLabel } from '@/lib/utils'
import type { PricingFacets } from '@/lib/actions/prices'

interface Values {
  lonja?: string
  variedad?: string
  calibre?: string
  incoterm?: string
  tipo?: string
  unit?: string
  region?: string
}

interface Props {
  facets: PricingFacets
  values?: Values
  labelClassName?: string
}

// Filtros adicionales de precios (sin migración):
//  · lonja / variedad / calibre / incoterm / tipo → atributos de products.
//  · unidad → product_price_records.unit.
//  · región/zona → product_price_records.region (texto libre, ilike).
// Componente presentacional: usa defaultValue y name= para funcionar dentro del
// <form method="GET">. El reset visual al "Limpiar" lo da el key del <form> padre.
// Cada select de atributo solo se muestra si existen valores (evita filtros vacíos).
export function PriceExtraFilters({ facets, values, labelClassName = miraLabel }: Props) {
  const attrSelects: { name: keyof Values; label: string; options: string[] }[] = [
    { name: 'lonja',    label: 'Lonja',    options: facets.lonjas },
    { name: 'variedad', label: 'Variedad', options: facets.variedades },
    { name: 'calibre',  label: 'Calibre',  options: facets.calibres },
    { name: 'incoterm', label: 'Incoterm', options: facets.incoterms },
    { name: 'tipo',     label: 'Tipo',     options: facets.tipos },
  ]

  return (
    <>
      {attrSelects
        .filter((f) => f.options.length > 0)
        .map((f) => (
          <div key={f.name}>
            <label className={labelClassName}>{f.label}</label>
            <select name={f.name} defaultValue={values?.[f.name] ?? ''} className={miraField}>
              <option value="">Todos</option>
              {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        ))}

      {facets.units.length > 0 && (
        <div>
          <label className={labelClassName}>Unidad</label>
          {/* value = código crudo (el que se filtra); texto = etiqueta legible, igual que en la tabla */}
          <select name="unit" defaultValue={values?.unit ?? ''} className={miraField}>
            <option value="">Todas</option>
            {facets.units.map((u) => <option key={u} value={u}>{unitLabel(u)}</option>)}
          </select>
        </div>
      )}

      <div>
        <label className={labelClassName}>Región / Zona</label>
        <input name="region" defaultValue={values?.region ?? ''} placeholder="Ej. Levante" className={miraField} />
      </div>
    </>
  )
}

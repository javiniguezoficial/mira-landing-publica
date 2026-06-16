'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Trash2 } from 'lucide-react'
import type { ProductOption, RfqFormData, RfqKind, RfqCustomCondition } from '@/lib/actions/rfqs'
import { miraBtn, miraField } from '@/lib/miraButtons'
import {
  INCOTERMS,
  PURCHASE_FREQUENCIES,
  PAYMENT_METHODS,
  SALE_CURRENCIES,
  RFQ_CRITICALITIES,
  CUSTOM_CONDITION_TYPES,
} from '@/lib/constants'

const labelCls = 'block text-sm font-semibold text-slate-700 mb-1.5'
const reqMark = <span className="text-red-500">*</span>
const optMark = <span className="text-slate-400 font-normal">(opcional)</span>

const COUNTRIES = [
  { code: 'ES', name: 'España' },
  { code: 'PT', name: 'Portugal' },
  { code: 'FR', name: 'Francia' },
  { code: 'DE', name: 'Alemania' },
  { code: 'IT', name: 'Italia' },
  { code: 'NL', name: 'Países Bajos' },
]

function todayString() {
  return new Date().toISOString().split('T')[0]
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-4 rounded-2xl border border-mira-line p-5">
      <legend className="px-2 text-xs font-black uppercase tracking-wider text-mira-magenta">{title}</legend>
      {children}
    </fieldset>
  )
}

interface Props {
  products: ProductOption[]
  defaultValues?: Partial<RfqFormData>
  onSubmit: (data: RfqFormData) => Promise<{ id: string } | void>
  submitLabel: string
  cancelHref: string
}

export function RfqForm({ products, defaultValues, onSubmit, submitLabel, cancelHref }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  // Tipo
  const [kind, setKind] = useState<RfqKind>(defaultValues?.rfq_kind ?? 'product')
  const [productId, setProductId] = useState(defaultValues?.product_id ?? '')
  const [serviceName, setServiceName] = useState(defaultValues?.service_name ?? '')
  const [serviceDescription, setServiceDescription] = useState(defaultValues?.service_description ?? '')

  // Volumen / formato (quantity/unit legacy ya no se editan aquí)
  const [unitFormat, setUnitFormat] = useState(defaultValues?.unit_format ?? '')

  // Fechas
  const [openingDate, setOpeningDate] = useState(defaultValues?.opening_date ?? '')
  const [deadline, setDeadline] = useState(defaultValues?.deadline ?? '')
  const [awardDate, setAwardDate] = useState(defaultValues?.award_date ?? '')
  const [supplyStartDate, setSupplyStartDate] = useState(defaultValues?.supply_start_date ?? '')

  // Entrega
  const [country, setCountry] = useState(defaultValues?.country ?? 'ES')
  const [region, setRegion] = useState(defaultValues?.region ?? '')
  const [deliveryLocation, setDeliveryLocation] = useState(defaultValues?.delivery_location ?? '')
  const [incoterm, setIncoterm] = useState(defaultValues?.incoterm ?? '')

  // Comercial
  const [estimatedVolume, setEstimatedVolume] = useState(String(defaultValues?.estimated_volume ?? ''))
  const [purchaseFrequency, setPurchaseFrequency] = useState(defaultValues?.purchase_frequency ?? '')
  const [targetPrice, setTargetPrice] = useState(String(defaultValues?.target_price ?? ''))
  const [minOrder, setMinOrder] = useState(String(defaultValues?.min_order ?? ''))
  const [saleCurrency, setSaleCurrency] = useState(defaultValues?.sale_currency ?? 'EUR')
  const [paymentMethod, setPaymentMethod] = useState(defaultValues?.payment_method ?? '')
  const [leadTime, setLeadTime] = useState(defaultValues?.lead_time ?? '')
  const [criticality, setCriticality] = useState(defaultValues?.criticality ?? '')
  const [internalCode, setInternalCode] = useState(defaultValues?.internal_code ?? '')

  // Requisitos
  const [certificationsText, setCertificationsText] = useState((defaultValues?.certifications ?? []).join(', '))
  const [sustainabilityPolicy, setSustainabilityPolicy] = useState(defaultValues?.sustainability_policy ?? '')

  // Ficha técnica
  const [technicalSheetUrl, setTechnicalSheetUrl] = useState(defaultValues?.technical_sheet_url ?? '')
  const [technicalSheetNotes, setTechnicalSheetNotes] = useState(defaultValues?.technical_sheet_notes ?? '')

  // Condiciones personalizadas dinámicas
  const [conditionsList, setConditionsList] = useState<RfqCustomCondition[]>(
    defaultValues?.custom_conditions ?? []
  )

  // Texto libre
  const [notes, setNotes] = useState(defaultValues?.notes ?? '')
  const [conditions, setConditions] = useState(defaultValues?.conditions ?? '')

  function handleProductChange(id: string) {
    setProductId(id)
  }

  function addCondition() {
    setConditionsList((prev) => [...prev, { label: '', value: '', type: 'text' }])
  }
  function updateCondition(i: number, field: keyof RfqCustomCondition, value: string) {
    setConditionsList((prev) => prev.map((c, idx) => (idx === i ? { ...c, [field]: value } : c)))
  }
  function removeCondition(i: number) {
    setConditionsList((prev) => prev.filter((_, idx) => idx !== i))
  }

  function num(s: string): number | null {
    const t = s.trim()
    if (t === '') return null
    const n = parseFloat(t.replace(',', '.'))
    return isNaN(n) ? null : n
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    const data: RfqFormData = {
      rfq_kind: kind,
      product_id: kind === 'product' ? productId : null,
      service_name: kind === 'service' ? serviceName.trim() : undefined,
      service_description: serviceDescription.trim() || undefined,
      unit_format: unitFormat.trim(),
      opening_date: openingDate,
      deadline,
      award_date: awardDate,
      supply_start_date: supplyStartDate,
      country,
      region: region.trim() || undefined,
      delivery_location: deliveryLocation.trim() || undefined,
      incoterm: incoterm || undefined,
      estimated_volume: num(estimatedVolume),
      purchase_frequency: purchaseFrequency || undefined,
      target_price: num(targetPrice),
      min_order: num(minOrder),
      sale_currency: saleCurrency || 'EUR',
      payment_method: paymentMethod || undefined,
      lead_time: leadTime.trim(),
      criticality: (criticality || '') as RfqFormData['criticality'],
      internal_code: internalCode.trim() || undefined,
      certifications: certificationsText.split(',').map((s) => s.trim()).filter(Boolean),
      sustainability_policy: sustainabilityPolicy.trim() || undefined,
      technical_sheet_url: technicalSheetUrl.trim() || undefined,
      technical_sheet_notes: technicalSheetNotes.trim() || undefined,
      custom_conditions: conditionsList,
      notes: notes.trim() || undefined,
      conditions: conditions.trim() || undefined,
    }

    startTransition(async () => {
      try {
        const result = await onSubmit(data)
        if (result && 'id' in result) router.push(`/app/rfqs/${result.id}`)
        else router.push('/app/rfqs')
        router.refresh()
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Error inesperado')
      }
    })
  }

  const grouped = products.reduce<Record<string, ProductOption[]>>((acc, p) => {
    if (!acc[p.market_name]) acc[p.market_name] = []
    acc[p.market_name].push(p)
    return acc
  }, {})

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {/* ── Tipo ───────────────────────────────────────────────────────────── */}
      <Section title="Tipo de solicitud">
        <div>
          <label className={labelCls}>¿Qué buscas? {reqMark}</label>
          <div className="flex gap-2">
            {(['product', 'service'] as RfqKind[]).map((k) => (
              <button
                type="button"
                key={k}
                onClick={() => setKind(k)}
                className={`flex-1 rounded-xl border px-4 py-2.5 text-sm font-bold transition-all ${
                  kind === k
                    ? 'border-mira-magenta bg-mira-magenta-soft text-mira-magenta'
                    : 'border-mira-line text-slate-500 hover:border-mira-magenta/40'
                }`}
              >
                {k === 'product' ? 'Producto' : 'Servicio'}
              </button>
            ))}
          </div>
        </div>

        {kind === 'product' ? (
          <div>
            <label className={labelCls}>Producto {reqMark}</label>
            <select value={productId ?? ''} onChange={(e) => handleProductChange(e.target.value)} className={miraField}>
              <option value="">Selecciona un producto…</option>
              {Object.entries(grouped).map(([market, prods]) => (
                <optgroup key={market} label={market}>
                  {prods.map((p) => (
                    <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
        ) : (
          <>
            <div>
              <label className={labelCls}>Nombre del servicio {reqMark}</label>
              <input value={serviceName} onChange={(e) => setServiceName(e.target.value)} placeholder="Ej. Transporte refrigerado" className={miraField} />
            </div>
            <div>
              <label className={labelCls}>Descripción del servicio {optMark}</label>
              <textarea value={serviceDescription} onChange={(e) => setServiceDescription(e.target.value)} rows={2} className={`${miraField} resize-none`} />
            </div>
          </>
        )}
      </Section>

      {/* ── Volumen y formato ──────────────────────────────────────────────── */}
      <Section title="Volumen y formato">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div>
            <label className={labelCls}>Formato unitario {reqMark}</label>
            <input value={unitFormat} onChange={(e) => setUnitFormat(e.target.value)} placeholder="Caja 10 kg, palet, kg…" className={miraField} />
          </div>
          <div>
            <label className={labelCls}>Volumen estimado {optMark}</label>
            <input type="number" min="0" step="any" value={estimatedVolume} onChange={(e) => setEstimatedVolume(e.target.value)} placeholder="1000" className={miraField} />
          </div>
          <div>
            <label className={labelCls}>Pedido mínimo {optMark}</label>
            <input type="number" min="0" step="any" value={minOrder} onChange={(e) => setMinOrder(e.target.value)} className={miraField} />
          </div>
          <div className="sm:col-span-3">
            <label className={labelCls}>Frecuencia de compra {optMark}</label>
            <select value={purchaseFrequency} onChange={(e) => setPurchaseFrequency(e.target.value)} className={miraField}>
              <option value="">—</option>
              {PURCHASE_FREQUENCIES.map((f) => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
        </div>
      </Section>

      {/* ── Fechas ─────────────────────────────────────────────────────────── */}
      <Section title="Fechas clave">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Fecha de apertura RFQ {reqMark}</label>
            <input type="date" value={openingDate} onChange={(e) => setOpeningDate(e.target.value)} className={miraField} />
          </div>
          <div>
            <label className={labelCls}>Fecha límite de recepción de ofertas {reqMark}</label>
            <input type="date" value={deadline} min={todayString()} onChange={(e) => setDeadline(e.target.value)} className={miraField} />
          </div>
          <div>
            <label className={labelCls}>Fecha de adjudicación {reqMark}</label>
            <input type="date" value={awardDate} onChange={(e) => setAwardDate(e.target.value)} className={miraField} />
          </div>
          <div>
            <label className={labelCls}>Fecha de inicio de suministro {reqMark}</label>
            <input type="date" value={supplyStartDate} onChange={(e) => setSupplyStartDate(e.target.value)} className={miraField} />
          </div>
        </div>
      </Section>

      {/* ── Entrega ────────────────────────────────────────────────────────── */}
      <Section title="Entrega">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>País {reqMark}</label>
            <select value={country} onChange={(e) => setCountry(e.target.value)} className={miraField}>
              {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Región {optMark}</label>
            <input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="Andalucía, Castilla…" className={miraField} />
          </div>
          <div>
            <label className={labelCls}>Ubicación de entrega {optMark}</label>
            <input value={deliveryLocation} onChange={(e) => setDeliveryLocation(e.target.value)} placeholder="Almacén central, planta…" className={miraField} />
          </div>
          <div>
            <label className={labelCls}>Incoterm {optMark}</label>
            <select value={incoterm} onChange={(e) => setIncoterm(e.target.value)} className={miraField}>
              <option value="">—</option>
              {INCOTERMS.map((i) => <option key={i} value={i}>{i}</option>)}
            </select>
          </div>
        </div>
      </Section>

      {/* ── Condiciones comerciales ────────────────────────────────────────── */}
      <Section title="Condiciones comerciales">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Precio objetivo {optMark}</label>
            <input type="number" min="0" step="any" value={targetPrice} onChange={(e) => setTargetPrice(e.target.value)} className={miraField} />
          </div>
          <div>
            <label className={labelCls}>Moneda de venta {reqMark}</label>
            <select value={saleCurrency} onChange={(e) => setSaleCurrency(e.target.value)} className={miraField}>
              {SALE_CURRENCIES.map((c) => <option key={c} value={c}>{c}{c === 'EUR' ? ' (€)' : ''}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Forma de pago {optMark}</label>
            <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} className={miraField}>
              <option value="">—</option>
              {PAYMENT_METHODS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Lead time {reqMark}</label>
            <input value={leadTime} onChange={(e) => setLeadTime(e.target.value)} placeholder="15 días, 4 semanas…" className={miraField} />
          </div>
          <div>
            <label className={labelCls}>Nivel de criticidad {optMark}</label>
            <select value={criticality} onChange={(e) => setCriticality(e.target.value as typeof criticality)} className={miraField}>
              <option value="">—</option>
              {RFQ_CRITICALITIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Codificación interna {optMark}</label>
            <input value={internalCode} onChange={(e) => setInternalCode(e.target.value)} placeholder="Ref. interna del comprador" className={miraField} />
          </div>
        </div>
      </Section>

      {/* ── Requisitos ─────────────────────────────────────────────────────── */}
      <Section title="Requisitos y sostenibilidad">
        <div>
          <label className={labelCls}>Certificaciones necesarias {optMark}</label>
          <input value={certificationsText} onChange={(e) => setCertificationsText(e.target.value)} placeholder="ISO 9001, BRC, IFS… (separadas por comas)" className={miraField} />
          <p className="mt-1 text-xs text-slate-400">Separa varias certificaciones con comas.</p>
        </div>
        <div>
          <label className={labelCls}>Política de sostenibilidad {optMark}</label>
          <textarea value={sustainabilityPolicy} onChange={(e) => setSustainabilityPolicy(e.target.value)} rows={2} className={`${miraField} resize-none`} />
        </div>
      </Section>

      {/* ── Ficha técnica ──────────────────────────────────────────────────── */}
      <Section title="Ficha técnica">
        <div>
          <label className={labelCls}>URL de la ficha técnica {optMark}</label>
          <input type="url" value={technicalSheetUrl} onChange={(e) => setTechnicalSheetUrl(e.target.value)} placeholder="https://…" className={miraField} />
        </div>
        <div>
          <label className={labelCls}>Notas de la ficha técnica {optMark}</label>
          <textarea value={technicalSheetNotes} onChange={(e) => setTechnicalSheetNotes(e.target.value)} rows={2} className={`${miraField} resize-none`} />
        </div>
      </Section>

      {/* ── Condiciones personalizadas dinámicas ───────────────────────────── */}
      <Section title="Condiciones personalizadas">
        <p className="text-xs text-slate-500">
          Añade condiciones específicas (acidez máxima, formato concreto, certificación concreta, cualquier campo).
        </p>
        <div className="space-y-3">
          {conditionsList.map((c, i) => (
            <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-center">
              <input value={c.label} onChange={(e) => updateCondition(i, 'label', e.target.value)} placeholder="Condición (ej. Acidez máxima)" className={miraField} />
              <input value={c.value} onChange={(e) => updateCondition(i, 'value', e.target.value)} placeholder="Valor (ej. 0,8%)" className={miraField} />
              <select value={c.type} onChange={(e) => updateCondition(i, 'type', e.target.value)} className={`${miraField} sm:w-36`}>
                {CUSTOM_CONDITION_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
              <button type="button" onClick={() => removeCondition(i)} className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 hover:bg-red-50 hover:text-red-500" aria-label="Eliminar condición">
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
        <button type="button" onClick={addCondition} className={miraBtn.ghost}>
          <Plus size={14} /> Añadir condición
        </button>
      </Section>

      {/* ── Texto libre ────────────────────────────────────────────────────── */}
      <Section title="Notas y condiciones generales">
        <div>
          <label className={labelCls}>Notas {optMark}</label>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Especificaciones adicionales, calidad requerida…" className={`${miraField} resize-none`} />
        </div>
        <div>
          <label className={labelCls}>Condiciones generales {optMark}</label>
          <textarea value={conditions} onChange={(e) => setConditions(e.target.value)} rows={3} placeholder="Condiciones de pago, entrega, incoterms…" className={`${miraField} resize-none`} />
        </div>
      </Section>

      {/* Acciones */}
      <div className="flex items-center gap-3 pt-2">
        <button type="submit" disabled={isPending} className={miraBtn.primary}>
          {isPending ? 'Guardando…' : submitLabel}
        </button>
        <a href={cancelHref} className={miraBtn.ghost}>Cancelar</a>
      </div>
    </form>
  )
}

import { cn } from '@/lib/utils'

type Kind = 'rfq' | 'ticket' | 'news' | 'sub' | 'role' | 'priority'

const MAPS: Record<Kind, Record<string, { label: string; cls: string }>> = {
  rfq: {
    draft:     { label: 'Borrador',   cls: 'bg-slate-100 text-slate-500' },
    open:      { label: 'Abierta',    cls: 'bg-mira-magenta-soft text-mira-magenta' },
    closed:    { label: 'Cerrada',    cls: 'bg-slate-100 text-slate-500' },
    awarded:   { label: 'Adjudicada', cls: 'bg-emerald-100 text-emerald-700' },
    cancelled: { label: 'Cancelada',  cls: 'bg-red-100 text-red-600' },
  },
  ticket: {
    open:        { label: 'Abierto',   cls: 'bg-mira-magenta-soft text-mira-magenta' },
    in_progress: { label: 'En proceso',cls: 'bg-amber-100 text-amber-700' },
    resolved:    { label: 'Resuelto',  cls: 'bg-emerald-100 text-emerald-700' },
    closed:      { label: 'Cerrado',   cls: 'bg-slate-100 text-slate-500' },
  },
  news: {
    draft:     { label: 'Borrador',  cls: 'bg-slate-100 text-slate-500' },
    published: { label: 'Publicada', cls: 'bg-emerald-100 text-emerald-700' },
    archived:  { label: 'Archivada', cls: 'bg-slate-100 text-slate-400' },
  },
  sub: {
    active:    { label: 'Activo',    cls: 'bg-emerald-100 text-emerald-700' },
    trial:     { label: 'Trial',     cls: 'bg-blue-100 text-blue-700' },
    past_due:  { label: 'Vencido',   cls: 'bg-amber-100 text-amber-700' },
    cancelled: { label: 'Cancelado', cls: 'bg-slate-100 text-slate-500' },
    expired:   { label: 'Expirado',  cls: 'bg-red-100 text-red-600' },
  },
  role: {
    platform_admin: { label: 'Admin',       cls: 'bg-mira-magenta-soft text-mira-magenta' },
    client_owner:   { label: 'Propietario', cls: 'bg-violet-100 text-violet-700' },
    client_member:  { label: 'Miembro',     cls: 'bg-slate-100 text-slate-600' },
  },
  priority: {
    low:    { label: 'Baja',   cls: 'bg-slate-100 text-slate-500' },
    normal: { label: 'Normal', cls: 'bg-blue-50 text-blue-600' },
    high:   { label: 'Alta',   cls: 'bg-red-50 text-red-600' },
  },
}

interface Props {
  status: string
  kind: Kind
  className?: string
}

export function MiraStatusBadge({ status, kind, className }: Props) {
  const cfg = MAPS[kind][status] ?? { label: status, cls: 'bg-slate-100 text-slate-500' }
  return (
    <span className={cn('inline-flex items-center rounded-lg px-2 py-0.5 text-[10px] font-bold', cfg.cls, className)}>
      {cfg.label}
    </span>
  )
}

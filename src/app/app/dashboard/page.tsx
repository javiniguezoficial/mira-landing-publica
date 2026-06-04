import { getActiveOrg } from '@/lib/queries/user-org'
import {
  Building2,
  Users,
  TrendingUp,
  FileText,
  BadgeCheck,
  ShieldAlert,
  Clock,
  XCircle,
} from 'lucide-react'

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_CONFIG = {
  active:    { label: 'Activo',   icon: BadgeCheck,  className: 'bg-green-50 text-green-700 border-green-200' },
  trial:     { label: 'Trial',    icon: Clock,       className: 'bg-blue-50 text-blue-700 border-blue-200' },
  past_due:  { label: 'Vencido',  icon: ShieldAlert, className: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  cancelled: { label: 'Cancelado',icon: XCircle,     className: 'bg-slate-100 text-slate-500 border-slate-200' },
  expired:   { label: 'Expirado', icon: XCircle,     className: 'bg-red-50 text-red-600 border-red-200' },
} as const

const ROLE_LABELS: Record<string, string> = {
  org_owner: 'Propietario',
  org_admin: 'Administrador',
  org_member: 'Miembro',
  client_owner: 'Propietario',
  client_member: 'Miembro',
}

// ── No-org screen ─────────────────────────────────────────────────────────────

function NoOrgScreen() {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[60vh] p-8 text-center">
      <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center mb-6">
        <Building2 size={32} className="text-slate-400" />
      </div>
      <h2 className="text-xl font-heading font-bold text-slate-900 mb-2">
        No tienes organización asignada
      </h2>
      <p className="text-slate-500 font-body text-sm max-w-sm">
        Tu cuenta no está vinculada a ninguna organización todavía. Contacta con tu
        administrador para que te añada como miembro.
      </p>
    </div>
  )
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export default async function AppDashboard() {
  const result = await getActiveOrg()

  if (result.status === 'no_org') {
    return <NoOrgScreen />
  }

  const { org } = result
  const statusCfg = STATUS_CONFIG[org.subscription_status] ?? STATUS_CONFIG.trial
  const StatusIcon = statusCfg.icon
  const roleLabel = ROLE_LABELS[org.userRole] ?? org.userRole

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-heading font-bold text-slate-900">Dashboard</h1>
        <p className="text-slate-500 font-body text-sm mt-1">
          Bienvenido a MIRA Pricing
        </p>
      </div>

      {/* Org context card */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm mb-6 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-mira-primary/10 flex items-center justify-center shrink-0">
          <Building2 size={22} className="text-mira-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-0.5">
            Organización activa
          </p>
          <h2 className="text-lg font-heading font-bold text-slate-900 truncate">
            {org.name}
          </h2>
          <p className="text-xs text-slate-500 font-body">
            Tu rol: <span className="font-semibold text-slate-700">{roleLabel}</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 shrink-0">
          {/* Plan badge */}
          <span className="px-3 py-1 rounded-full bg-mira-primary/10 text-mira-primary text-xs font-bold border border-mira-primary/20">
            {org.plan?.name ?? 'Sin plan'}
          </span>
          {/* Status badge */}
          <span
            className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${statusCfg.className}`}
          >
            <StatusIcon size={12} />
            {statusCfg.label}
          </span>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {/* Real KPI: miembros */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Usuarios
            </p>
            <Users size={16} className="text-slate-300" />
          </div>
          <p className="text-3xl font-display font-bold text-slate-900 mb-1">
            {org.memberCount}
          </p>
          <p className="text-xs text-slate-400 font-body">miembros activos</p>
        </div>

        {/* Placeholder KPIs */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Mercados
            </p>
            <TrendingUp size={16} className="text-slate-300" />
          </div>
          <p className="text-3xl font-display font-bold text-slate-300 mb-1">—</p>
          <p className="text-xs text-slate-400 font-body">próximamente</p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              RFQs activas
            </p>
            <FileText size={16} className="text-slate-300" />
          </div>
          <p className="text-3xl font-display font-bold text-slate-300 mb-1">—</p>
          <p className="text-xs text-slate-400 font-body">próximamente</p>
        </div>

        {/* Real KPI: plan */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Plan actual
            </p>
            <BadgeCheck size={16} className="text-slate-300" />
          </div>
          <p className="text-xl font-display font-bold text-slate-900 mb-1">
            {org.plan?.name ?? '—'}
          </p>
          <span
            className={`inline-flex items-center gap-1 text-xs font-bold ${statusCfg.className} px-2 py-0.5 rounded-full border`}
          >
            <StatusIcon size={10} />
            {statusCfg.label}
          </span>
        </div>
      </div>

      {/* Modules placeholder */}
      <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
        <p className="text-slate-400 font-body text-sm">
          Los módulos de mercados, RFQs y proveedores se activan en las siguientes fases.
        </p>
      </div>
    </div>
  )
}

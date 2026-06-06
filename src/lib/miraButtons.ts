/**
 * Clases de botón coherentes con el Design System MIRA.
 * Reemplaza los `bg-mira-primary` sueltos de las pantallas internas.
 * Combinar con `cn()` si se necesitan extras.
 */
export const miraBtn = {
  /** Acción principal — magenta vivo */
  primary:
    'inline-flex items-center justify-center gap-1.5 rounded-xl bg-mira-magenta px-4 py-2 text-sm font-bold text-white shadow-lg shadow-mira-magenta/25 transition-colors hover:bg-mira-magenta-deep disabled:cursor-not-allowed disabled:opacity-60',
  /** Secundaria — borde claro sobre blanco */
  ghost:
    'inline-flex items-center justify-center gap-1.5 rounded-xl border border-mira-line bg-white px-4 py-2 text-sm font-bold text-slate-600 transition-colors hover:border-mira-magenta/30 hover:text-mira-magenta disabled:cursor-not-allowed disabled:opacity-60',
  /** Destructiva */
  danger:
    'inline-flex items-center justify-center gap-1.5 rounded-xl bg-red-500 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-red-500/25 transition-colors hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60',
  /** Sutil — fondo magenta suave */
  subtle:
    'inline-flex items-center justify-center gap-1.5 rounded-xl bg-mira-magenta-soft px-4 py-2 text-sm font-bold text-mira-magenta transition-colors hover:bg-mira-magenta/15',
  /** Icono compacto (acciones de tabla) */
  icon:
    'inline-flex items-center justify-center rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-mira-magenta-soft hover:text-mira-magenta',
}

/** Estilo compartido de inputs/selects del panel. */
export const miraField =
  'w-full rounded-xl border border-mira-line bg-white px-3.5 py-2.5 text-sm text-mira-ink transition-colors focus:border-mira-magenta focus:outline-none focus:ring-2 focus:ring-mira-magenta/20 placeholder:text-slate-400'

/** Label de formulario coherente. */
export const miraLabel = 'block text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1.5'

/** Paleta de series para los gráficos MIRA (magenta → púrpura). */
export const MIRA_SERIES = ['#D6006E', '#6B1FA3', '#9B6DD6', '#C9B3E6', '#5CE1E6', '#F59E0B']

/** Colores por estado de RFQ (coherente con MiraStatusBadge). */
export const RFQ_COLORS: Record<string, string> = {
  draft: '#94A3B8', open: '#D6006E', closed: '#64748B', awarded: '#16A34A', cancelled: '#DC2626',
}

/** Colores por estado de ticket. */
export const TICKET_COLORS: Record<string, string> = {
  open: '#D6006E', in_progress: '#F59E0B', resolved: '#16A34A', closed: '#64748B',
}

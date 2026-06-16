export const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

export const ROUTES = {
  home: '/',
  login: '/login',
  registro: '/registro',
  enterprise: '/enterprise',
  sobreNosotros: '/sobre-nosotros',
  avisoLegal: '/aviso-legal',
  politicaPrivacidad: '/politica-privacidad',
  politicaCookies: '/politica-cookies',
  terminosCondiciones: '/terminos-condiciones',
  // Área cliente
  appDashboard: '/app/dashboard',
  appMarkets: '/app/markets',
  appRfq: '/app/rfq',
  appSuppliers: '/app/proveedores',
  appNews: '/app/news',
  appOrganization: '/app/organization',
  appSettings: '/app/settings',
  // Área admin
  adminDashboard: '/admin/dashboard',
  adminClients: '/admin/clients',
  adminUsers: '/admin/users',
  adminMarkets: '/admin/markets',
  adminProducts: '/admin/products',
  adminPrices: '/admin/prices',
  adminSuppliers: '/admin/proveedores',
  adminNews: '/admin/news',
} as const

// ── Opciones para RFQs ampliadas (FASE B1) ───────────────────────────────────

export const INCOTERMS = [
  'EXW', 'FCA', 'FAS', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP',
] as const

export const PURCHASE_FREQUENCIES = [
  'Puntual', 'Semanal', 'Quincenal', 'Mensual', 'Trimestral', 'Semestral', 'Anual',
] as const

export const PAYMENT_METHODS = [
  'Contado', 'Transferencia', 'Confirming', 'Pagaré', 'Giro', '30 días', '60 días', '90 días',
] as const

export const SALE_CURRENCIES = ['EUR', 'USD', 'GBP'] as const

export const RFQ_CRITICALITIES = [
  { value: 'alto',  label: 'Alto' },
  { value: 'medio', label: 'Medio' },
  { value: 'bajo',  label: 'Bajo' },
] as const

export const CUSTOM_CONDITION_TYPES = [
  { value: 'text',   label: 'Texto' },
  { value: 'number', label: 'Número' },
  { value: 'cert',   label: 'Certificación' },
] as const

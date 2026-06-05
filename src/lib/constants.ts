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
  appSuppliers: '/app/suppliers',
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

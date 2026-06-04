import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Mira Pricing — Inteligencia de Mercado Alimentario',
  description: 'Plataforma de inteligencia de mercado para optimizar decisiones de compra con datos oficiales y predictivos.',
  openGraph: {
    title: 'Mira Pricing',
    description: 'Detecta discrepancias entre el mercado y tu precio real.',
    type: 'website',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}

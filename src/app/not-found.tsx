import Link from 'next/link'

export default function NotFound() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="text-center">
        <p className="text-8xl font-bold text-mira-primary mb-4">404</p>
        <h1 className="text-2xl font-display font-bold text-slate-900 mb-6">Página no encontrada</h1>
        <Link
          href="/"
          className="inline-flex items-center justify-center px-6 py-3 bg-mira-primary text-white font-bold rounded-lg hover:bg-mira-secondary transition-colors"
        >
          Volver al inicio
        </Link>
      </div>
    </div>
  )
}

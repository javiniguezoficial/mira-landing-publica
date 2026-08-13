'use client'
import { useState } from 'react'
import { motion } from 'framer-motion'
import { MiraLogo } from './MiraLogo'
import { Button } from './Button'
import { createClient } from '@/lib/supabase/client'
import { buildRecoveryRedirectUrl } from '@/lib/auth/redirect-urls'

export const RecoverPasswordPage = () => {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createClient()
    // Antes se interpolaba la variable en crudo: sin ella configurada, el
    // enlace salía como `undefined/auth/callback?...`. El helper valida la base
    // y devuelve `null` si no sirve, y entonces se omite el parámetro para que
    // Supabase caiga a su Site URL en vez de enviar un enlace roto.
    const redirectTo = buildRecoveryRedirectUrl(process.env.NEXT_PUBLIC_APP_URL)

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email,
      redirectTo ? { redirectTo } : undefined,
    )

    setLoading(false)

    if (resetError) {
      if (resetError.status === 429) {
        setError('Has alcanzado el límite de emails. Espera unos minutos e inténtalo de nuevo.')
      } else {
        setError('No se pudo enviar el email. Comprueba la dirección e inténtalo de nuevo.')
      }
      return
    }

    setSent(true)
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-full bg-agri-pattern opacity-30 pointer-events-none" />
      <div className="absolute -top-40 -right-40 w-[600px] h-[600px] bg-mira-primary/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -left-40 w-[600px] h-[600px] bg-mira-cyan/5 rounded-full blur-3xl pointer-events-none" />

      <header className="relative z-10 py-6 px-6 md:px-10 flex items-center justify-between">
        <a href="/" className="flex items-center gap-3 group">
          <MiraLogo className="w-10 h-10 group-hover:scale-105 transition-transform" />
          <span className="text-2xl font-display font-bold tracking-tight text-mira-primary">mira</span>
        </a>
        <a
          href="/login"
          className="text-sm font-bold text-slate-500 hover:text-mira-primary transition-colors"
        >
          Volver al inicio de sesión
        </a>
      </header>

      <main className="flex-1 flex items-center justify-center p-4 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-8 md:p-10 rounded-3xl border border-slate-200 shadow-2xl shadow-slate-200/50 w-full max-w-md"
        >
          {sent ? (
            <div className="text-center py-4">
              <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <h2 className="text-xl font-heading font-bold text-slate-900 mb-2">
                Revisa tu email
              </h2>
              <p className="text-sm text-slate-500 mb-6">
                Si existe una cuenta con <span className="font-semibold text-slate-700">{email}</span>, recibirás un enlace para restablecer tu contraseña en los próximos minutos.
              </p>
              <a
                href="/login"
                className="text-sm font-bold text-mira-primary hover:text-mira-secondary transition-colors"
              >
                Volver al inicio de sesión
              </a>
            </div>
          ) : (
            <>
              <div className="mb-8 text-center">
                <h1 className="text-3xl font-heading font-bold text-slate-900 mb-3">
                  Recupera tu contraseña
                </h1>
                <p className="text-sm text-slate-500 font-body">
                  Introduce tu email y te enviaremos un enlace para crear una nueva contraseña.
                </p>
              </div>

              <form className="space-y-5" onSubmit={handleSubmit}>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    placeholder="tu@empresa.com"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    required
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-mira-primary focus:ring-2 focus:ring-mira-primary/20 outline-none transition-all text-sm text-slate-900"
                  />
                </div>

                {error && (
                  <div className="px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700 font-medium">
                    {error}
                  </div>
                )}

                <Button type="submit" className="w-full mt-2" size="lg" disabled={loading}>
                  {loading ? 'Enviando…' : 'Enviar enlace de recuperación'}
                </Button>
              </form>

              <div className="mt-8 text-center pt-6 border-t border-slate-100">
                <p className="text-sm text-slate-600">
                  ¿Recuerdas tu contraseña?{' '}
                  <a
                    href="/login"
                    className="font-bold text-mira-primary hover:text-mira-secondary transition-colors"
                  >
                    Iniciar sesión
                  </a>
                </p>
              </div>
            </>
          )}
        </motion.div>
      </main>
    </div>
  )
}

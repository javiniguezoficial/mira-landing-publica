'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { MiraLogo } from './MiraLogo'
import { Button } from './Button'
import { createClient } from '@/lib/supabase/client'
import { PASSWORD_COPY, type PasswordReason } from '@/lib/auth/invite-session'

interface Props {
  /**
   * Por qué se pide la contraseña. Ya viene NORMALIZADO contra una lista
   * cerrada desde la página, así que aquí solo elige el texto.
   *
   * No es una comprobación de seguridad y no debe usarse como tal: quien decide
   * si la contraseña puede cambiarse es la SESIÓN, no este valor. Un `motivo`
   * manipulado como mucho enseña el rótulo equivocado.
   */
  reason?: PasswordReason
}

export const UpdatePasswordPage = ({ reason = 'recuperacion' }: Props) => {
  const copy = PASSWORD_COPY[reason]
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres.')
      return
    }
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.')
      return
    }

    setLoading(true)

    const supabase = createClient()
    const { error: updateError } = await supabase.auth.updateUser({ password })

    setLoading(false)

    if (updateError) {
      setError(
        reason === 'invitacion'
          ? 'No se pudo crear la contraseña. El enlace de invitación puede haber caducado. Pide uno nuevo a tu contacto en MIRA.'
          : 'No se pudo actualizar la contraseña. El enlace puede haber expirado. Solicita uno nuevo.',
      )
      return
    }

    setSuccess(true)

    // Redirigir al dashboard según el rol tras actualizar
    const { data: profile } = await supabase.from('profiles').select('role').single()
    const destination = profile?.role === 'platform_admin' ? '/admin/dashboard' : '/app/dashboard'
    setTimeout(() => router.push(destination), 2000)
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
      </header>

      <main className="flex-1 flex items-center justify-center p-4 relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-8 md:p-10 rounded-3xl border border-slate-200 shadow-2xl shadow-slate-200/50 w-full max-w-md"
        >
          {success ? (
            <div className="text-center py-4">
              <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                <svg className="w-7 h-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h2 className="text-xl font-heading font-bold text-slate-900 mb-2">
                Contraseña actualizada
              </h2>
              <p className="text-sm text-slate-500">
                {copy.done}
              </p>
            </div>
          ) : (
            <>
              <div className="mb-8 text-center">
                <h1 className="text-3xl font-heading font-bold text-slate-900 mb-3">
                  {copy.title}
                </h1>
                <p className="text-sm text-slate-500 font-body">
                  {copy.intro}
                </p>
              </div>

              <form className="space-y-5" onSubmit={handleSubmit}>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                    Nueva contraseña
                  </label>
                  <input
                    type="password"
                    placeholder="Mínimo 6 caracteres"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-mira-primary focus:ring-2 focus:ring-mira-primary/20 outline-none transition-all text-sm text-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                    Confirmar contraseña
                  </label>
                  <input
                    type="password"
                    placeholder="Repite la contraseña"
                    value={confirm}
                    onChange={e => setConfirm(e.target.value)}
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
                  {loading ? 'Guardando…' : copy.cta}
                </Button>
              </form>
            </>
          )}
        </motion.div>
      </main>
    </div>
  )
}

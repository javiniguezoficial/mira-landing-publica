'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Mail, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'

interface Props {
  email: string
}

type Status = 'idle' | 'loading' | 'success' | 'error'

export function PasswordSection({ email }: Props) {
  const [status, setStatus] = useState<Status>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  const handleReset = async () => {
    setStatus('loading')
    setErrorMsg('')

    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/actualizar-password`,
    })

    if (error) {
      setErrorMsg(error.message)
      setStatus('error')
    } else {
      setStatus('success')
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm text-slate-600">
          Te enviaremos un email a <span className="font-semibold text-slate-800">{email}</span> con
          un enlace seguro para establecer una nueva contraseña.
        </p>
      </div>

      {status === 'success' && (
        <div className="flex items-start gap-2.5 bg-emerald-50 border border-emerald-200 rounded-lg px-4 py-3">
          <CheckCircle size={16} className="text-emerald-600 mt-0.5 shrink-0" />
          <p className="text-sm text-emerald-700">
            Email enviado correctamente. Revisa tu bandeja de entrada y sigue las instrucciones.
          </p>
        </div>
      )}

      {status === 'error' && (
        <div className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
          <AlertCircle size={16} className="text-red-500 mt-0.5 shrink-0" />
          <p className="text-sm text-red-600">{errorMsg || 'No se pudo enviar el email. Inténtalo de nuevo.'}</p>
        </div>
      )}

      {status !== 'success' && (
        <button
          onClick={handleReset}
          disabled={status === 'loading'}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-slate-300 bg-white text-slate-700 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {status === 'loading' ? (
            <>
              <Loader2 size={15} className="animate-spin" />
              Enviando…
            </>
          ) : (
            <>
              <Mail size={15} />
              Enviar email de cambio de contraseña
            </>
          )}
        </button>
      )}
    </div>
  )
}

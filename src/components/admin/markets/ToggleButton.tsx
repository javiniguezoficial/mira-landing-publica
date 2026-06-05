'use client'

import { useState, useTransition } from 'react'

interface Props {
  id: string
  isActive: boolean
  onToggle: (id: string, active: boolean) => Promise<void>
}

export function ToggleButton({ id, isActive, onToggle }: Props) {
  const [active, setActive] = useState(isActive)
  const [pending, startTransition] = useTransition()

  const handle = () => {
    const next = !active
    setActive(next)
    startTransition(async () => {
      try {
        await onToggle(id, next)
      } catch {
        setActive(!next)
      }
    })
  }

  return (
    <button
      onClick={handle}
      disabled={pending}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors disabled:opacity-50 ${
        active ? 'bg-mira-primary' : 'bg-slate-200'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
          active ? 'translate-x-4' : 'translate-x-1'
        }`}
      />
    </button>
  )
}

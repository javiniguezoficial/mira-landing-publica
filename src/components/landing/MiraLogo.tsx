'use client'
import { cn } from '@/lib/utils'

export const MiraLogo = ({ className }: { className?: string }) => (
  <img
    src="https://entornodev.com/descargas/Logo-Mira-Header.webp"
    alt="MIRA pricing"
    className={cn('object-contain', className)}
  />
)

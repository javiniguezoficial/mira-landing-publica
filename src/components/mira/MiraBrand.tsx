import { cn } from '@/lib/utils'

interface Props {
  /** muestra la tagline bajo el logo */
  tagline?: boolean
  size?: number
  className?: string
}

/** Logo circular MIRA recreado en CSS (sin assets externos). */
export function MiraBrand({ tagline = true, size = 64, className }: Props) {
  return (
    <a href="/" className={cn('flex flex-col items-center gap-2', className)}>
      <span
        className="mira-logo-ring flex items-center justify-center rounded-full"
        style={{ width: size, height: size }}
      >
        <span
          className="flex items-center justify-center rounded-full bg-mira-plum-deep"
          style={{ width: size - 8, height: size - 8 }}
        >
          <span className="font-display text-lg font-bold lowercase tracking-tight text-white">mira</span>
        </span>
      </span>
      {tagline && (
        <span className="text-[10px] font-semibold tracking-wide text-white/70">
          Conéctate. Compite. Crece.
        </span>
      )}
    </a>
  )
}

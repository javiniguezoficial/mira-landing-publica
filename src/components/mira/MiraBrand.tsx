import Link from 'next/link'
import { cn } from '@/lib/utils'

interface Props {
  /** muestra la tagline bajo el logo */
  tagline?: boolean
  size?: number
  className?: string
  /**
   * 037 — a dónde lleva el logo.
   *
   * ── El fallo que se corrige ──────────────────────────────────────────────
   *
   * Estaba fijo en `/`, la landing pública. Dentro de la aplicación eso
   * significa que pulsar el logo —el gesto universal de «llévame al inicio»—
   * te sacaba del panel a la web comercial. La sesión no se cerraba, pero
   * desde fuera parece exactamente eso, y volver exige la barra de direcciones.
   *
   * ── Cómo se decide el destino ────────────────────────────────────────────
   *
   * En el SERVIDOR, en el layout de cada área: `/admin/*` monta `AdminShell` y
   * `/app/*` monta `AppShell`, y esos dos layouts ya son el resultado de los
   * guards de rol. No se mira el rol en el navegador ni se lee nada que se
   * pueda manipular: el shell que se está renderizando ES la respuesta.
   */
  href?: string
  /** Texto accesible del enlace. Debe describir el DESTINO, no la imagen. */
  ariaLabel?: string
}

/** Logo circular MIRA recreado en CSS (sin assets externos). */
export function MiraBrand({
  tagline = true,
  size = 64,
  className,
  href = '/',
  ariaLabel = 'MIRA — ir al inicio',
}: Props) {
  return (
    // `Link` de Next: navegación de cliente, sin recarga completa de la
    // aplicación y sin perder el estado del panel.
    <Link
      href={href}
      aria-label={ariaLabel}
      className={cn(
        'flex flex-col items-center gap-2 rounded-2xl',
        // El foco de teclado tiene que verse: sobre el fondo oscuro de la barra
        // lateral el anillo por defecto del navegador es prácticamente invisible.
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent',
        className,
      )}
    >
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
    </Link>
  )
}

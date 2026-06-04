'use client'
import React from 'react'
import { cn } from '@/lib/utils'
import type { ClassValue } from 'clsx'

type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost'
type ButtonSize = 'sm' | 'md' | 'lg'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  className?: string
  variant?: ButtonVariant
  size?: ButtonSize
  href?: string
}

export const Button = React.forwardRef<HTMLButtonElement | HTMLAnchorElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', href, ...props }, ref) => {
    const variants: Record<ButtonVariant, string> = {
      primary:
        'bg-mira-primary text-white hover:bg-mira-secondary shadow-lg shadow-mira-primary/20 hover:shadow-mira-secondary/30 rounded-lg',
      secondary:
        'bg-gradient-to-r from-mira-secondary to-mira-accent text-white hover:opacity-90 shadow-md rounded-lg',
      outline:
        'border border-slate-300 bg-white/50 backdrop-blur-sm hover:bg-white text-slate-900 rounded-lg',
      ghost: 'bg-transparent hover:bg-slate-100/50 text-slate-600 hover:text-mira-primary rounded-lg',
    }
    const sizes: Record<ButtonSize, string> = {
      sm: 'h-8 px-3 text-xs',
      md: 'h-10 px-5 text-sm',
      lg: 'h-12 px-8 text-base',
    }
    const classes = cn(
      'inline-flex items-center justify-center font-bold tracking-wide transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-mira-primary disabled:pointer-events-none disabled:opacity-50 active:scale-95',
      variants[variant],
      sizes[size],
      className
    )

    if (href) {
      return (
        <a ref={ref as React.Ref<HTMLAnchorElement>} href={href} className={classes} {...(props as React.AnchorHTMLAttributes<HTMLAnchorElement>)} />
      )
    }
    return (
      <button ref={ref as React.Ref<HTMLButtonElement>} className={classes} {...props} />
    )
  }
)
Button.displayName = 'Button'

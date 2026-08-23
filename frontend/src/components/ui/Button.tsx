import type { ButtonHTMLAttributes, ReactNode } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'danger'
export type ButtonSize = 'md' | 'lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  children: ReactNode
}

const base =
  'inline-flex items-center justify-center gap-2 rounded-md font-semibold ' +
  'transition-fast select-none disabled:opacity-40 disabled:pointer-events-none ' +
  'active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 ' +
  'focus-visible:outline-accent'

const sizes: Record<ButtonSize, string> = {
  md: 'h-10 px-4 text-body',
  lg: 'h-12 px-6 text-title',
}

// Pressed/active state is deliberately strong (color shift + scale) since
// this is a touch-only app with no hover affordance to fall back on.
const variants: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-bg hover:bg-accent-hover active:bg-accent-active',
  secondary:
    'bg-surface-raised text-text-primary border border-border ' +
    'hover:bg-surface-overlay active:bg-surface-overlay active:border-border-strong',
  danger:
    'bg-error text-bg hover:brightness-110 active:brightness-90',
}

/**
 * Primary/secondary/danger button with a visible pressed state (scale +
 * color shift) for touch feedback. Use `primary` for the single main
 * action on a screen, `secondary` for everything else, `danger` for
 * destructive/admin actions (e.g. skip track, remove guest).
 */
export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  )
}

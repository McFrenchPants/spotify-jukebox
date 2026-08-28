import type { ButtonHTMLAttributes, ReactNode } from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'danger'
export type ButtonSize = 'md' | 'lg' | 'icon' | 'icon-lg'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  children: ReactNode
}

const base =
  'relative inline-flex items-center justify-center gap-2 font-semibold ' +
  'transition-fast select-none disabled:opacity-40 disabled:pointer-events-none ' +
  'active:scale-[0.97] focus-visible:outline-2 focus-visible:outline-offset-2 ' +
  'focus-visible:outline-accent backdrop-blur-md border overflow-hidden ' +
  // Thin top highlight on every button, glass-style — a bevel catching light.
  'before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-1/2 ' +
  'before:rounded-t-[inherit] before:bg-gradient-to-b before:from-white/15 before:to-transparent'

const sizes: Record<ButtonSize, string> = {
  // 44px minimum comfortable touch target (iOS HIG / Material baseline) —
  // this app is touch-only, so `md` (the default, used everywhere from
  // "Add to queue" rows to admin actions) must clear it, not just `lg`.
  md: 'h-11 px-4 text-body rounded-md',
  lg: 'h-12 px-6 text-title rounded-md',
  // Square icon-only buttons (playback controls). Deliberately their own
  // size entries rather than `md`/`lg` + a `className="w-12 p-0"` override —
  // Tailwind emits per-axis padding utilities (`px-4`) AFTER the all-sides
  // one (`p-0`) in its generated stylesheet regardless of which order the
  // classes appear in the JSX, so a `p-0` override never actually wins
  // against `md`/`lg`'s built-in `px-*` and silently squashes the icon
  // against the button's edges. Keeping icon sizing in its own map entry
  // means only one set of padding/height classes is ever present at once.
  icon: 'h-12 w-12 p-0 rounded-full',
  'icon-lg': 'h-14 w-14 p-0 rounded-full',
}

// Pressed/active state is deliberately strong (color shift + scale) since
// this is a touch-only app with no hover affordance to fall back on.
const variants: Record<ButtonVariant, string> = {
  primary:
    'text-bg border-white/30 shadow-[0_4px_16px_-4px_rgba(47,214,111,0.55)] ' +
    'bg-[linear-gradient(155deg,rgba(255,255,255,0.25),rgba(0,0,0,0.05)),linear-gradient(var(--color-accent),var(--color-accent))] ' +
    'hover:brightness-110 active:brightness-95',
  secondary:
    'glass text-text-primary hover:bg-white/[0.06] active:bg-white/[0.09]',
  danger:
    'text-bg border-white/25 shadow-[0_4px_16px_-4px_rgba(248,113,113,0.5)] ' +
    'bg-[linear-gradient(155deg,rgba(255,255,255,0.22),rgba(0,0,0,0.05)),linear-gradient(var(--color-error),var(--color-error))] ' +
    'hover:brightness-110 active:brightness-90',
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

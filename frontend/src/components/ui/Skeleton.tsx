import type { HTMLAttributes } from 'react'

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  /** Tailwind width/height utility overrides, e.g. "h-4 w-32". Defaults to a full-width line. */
  variant?: 'line' | 'circle' | 'block'
}

const variantClasses: Record<NonNullable<SkeletonProps['variant']>, string> = {
  line: 'h-4 w-full rounded-sm',
  circle: 'h-10 w-10 rounded-full',
  block: 'h-24 w-full rounded-md',
}

/**
 * Loading placeholder shown while queue/search/track data is in flight.
 * Uses a pulse animation (respects prefers-reduced-motion globally).
 * Compose multiple Skeletons to mock a row (e.g. circle + two lines for a
 * track item: art + title + artist).
 */
export function Skeleton({ variant = 'line', className = '', ...rest }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse bg-surface-overlay ${variantClasses[variant]} ${className}`}
      {...rest}
    />
  )
}

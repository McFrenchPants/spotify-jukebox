import type { HTMLAttributes, ReactNode } from 'react'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  /** Removes the default padding, for cards that manage their own layout (e.g. list rows). */
  noPadding?: boolean
}

/**
 * Generic surface container. Use for queue rows, track detail panels, admin
 * list items — anything that needs to sit visually above the page
 * background. Nest a Card inside a Modal/Sheet when appropriate rather than
 * duplicating the surface styling.
 */
export function Card({
  children,
  noPadding = false,
  className = '',
  ...rest
}: CardProps) {
  return (
    <div
      className={`rounded-lg border border-border bg-surface ${noPadding ? '' : 'p-4'} ${className}`}
      {...rest}
    >
      {children}
    </div>
  )
}

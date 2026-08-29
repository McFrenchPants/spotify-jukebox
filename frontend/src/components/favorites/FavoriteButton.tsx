interface FavoriteButtonProps {
  favoritedByMe: boolean
  favoritedByAnyone: boolean
  onToggle: () => void
  className?: string
  /** 'sm' for a compact inline row control, 'md' (default) for a larger hero-card control. */
  size?: 'sm' | 'md'
}

const SIZE_PX: Record<'sm' | 'md', number> = {
  sm: 18,
  md: 24,
}

/**
 * Heart-icon toggle with three visual states (F3.1):
 *  - gray (text-text-muted): not favorited by me or anyone
 *  - amber (text-warning): favorited by someone else, not me
 *  - red/filled (text-error): favorited by me
 *
 * Presentational/controlled only — no fetching or async state here. Callers
 * (via useFavoritesStatus) own the data and pass favoritedByMe/favoritedByAnyone
 * as props, calling onToggle() on click.
 */
export function FavoriteButton({
  favoritedByMe,
  favoritedByAnyone,
  onToggle,
  className = '',
  size = 'md',
}: FavoriteButtonProps) {
  const colorClass = favoritedByMe ? 'text-error' : favoritedByAnyone ? 'text-warning' : 'text-text-muted'
  const px = SIZE_PX[size]
  const label = favoritedByMe ? 'Remove from favorites' : 'Add to favorites'

  return (
    <button
      type="button"
      aria-pressed={favoritedByMe}
      aria-label={label}
      onClick={(e) => {
        // Prevent triggering a parent row/card's own onClick (e.g. the Now
        // Playing card toggles its expanded state on click).
        e.stopPropagation()
        onToggle()
      }}
      className={`inline-flex items-center justify-center transition-fast active:scale-[0.9] ${colorClass} ${className}`}
    >
      <svg
        viewBox="0 0 24 24"
        width={px}
        height={px}
        fill={favoritedByMe ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 20.5s-7-4.35-9.5-8.6C.87 8.5 1.9 4.9 5.1 3.9c2-.63 4.05.15 5.4 2.02.4.55.75 1.1 1.5 2.2.75-1.1 1.1-1.65 1.5-2.2 1.35-1.87 3.4-2.65 5.4-2.02 3.2 1 4.23 4.6 2.6 8-2.5 4.25-9.5 8.6-9.5 8.6Z" />
      </svg>
    </button>
  )
}

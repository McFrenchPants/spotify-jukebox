import { useEffect, useRef, useState } from 'react'

export interface HelpTooltipProps {
  /** Explanation shown in the popover. Keep it to a sentence or two. */
  text: string
  /** Accessible label for the toggle button, e.g. "About rate-limit window". */
  label: string
}

/**
 * Small "?" affordance for settings whose purpose isn't obvious from the
 * label alone. Tap/click toggles the explanation open (and it stays open
 * until dismissed) since this app is touch-first and hover has no mobile
 * equivalent; mouse users additionally get it on hover for convenience.
 */
export function HelpTooltip({ text, label }: HelpTooltipProps) {
  const [clickOpen, setClickOpen] = useState(false)
  const [hoverOpen, setHoverOpen] = useState(false)
  const rootRef = useRef<HTMLSpanElement>(null)
  const open = clickOpen || hoverOpen

  useEffect(() => {
    if (!clickOpen) return
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setClickOpen(false)
      }
    }
    document.addEventListener('click', onDocClick)
    return () => document.removeEventListener('click', onDocClick)
  }, [clickOpen])

  return (
    <span ref={rootRef} className="relative inline-flex">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation()
          setClickOpen((o) => !o)
        }}
        onMouseEnter={() => setHoverOpen(true)}
        onMouseLeave={() => setHoverOpen(false)}
        onFocus={() => setHoverOpen(true)}
        onBlur={() => setHoverOpen(false)}
        className="glass-pill flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-caption leading-none text-text-muted transition-fast hover:text-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        ?
      </button>
      {open && (
        <div
          role="tooltip"
          className="glass-chrome absolute bottom-full left-1/2 z-10 mb-2 w-56 -translate-x-1/2 rounded-md p-2.5 text-caption text-text-secondary shadow-lg"
        >
          {text}
        </div>
      )}
    </span>
  )
}

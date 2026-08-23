import { useEffect, useState } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

function getInitial(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia(QUERY).matches
}

/**
 * Live-tracks the OS/browser `prefers-reduced-motion: reduce` setting via
 * `matchMedia` + a `change` listener, so it updates immediately if the user
 * flips the setting mid-session (no reload needed).
 *
 * `index.css`'s global reduced-motion media query already zeroes out pure
 * CSS `transition-duration`/`animation-duration`, but it can't touch JS
 * `setTimeout`-driven delays that gate a visual change (e.g. the
 * crossfade content-swap timers in AppShell.tsx / NowPlaying.tsx). Those
 * call sites should read this hook and use a near-zero delay instead of
 * their normal duration when this is true.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(getInitial)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mql = window.matchMedia(QUERY)
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [])

  return reduced
}

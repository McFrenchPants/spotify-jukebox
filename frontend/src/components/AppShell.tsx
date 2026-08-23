import { useEffect, useState, type ReactNode } from 'react'
import { usePrefersReducedMotion } from '../hooks/usePrefersReducedMotion'

export interface AppShellProps {
  children: ReactNode
  /**
   * Current track's album art URL, once known (P4.3, sourced from the
   * now-playing SSE stream via RootLayout.tsx). Layers a blurred, darkened
   * background image above the static gradient fallback, crossfading in/out
   * and between different URLs — the gradient stays as the always-present
   * base so a slow-loading or absent image never shows a blank background.
   */
  albumArtUrl?: string | null
  /**
   * Fixed bottom navigation bar (P4.8's BottomNav), rendered above page
   * content in stacking order and above the safe-area inset. When present,
   * `main`'s bottom padding grows so content never sits underneath it.
   */
  bottomBar?: ReactNode
}

/** Matches --duration-slow in index.css — the crossfade rides the same token. */
const CROSSFADE_MS = 320

/**
 * Global mobile-first layout: a full-viewport-height root on --color-bg,
 * with a dedicated background layer behind the content and a scrollable
 * foreground container above it.
 *
 * Per DESIGN_SPEC §9a the background is a blurred, darkened rendering of the
 * current track's album art, falling back to a static dark gradient when
 * nothing is playing / no art is available (P4.3).
 */
export function AppShell({ children, albumArtUrl, bottomBar }: AppShellProps) {
  // The art URL currently painted (may lag `albumArtUrl` mid-crossfade) and
  // whether it's faded in. Mirrors the crossfade technique used by
  // NowPlaying for the foreground content, so both layers animate in sync.
  const [displayedArt, setDisplayedArt] = useState<string | null>(null)
  const [artVisible, setArtVisible] = useState(false)
  const prefersReducedMotion = usePrefersReducedMotion()
  // The CSS opacity transition already collapses to ~0ms under
  // prefers-reduced-motion (index.css's global media query), but the JS
  // timer that decides *when* to swap the underlying content does not
  // shorten on its own — without this, a reduced-motion user would still
  // sit through a fixed 320ms hold before the new art appears, even though
  // the fade itself is now instant.
  const swapDelayMs = prefersReducedMotion ? 0 : CROSSFADE_MS

  useEffect(() => {
    const nextArt = albumArtUrl ?? null
    if (nextArt === displayedArt) return

    if (!nextArt) {
      setArtVisible(false)
      const timer = setTimeout(() => setDisplayedArt(null), swapDelayMs)
      return () => clearTimeout(timer)
    }

    if (!displayedArt) {
      // Fading in from "no art": mount at opacity 0, then flip visible next
      // frame so the transition actually animates instead of snapping.
      setDisplayedArt(nextArt)
      setArtVisible(false)
      const raf = requestAnimationFrame(() => setArtVisible(true))
      return () => cancelAnimationFrame(raf)
    }

    // Swapping between two different art URLs: fade out the old one, then
    // swap the src and fade the new one in.
    setArtVisible(false)
    const timer = setTimeout(() => {
      setDisplayedArt(nextArt)
      requestAnimationFrame(() => setArtVisible(true))
    }, swapDelayMs)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [albumArtUrl, swapDelayMs])

  return (
    <div className="relative min-h-screen bg-bg text-text-primary">
      <div
        className="app-shell__bg pointer-events-none fixed inset-0 z-0"
        style={{
          backgroundImage:
            'linear-gradient(180deg, var(--color-surface) 0%, var(--color-bg) 55%), ' +
            'radial-gradient(ellipse at top, rgba(47,214,111,0.08), transparent 60%)',
        }}
        aria-hidden="true"
      />

      {displayedArt && (
        <div
          className="app-shell__bg-art pointer-events-none fixed inset-0 z-0 bg-cover bg-center transition-slow"
          style={{
            backgroundImage: `url(${displayedArt})`,
            filter: 'blur(48px) brightness(0.4)',
            transform: 'scale(1.15)', // avoids blur revealing sharp edges at the viewport border
            opacity: artVisible ? 1 : 0,
          }}
          aria-hidden="true"
        />
      )}

      <div className="relative z-10 flex min-h-screen flex-col">
        <header
          className="px-4 pb-2"
          style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1rem)' }}
        >
          <p className="text-title text-text-primary">French&rsquo;s Jukebox</p>
        </header>

        <main
          className="mx-auto w-full max-w-lg flex-1 px-4 pb-6"
          style={{
            paddingBottom: bottomBar
              ? 'calc(env(safe-area-inset-bottom, 0px) + 5.5rem)'
              : 'calc(env(safe-area-inset-bottom, 0px) + 1.5rem)',
          }}
        >
          {children}
        </main>
      </div>

      {bottomBar}
    </div>
  )
}

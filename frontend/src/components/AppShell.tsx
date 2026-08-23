import type { ReactNode } from 'react'

/**
 * Global mobile-first layout: a full-viewport-height root on --color-bg,
 * with a dedicated background layer behind the content and a scrollable
 * foreground container above it.
 *
 * Per DESIGN_SPEC §9a the background is meant to be a blurred, darkened
 * rendering of the current track's album art, falling back to a static
 * dark gradient when nothing is playing / no art is available. That real
 * data doesn't exist yet (P4.3, SSE-driven) — this only builds the
 * structural container, always showing the static gradient fallback.
 *
 * P4.3 HOOK POINT: target the `.app-shell__bg` element below (e.g. set a
 * CSS custom property or swap in a background-image/blur) to wire up the
 * real album-art background without restructuring this component.
 */
export function AppShell({ children }: { children: ReactNode }) {
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

      <div className="relative z-10 flex min-h-screen flex-col">
        <header
          className="px-4 pb-2"
          style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1rem)' }}
        >
          <p className="text-title text-text-primary">Guest Jukebox</p>
        </header>

        <main
          className="mx-auto w-full max-w-lg flex-1 px-4 pb-6"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.5rem)' }}
        >
          {children}
        </main>
      </div>
    </div>
  )
}

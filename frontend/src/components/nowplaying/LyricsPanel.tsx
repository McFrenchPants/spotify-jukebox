import { useEffect, useMemo, useRef, useState } from 'react'
import { Card } from '../ui/Card'
import { getLyrics, type LyricsSnapshot } from '../../lib/api'
import { parseLrc } from '../../lib/lrc'
import { useSyncedLyrics } from '../../hooks/useSyncedLyrics'
import type { EventStream } from '../../hooks/useEventStream'

/** How recently the guest must have manually scrolled (while expanded) before auto-scroll resumes. */
const MANUAL_SCROLL_PAUSE_MS = 2500

export interface LyricsPanelProps {
  /** The currently-playing track's id — parent only renders this when a track is actually playing. */
  trackId: string
  subscribe: EventStream['subscribe']
  /** Live playback position, ticked by the parent's own clock — do not start a second one here. */
  progressMs: number
}

type LyricsUpdateEvent = {
  trackId: string
  syncedLyrics: string | null
  plainLyrics: string | null
  found: boolean
}

/**
 * Lyrics display for the currently-playing track (LY2.3). Fetches an initial
 * snapshot via GET /api/lyrics on mount/track-change, then stays live via the
 * `lyrics-update` SSE event. Renders one of: loading, not-found, synced
 * (auto-scrolling, active-line highlighted), or static plain-text lyrics.
 *
 * Starts collapsed at a fixed height; tapping the panel expands it to a much
 * taller, freely-scrollable view. While expanded, auto-scroll pauses briefly
 * after the guest manually scrolls, so it doesn't fight someone reading ahead.
 */
export function LyricsPanel({ trackId, subscribe, progressMs }: LyricsPanelProps) {
  const [snapshot, setSnapshot] = useState<LyricsSnapshot | null>(null)
  const [expanded, setExpanded] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const activeLineRef = useRef<HTMLParagraphElement | null>(null)
  const lastManualScrollRef = useRef(0)
  // Set just before triggering an auto-scroll and cleared shortly after, so
  // the scroll events that scrollIntoView() itself generates aren't
  // misread by onScroll below as a genuine manual scroll — without this,
  // every auto-scroll would immediately re-arm its own manual-scroll pause
  // window and the panel would appear to stop auto-scrolling once expanded.
  const isAutoScrollingRef = useRef(false)

  // No need to reset `snapshot` back to null here: the parent remounts this
  // component (via `key={trackId}`) on every track change, so a fresh mount
  // always starts from the initial `null` state already.
  useEffect(() => {
    let cancelled = false
    getLyrics()
      .then((data) => {
        if (!cancelled && data.trackId === trackId) setSnapshot(data)
      })
      .catch(() => {
        // Leave null — renders as the loading state, same as the initial
        // now-playing fetch failure pattern elsewhere in this component tree.
      })
    return () => {
      cancelled = true
    }
  }, [trackId])

  useEffect(
    () =>
      subscribe('lyrics-update', (data) => {
        const event = data as LyricsUpdateEvent
        // Defensive: ignore an update for a track the guest has since moved
        // away from (shouldn't normally happen given backend sequencing).
        if (event.trackId !== trackId) return
        setSnapshot({ trackId: event.trackId, syncedLyrics: event.syncedLyrics, plainLyrics: event.plainLyrics, found: event.found })
      }),
    [subscribe, trackId]
  )

  const lines = useMemo(
    () => (snapshot?.syncedLyrics ? parseLrc(snapshot.syncedLyrics) : []),
    [snapshot]
  )
  const activeIndex = useSyncedLyrics(lines, progressMs)

  // Auto-scroll the active line into view. Unconditional while collapsed;
  // paused for a short window after a manual scroll while expanded, so it
  // doesn't fight a guest who's scrolled ahead to read upcoming lines.
  useEffect(() => {
    if (activeIndex < 0) return
    if (expanded && Date.now() - lastManualScrollRef.current < MANUAL_SCROLL_PAUSE_MS) return
    isAutoScrollingRef.current = true
    activeLineRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    // Smooth scrolling fires a burst of scroll events over its animation —
    // clear the flag once that's had time to settle, rather than on the
    // very next tick, so none of those get misread as manual scrolling.
    const timer = setTimeout(() => {
      isAutoScrollingRef.current = false
    }, 500)
    return () => clearTimeout(timer)
  }, [activeIndex, expanded])

  const isLoading = !snapshot || snapshot.loading === true
  const notFound = !isLoading && snapshot?.found === false

  return (
    <Card
      noPadding
      className="cursor-pointer overflow-hidden bg-surface-overlay p-3 transition-slow"
      onClick={(e) => {
        e.stopPropagation()
        setExpanded((prev) => !prev)
      }}
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      aria-label={expanded ? 'Collapse lyrics' : 'Expand lyrics'}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          e.stopPropagation()
          setExpanded((prev) => !prev)
        }
      }}
    >
      {isLoading && <p className="text-caption text-text-muted">Loading lyrics…</p>}

      {notFound && <p className="text-caption text-text-muted">No lyrics found for this song</p>}

      {!isLoading && !notFound && snapshot?.syncedLyrics && (
        <div
          ref={containerRef}
          onScroll={() => {
            if (isAutoScrollingRef.current) return
            lastManualScrollRef.current = Date.now()
          }}
          onClick={(e) => e.stopPropagation()}
          className={`overflow-y-auto transition-slow ${expanded ? 'max-h-[32rem]' : 'max-h-48'}`}
        >
          {lines.map((line, i) => (
            <p
              key={`${line.timeMs}-${i}`}
              ref={i === activeIndex ? activeLineRef : undefined}
              className={`py-1 text-body transition-fast ${
                i === activeIndex ? 'font-semibold text-accent' : 'text-text-muted'
              }`}
            >
              {line.text || ' '}
            </p>
          ))}
        </div>
      )}

      {!isLoading && !notFound && !snapshot?.syncedLyrics && snapshot?.plainLyrics && (
        <div className={`overflow-y-auto transition-slow ${expanded ? 'max-h-[32rem]' : 'max-h-48'}`}>
          <p className="whitespace-pre-line text-body text-text-secondary">{snapshot.plainLyrics}</p>
        </div>
      )}
    </Card>
  )
}

import { useEffect, useRef, useState } from 'react'
import { Card } from '../ui/Card'
import { Toast } from '../ui/Toast'
import { Button } from '../ui/Button'
import {
  ApiError,
  getTrustMode,
  pausePlayback,
  resumePlayback,
  skipPlayback,
  setVolume,
  type TrustModeState,
} from '../../lib/api'
import { useSimpleToast } from '../../hooks/useSimpleToast'

const VOLUME_DEBOUNCE_MS = 300

export interface PlaybackControlsProps {
  /** Current play state, lifted up from NowPlaying via App.tsx — mirrors the albumArt precedent. */
  isPlaying: boolean
}

type ActionKey = 'pauseResume' | 'skip' | 'volume'

/**
 * Maps a playback-action failure to distinct, guest-facing copy. Mirrors
 * describeQueueError in SearchAndQueue.tsx: 403 is an expected mode-changed
 * race (not scary), 503 is the same "admin needs to finish setup" copy as
 * the P4.2 queue-add path, everything else is generic.
 */
function describePlaybackError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 403) {
      return "This action isn't available right now."
    }
    if (err.status === 503) {
      return "Playback isn't ready yet — an admin needs to finish setup. Try again shortly."
    }
    return err.message || 'Something went wrong with that action.'
  }
  return 'Something went wrong — check your connection and try again.'
}

/**
 * Trust-mode-aware pause/resume/skip/volume controls (P4.5). Fetches the
 * resolved permission booleans from GET /api/trust-mode once on mount —
 * there's no live-push event for trust-mode changes yet (only
 * queue-update/leaderboard-update/now-playing exist), so an admin change
 * mid-session won't reflect here without a page refresh. That's an
 * accepted gap for this task; the P3.3 endpoints re-check the mode
 * server-side on every call regardless, so a stale client-side read just
 * means a control might briefly look enabled but get a 403 back.
 *
 * Controls are shown-but-disabled (not hidden) when their permission is
 * false, since that communicates more to a curious guest than silent
 * absence, while still satisfying "hidden/disabled" either way.
 */
export function PlaybackControls({ isPlaying }: PlaybackControlsProps) {
  const [permissions, setPermissions] = useState<TrustModeState | null>(null)
  const [pending, setPending] = useState<Record<ActionKey, boolean>>({
    pauseResume: false,
    skip: false,
    volume: false,
  })
  const [volumeValue, setVolumeValue] = useState(50)
  const { toast, showToast, dismiss } = useSimpleToast()
  const volumeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let cancelled = false
    getTrustMode()
      .then((data) => {
        if (!cancelled) setPermissions(data)
      })
      .catch(() => {
        // Leave permissions null — all controls stay disabled, which is the
        // safe default when we can't confirm what's allowed.
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    return () => {
      if (volumeDebounceRef.current) clearTimeout(volumeDebounceRef.current)
    }
  }, [])

  async function runAction(key: ActionKey, action: () => Promise<void>) {
    setPending((prev) => ({ ...prev, [key]: true }))
    try {
      await action()
    } catch (err) {
      showToast('warning', 'Playback action failed', describePlaybackError(err))
    } finally {
      setPending((prev) => ({ ...prev, [key]: false }))
    }
  }

  function handlePauseResume() {
    void runAction('pauseResume', () => (isPlaying ? pausePlayback() : resumePlayback()))
  }

  function handleSkip() {
    void runAction('skip', () => skipPlayback())
  }

  function handleVolumeChange(next: number) {
    setVolumeValue(next)
    if (volumeDebounceRef.current) clearTimeout(volumeDebounceRef.current)
    volumeDebounceRef.current = setTimeout(() => {
      void runAction('volume', () => setVolume(next))
    }, VOLUME_DEBOUNCE_MS)
  }

  const pauseResumeAllowed = permissions?.pauseResume ?? false
  const skipAllowed = permissions?.skip ?? false
  const volumeAllowed = permissions?.volume ?? false

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Button
          variant="secondary"
          onClick={handlePauseResume}
          disabled={!pauseResumeAllowed || pending.pauseResume}
        >
          {isPlaying ? 'Pause' : 'Resume'}
        </Button>
        <Button variant="secondary" onClick={handleSkip} disabled={!skipAllowed || pending.skip}>
          Skip
        </Button>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-caption text-text-secondary">Volume</span>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={volumeValue}
          disabled={!volumeAllowed || pending.volume}
          onChange={(e) => handleVolumeChange(Number(e.target.value))}
          className="h-2 w-full accent-accent disabled:opacity-40"
        />
      </label>

      {!permissions && (
        <p className="text-caption text-text-muted">Checking playback permissions&hellip;</p>
      )}
      {permissions && !pauseResumeAllowed && !skipAllowed && !volumeAllowed && (
        <p className="text-caption text-text-muted">
          Playback controls are restricted right now — ask the host to enable them.
        </p>
      )}

      {toast && (
        <div className="fixed inset-x-0 bottom-0 z-20 flex justify-center px-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]">
          <Toast variant={toast.variant} title={toast.title} description={toast.description} onDismiss={dismiss} />
        </div>
      )}
    </Card>
  )
}

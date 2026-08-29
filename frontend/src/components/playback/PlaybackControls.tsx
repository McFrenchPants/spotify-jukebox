import { useEffect, useRef, useState } from 'react'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import {
  ApiError,
  getDevice,
  getTrustMode,
  pausePlayback,
  previousPlayback,
  resumePlayback,
  skipPlayback,
  setVolume,
  type Device,
  type TrustModeState,
} from '../../lib/api'
import { useToast } from '../../context/ToastContext'

const VOLUME_DEBOUNCE_MS = 300

export interface PlaybackControlsProps {
  /** Current play state, lifted up from NowPlaying via RootLayout.tsx — mirrors the albumArt precedent. */
  isPlaying: boolean
}

type ActionKey = 'previous' | 'pauseResume' | 'skip' | 'volume'

/** Filled triangle pointing right — play. */
function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" width="34" height="34" fill="currentColor" aria-hidden="true">
      <path d="M8 5.5v13l11-6.5z" />
    </svg>
  )
}

/** Two vertical bars — pause. */
function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="34" height="34" fill="currentColor" aria-hidden="true">
      <rect x="6.5" y="5" width="4" height="14" rx="1" />
      <rect x="13.5" y="5" width="4" height="14" rx="1" />
    </svg>
  )
}

/** Triangle-against-a-bar — skip forward. */
function SkipNextIcon() {
  return (
    <svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor" aria-hidden="true">
      <path d="M6 5.5v13l9-6.5z" />
      <rect x="16" y="5" width="3" height="14" rx="1" />
    </svg>
  )
}

/** Triangle-against-a-bar, mirrored — skip back / previous. */
function SkipPreviousIcon() {
  return (
    <svg viewBox="0 0 24 24" width="30" height="30" fill="currentColor" aria-hidden="true">
      <path d="M18 5.5v13l-9-6.5z" />
      <rect x="5" y="5" width="3" height="14" rx="1" />
    </svg>
  )
}

const VOLUME_UNSUPPORTED_COPY =
  "This device's volume can't be controlled remotely — adjust the phone or speaker directly."

const JUKEBOX_OFFLINE_COPY =
  'The Jukebox device is offline — playback controls are paused until it reconnects.'

/**
 * Maps a playback-action failure to distinct, guest-facing copy. Mirrors
 * describeQueueError in SearchAndQueue.tsx: 403 is an expected mode-changed
 * race (not scary), 503 is the same "admin needs to finish setup" copy as
 * the P4.2 queue-add path, everything else is generic.
 *
 * Fallback/defense-in-depth: even though the volume slider is proactively
 * disabled when the resolved device doesn't support remote volume control
 * (see the device fetch in PlaybackControls below), a stale client-side
 * device read or a race with a device change could still let a volume
 * request reach Spotify and come back with this exact failure. Recognize it
 * by message content (the backend wraps this as a 502 spotify_volume_failed,
 * not a 403 — Spotify's own "403" appears only inside the error text, not as
 * our backend's actual HTTP status) and show the same friendly copy instead
 * of the raw Spotify string.
 */
function describePlaybackError(err: unknown): string {
  if (err instanceof ApiError) {
    if (/cannot control device volume/i.test(err.message)) {
      return VOLUME_UNSUPPORTED_COPY
    }
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
  const [device, setDevice] = useState<Device | null | undefined>(undefined)
  const [pending, setPending] = useState<Record<ActionKey, boolean>>({
    previous: false,
    pauseResume: false,
    skip: false,
    volume: false,
  })
  const [volumeValue, setVolumeValue] = useState(50)
  const { showToast } = useToast()
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
    let cancelled = false
    // GET /api/device is public/unauthenticated, so this guest-facing
    // component can call it directly (same endpoint DeviceSelector.tsx uses
    // for the admin panel) to learn whether the resolved bridge device
    // supports remote volume control ahead of time, rather than letting a
    // guest hit a confusing raw Spotify error after already using the slider.
    getDevice()
      .then((data) => {
        if (!cancelled) setDevice(data.resolved)
      })
      .catch(() => {
        // Leave device undefined/unresolved — the volume slider stays
        // disabled below (undefined is treated the same as "no device").
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

  function handlePrevious() {
    void runAction('previous', () => previousPlayback())
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

  // Volume needs both the trust-mode permission AND a way to actually reach a
  // volume control — either the resolved Spotify device supports remote
  // volume, or a Jukebox device (native Android build, not yet shipped) is
  // registered and currently online, in which case the backend routes volume
  // commands to it over SSE instead of Spotify's Volume API.
  const deviceSupportsVolume = device != null && device.supports_volume
  const jukeboxDevice = permissions?.jukeboxDevice
  const jukeboxOnline = Boolean(jukeboxDevice?.registered && jukeboxDevice?.online)
  // A Jukebox device that's registered but currently offline is a distinct,
  // temporary state: it's the designated volume path, so nothing should be
  // usable until it reconnects (not just volume) — same spirit as this
  // component's other disabled states.
  const jukeboxOffline = Boolean(jukeboxDevice?.registered && !jukeboxDevice?.online)

  const pauseResumeAllowed = (permissions?.pauseResume ?? false) && !jukeboxOffline
  const skipAllowed = (permissions?.skip ?? false) && !jukeboxOffline
  const volumeAllowed = (permissions?.volume ?? false) && (deviceSupportsVolume || jukeboxOnline) && !jukeboxOffline

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-center gap-3">
        <Button
          variant="secondary"
          size="icon"
          onClick={handlePrevious}
          disabled={!skipAllowed || pending.previous}
          aria-label="Previous track"
        >
          <SkipPreviousIcon />
        </Button>
        <Button
          variant="primary"
          size="icon-lg"
          onClick={handlePauseResume}
          disabled={!pauseResumeAllowed || pending.pauseResume}
          aria-label={isPlaying ? 'Pause' : 'Resume'}
        >
          {isPlaying ? <PauseIcon /> : <PlayIcon />}
        </Button>
        <Button
          variant="secondary"
          size="icon"
          onClick={handleSkip}
          disabled={!skipAllowed || pending.skip}
          aria-label="Skip to next track"
        >
          <SkipNextIcon />
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
          className="h-11 w-full accent-accent disabled:opacity-40 lg:mx-auto lg:max-w-sm"
        />
      </label>

      {!permissions && (
        <p className="text-caption text-text-muted">Checking playback permissions&hellip;</p>
      )}
      {jukeboxOffline ? (
        <p className="text-caption text-text-muted">{JUKEBOX_OFFLINE_COPY}</p>
      ) : (
        <>
          {permissions && !pauseResumeAllowed && !skipAllowed && !permissions.volume && (
            <p className="text-caption text-text-muted">
              Playback controls are restricted right now — ask the host to enable them.
            </p>
          )}
          {permissions?.volume && !deviceSupportsVolume && !jukeboxOnline && (
            <p className="text-caption text-text-muted">{VOLUME_UNSUPPORTED_COPY}</p>
          )}
        </>
      )}
    </Card>
  )
}

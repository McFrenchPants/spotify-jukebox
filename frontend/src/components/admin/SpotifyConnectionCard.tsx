import { useCallback, useEffect, useState } from 'react'
import { Card } from '../ui/Card'
import { Button } from '../ui/Button'
import { Skeleton } from '../ui/Skeleton'
import { ApiError, connectSpotify, getSpotifyConnectionStatus, type SpotifyConnectionStatus } from '../../lib/api'
import { useToast } from '../../context/ToastContext'

export interface SpotifyConnectionCardProps {
  token: string
}

/** Shared, fixed page every self-hosted install points at — see docs/oauth-callback/index.html. */
const AUTH_PAGE_URL = 'https://mcfrenchpants.github.io/spotify-jukebox/oauth-callback/'

const REASON_COPY: Record<'not_connected' | 'reauth_required', string> = {
  not_connected: "Spotify isn't connected yet.",
  reauth_required: 'Your Spotify connection has expired and needs to be reconnected.',
}

/**
 * Surfaces Spotify connection state automatically on Settings load, instead
 * of an admin only discovering it's missing from a blank/broken Now Playing
 * card. Not fully automatic — Spotify always requires an actual human login
 * somewhere, that part can't be skipped — but this closes the rest of the
 * gap: no HA Supervisor restart needed, no separate Configuration tab trip.
 * The admin opens the linked page (any device, no SSH/localhost — see
 * docs/oauth-callback/index.html), pastes back the refresh token it hands
 * them, and this applies it live via POST /api/spotify-connection/connect.
 */
export function SpotifyConnectionCard({ token }: SpotifyConnectionCardProps) {
  const [status, setStatus] = useState<SpotifyConnectionStatus | null>(null)
  const [refreshToken, setRefreshToken] = useState('')
  const [connecting, setConnecting] = useState(false)
  const { showToast } = useToast()

  const load = useCallback(() => {
    getSpotifyConnectionStatus()
      .then(setStatus)
      .catch(() => {
        // Leave status null — the card just stays in its loading skeleton
        // rather than claiming a definite (and possibly wrong) state.
      })
  }, [])

  useEffect(() => {
    load()
  }, [load])

  async function handleConnect() {
    if (refreshToken.trim() === '') return
    setConnecting(true)
    try {
      await connectSpotify(token, refreshToken.trim())
      setRefreshToken('')
      showToast('success', 'Spotify connected')
      load()
    } catch (err) {
      showToast(
        'error',
        'Could not connect Spotify',
        err instanceof ApiError ? err.message : undefined
      )
    } finally {
      setConnecting(false)
    }
  }

  return (
    <Card className="flex flex-col gap-4">
      <p className="text-title text-text-primary">Spotify connection</p>

      {status === null && (
        <div className="flex flex-col gap-2">
          <Skeleton variant="block" />
        </div>
      )}

      {status?.connected === true && (
        <p className="text-caption text-accent">Connected — the app is authorized and staying connected on its own.</p>
      )}

      {status?.connected === false && status.reason === 'rate_limited' && (
        <p className="text-caption text-text-muted">
          Checking Spotify's connection status right now hit a rate limit — try reloading this page in a bit.
        </p>
      )}

      {status?.connected === false && status.reason !== 'rate_limited' && (
        <div className="flex flex-col gap-3">
          <p className="text-caption text-text-secondary">{REASON_COPY[status.reason]}</p>

          <ol className="flex flex-col gap-1 text-caption text-text-muted">
            <li>
              1. Open{' '}
              <a
                href={AUTH_PAGE_URL}
                target="_blank"
                rel="noreferrer"
                className="text-accent underline-offset-2 hover:underline"
              >
                the Spotify authorization page
              </a>{' '}
              (any device, any browser).
            </li>
            <li>2. Paste in your Spotify app's Client ID and click Authorize.</li>
            <li>3. Paste the refresh token it gives you back below.</li>
          </ol>

          <input
            type="text"
            autoComplete="off"
            spellCheck={false}
            value={refreshToken}
            onChange={(e) => setRefreshToken(e.target.value)}
            placeholder="Paste refresh token here"
            aria-label="Spotify refresh token"
            className="glass-inset h-11 rounded-md px-3 text-body text-text-primary outline-none transition-fast focus-visible:border-accent"
          />

          <Button
            variant="primary"
            size="md"
            disabled={refreshToken.trim() === '' || connecting}
            onClick={() => void handleConnect()}
          >
            {connecting ? 'Connecting…' : 'Connect'}
          </Button>
        </div>
      )}
    </Card>
  )
}

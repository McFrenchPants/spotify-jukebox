import { useState, type FormEvent, type ReactNode } from 'react'
import { Capacitor } from '@capacitor/core'
import { Button } from './ui/Button'
import { Card } from './ui/Card'
import { getBackendUrl, setBackendUrl } from '../lib/backendUrl'

/** Very light sanity check — not trying to fully validate URL syntax, just catch empty/garbage input early. */
function looksLikeUrl(value: string): boolean {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * First-run setup screen for the native Android build. The Capacitor
 * WebView loads the bundled static build from its own local origin with no
 * backend co-located there — unlike the web/HA-Add-on deployment, there's no
 * same-origin backend for relative `/api/...` calls to resolve against, and
 * no way to auto-discover the bridge phone's LAN address. So on first run
 * (native + no URL saved yet) this asks for it once, confirms it's actually
 * reachable via GET /api/health, and persists it — see lib/backendUrl.ts.
 *
 * On a plain web/browser build (the overwhelming common case) this renders
 * `children` unchanged: `Capacitor.isNativePlatform()` is false there, so
 * this component is a complete no-op.
 */
export function NativeBackendGate({ children }: { children: ReactNode }) {
  const [configured, setConfigured] = useState(() => getBackendUrl() !== null)

  if (!Capacitor.isNativePlatform() || configured) {
    return <>{children}</>
  }

  return <BackendSetupScreen onSaved={() => setConfigured(true)} />
}

function BackendSetupScreen({ onSaved }: { onSaved: () => void }) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const trimmed = url.trim()
    if (trimmed === '' || submitting) return

    if (!looksLikeUrl(trimmed)) {
      setError('Enter a full URL, e.g. http://192.168.1.50:8085')
      return
    }

    setSubmitting(true)
    setError(null)
    const base = trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed
    try {
      const res = await fetch(`${base}/api/health`)
      if (!res.ok) {
        throw new Error(`Server responded with HTTP ${res.status}`)
      }
      const body = (await res.json()) as { status?: string }
      if (body.status !== 'ok') {
        throw new Error(`Unexpected response body: ${JSON.stringify(body)}`)
      }
      setBackendUrl(trimmed)
      onSaved()
    } catch (err) {
      // Surface the real error instead of a canned message — a bare
      // "TypeError: Failed to fetch" still narrows things down a lot
      // (network-level failure vs. a real HTTP/JSON response), and this
      // avoids blind guess-and-retype cycles when it doesn't. Also logged to
      // console so it's visible via `adb logcat` (Capacitor forwards WebView
      // console output there under the "Capacitor/Console" tag) even if the
      // on-screen text alone isn't enough to diagnose.
      const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
      console.error(`[NativeBackendGate] health check failed for ${base}/api/health —`, err)
      setError(`Couldn't reach ${base}/api/health — ${detail}`)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="mx-auto flex max-w-sm flex-col gap-4">
        <div className="flex flex-col items-center gap-1 text-center">
          <p className="text-title text-text-primary">Connect to Jukebox</p>
          <p className="text-caption text-text-muted">
            Enter the backend server&apos;s address on your local network.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="text"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            autoFocus
            value={url}
            onChange={(e) => {
              setUrl(e.target.value)
              if (error) setError(null)
            }}
            placeholder="http://192.168.1.50:8085"
            aria-label="Backend server URL"
            className="glass-inset h-12 rounded-md px-4 text-center text-body text-text-primary outline-none transition-fast focus-visible:border-accent"
          />

          {error && (
            <p role="alert" className="text-center text-caption text-error">
              {error}
            </p>
          )}

          <Button type="submit" size="lg" disabled={url.trim() === '' || submitting}>
            {submitting ? 'Checking…' : 'Save'}
          </Button>
        </form>
      </Card>
    </div>
  )
}

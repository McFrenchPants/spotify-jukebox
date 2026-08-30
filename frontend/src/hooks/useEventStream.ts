import { useCallback, useEffect, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { getOrCreateClientId } from '../lib/clientId'
import { getApiBaseUrl } from '../lib/backendUrl'

export type ConnectionState = 'connecting' | 'open' | 'closed'

type EventHandler = (data: unknown) => void

/** Named SSE events the backend emits on /api/events (see events/bus.ts). */
const NAMED_EVENTS = [
  'now-playing',
  'queue-update',
  'leaderboard-update',
  'device-status',
  'favorites-update',
  'jukebox-volume-command',
  'jukebox-volume-status',
] as const

/** How long the connection must be non-open before we surface the manual-refresh fallback. */
const STALE_THRESHOLD_MS = 5000
const STALE_CHECK_INTERVAL_MS = 1000

/**
 * Vite's dev-server proxy (server.proxy in vite.config.ts) doesn't reliably
 * stream this endpoint — the connection hangs and EventSource never opens
 * (reproduced on a fresh dev-server restart with zero prior connections, so
 * not a leaked-connection artifact; root cause not fully isolated). Every
 * other /api/* call goes through the proxy fine — only this long-lived
 * stream is affected. Worked around by connecting straight to the backend
 * origin in dev instead of the proxied relative path; the backend allows
 * this via a permissive CORS header on just this route (see
 * backend/src/routes/events.ts) since it's an unauthenticated public read
 * with no credentials involved. Production serves frontend and backend from
 * the same origin (per DESIGN_SPEC's deployment model), so this only
 * matters in dev.
 *
 * Uses window.location.hostname rather than a literal "localhost" so this
 * also works when the dev server is reached from another device on the LAN
 * (e.g. testing from a phone via the dev machine's IP) — "localhost" in that
 * case would resolve to the phone itself, not the dev machine.
 */
const DEFAULT_EVENTS_URL = import.meta.env.DEV
  ? `http://${window.location.hostname}:8085/api/events`
  : '/api/events'

/**
 * Builds the URL to connect to, appending `?clientId=<id>` only when running
 * as a native (Capacitor) build. The backend uses this to recognize the
 * connection as coming from the registered Jukebox device — see
 * `isJukeboxDeviceOnline()` / the `jukebox-device-status` event on the
 * backend. Ordinary web/browser guests have no reason to identify
 * themselves this way, so on a plain web build this must stay byte-identical
 * to `DEFAULT_EVENTS_URL` (no query string at all).
 *
 * On native, the base can't be `DEFAULT_EVENTS_URL` — that constant only
 * accounts for Vite dev mode vs. same-origin production, neither of which
 * applies to a native WebView (it has no co-located backend at all). Native
 * instead uses the user-configured LAN backend URL from lib/backendUrl.ts
 * (`''` until first-run setup completes, in which case this resolves to a
 * bare `/api/events?clientId=...` — same as it would have before this fix,
 * i.e. still broken until setup runs, but never worse).
 */
function buildEventsUrl(): string {
  if (!Capacitor.isNativePlatform()) {
    return DEFAULT_EVENTS_URL
  }
  const nativeBase = `${getApiBaseUrl()}/api/events`
  return `${nativeBase}?clientId=${encodeURIComponent(getOrCreateClientId())}`
}

export interface EventStream {
  connectionState: ConnectionState
  /** True once the connection has been non-open for more than a few seconds. */
  isStale: boolean
  /**
   * Epoch ms timestamp of the most recent *real* reconnect — i.e. the
   * connection was open, actually dropped, and has now reopened. Starts at 0
   * and stays 0 until the first real reconnect; never fires for the initial
   * connect on mount (there's nothing to recover from then). Consumers can
   * watch this value to auto-refetch state that may have changed during a
   * drop too brief to trip `isStale`'s manual-refresh banner.
   */
  reconnectedAt: number
  /** Registers `handler` for `eventName`; returns an unsubscribe function. */
  subscribe: (eventName: string, handler: EventHandler) => () => void
}

/**
 * Wraps a single native EventSource connected to `url` (default
 * /api/events). `EventSource` reconnects on its own after a network drop —
 * this hook doesn't hand-roll reconnect logic, it just tracks how long the
 * connection has been away from 'open' so callers can show a manual-refresh
 * affordance if the browser's built-in backoff isn't recovering quickly.
 */
export function useEventStream(url = buildEventsUrl()): EventStream {
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting')
  const [isStale, setIsStale] = useState(false)
  const [reconnectedAt, setReconnectedAt] = useState(0)
  const listenersRef = useRef(new Map<string, Set<EventHandler>>())
  // Timestamp the connection most recently *left* the open state, or null
  // while currently open. Set to "now" when the connect effect starts,
  // since we start disconnected — done there rather than as this ref's
  // initializer so Date.now() isn't called during render.
  const disconnectedSinceRef = useRef<number | null>(null)
  // Whether this connection has ever actually reached the 'open' state.
  // Distinguishes "hasn't connected yet" (disconnectedSinceRef is non-null
  // simply because the effect just started) from "was open, then dropped"
  // (a real disconnect) — only the latter counts as a reconnect once we're
  // back open, so reconnectedAt never fires on the initial connect.
  const wasEverOpenRef = useRef(false)

  const subscribe = useCallback((eventName: string, handler: EventHandler) => {
    let handlers = listenersRef.current.get(eventName)
    if (!handlers) {
      handlers = new Set()
      listenersRef.current.set(eventName, handlers)
    }
    handlers.add(handler)
    return () => {
      handlers.delete(handler)
    }
  }, [])

  useEffect(() => {
    disconnectedSinceRef.current = Date.now()
    wasEverOpenRef.current = false
    const source = new EventSource(url)

    source.onopen = () => {
      // Only a *real* reconnect (was open, then genuinely dropped) should
      // trigger reconnectedAt — not the very first connect on mount, which
      // has nothing to recover from.
      const isRealReconnect = wasEverOpenRef.current && disconnectedSinceRef.current !== null
      disconnectedSinceRef.current = null
      wasEverOpenRef.current = true
      setConnectionState('open')
      setIsStale(false)
      if (isRealReconnect) {
        setReconnectedAt(Date.now())
      }
    }

    source.onerror = () => {
      if (disconnectedSinceRef.current === null) {
        disconnectedSinceRef.current = Date.now()
      }
      setConnectionState(source.readyState === EventSource.CLOSED ? 'closed' : 'connecting')
    }

    const boundListeners = NAMED_EVENTS.map((name) => {
      const listener = (evt: MessageEvent<string>) => {
        let data: unknown
        try {
          data = evt.data ? JSON.parse(evt.data) : undefined
        } catch {
          data = undefined
        }
        listenersRef.current.get(name)?.forEach((handler) => handler(data))
      }
      source.addEventListener(name, listener)
      return { name, listener }
    })

    const staleCheck = setInterval(() => {
      const since = disconnectedSinceRef.current
      setIsStale(since !== null && Date.now() - since > STALE_THRESHOLD_MS)
    }, STALE_CHECK_INTERVAL_MS)

    return () => {
      clearInterval(staleCheck)
      boundListeners.forEach(({ name, listener }) => source.removeEventListener(name, listener))
      source.close()
    }
  }, [url])

  return { connectionState, isStale, reconnectedAt, subscribe }
}

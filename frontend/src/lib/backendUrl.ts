import { Capacitor } from '@capacitor/core'

const STORAGE_KEY = 'jukebox_backend_url'

/** Strips a trailing slash (if any) so callers can safely concatenate `${base}/api/...`. */
function stripTrailingSlash(url: string): string {
  return url.endsWith('/') ? url.slice(0, -1) : url
}

/**
 * Returns the backend base URL configured for the native (Capacitor) build,
 * or `null` if the user hasn't gone through first-run setup yet.
 *
 * Only meaningful when `Capacitor.isNativePlatform()` — the native WebView
 * loads the bundled static build from its own local origin with no backend
 * co-located there, so relative `/api/...` fetches can't resolve. On a
 * regular web/browser deployment this is never read; see getApiBaseUrl().
 */
export function getBackendUrl(): string | null {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (!stored) {
    return null
  }
  return stripTrailingSlash(stored.trim())
}

/** Persists the backend base URL for the native build (trimmed, trailing slash stripped). */
export function setBackendUrl(url: string): void {
  localStorage.setItem(STORAGE_KEY, stripTrailingSlash(url.trim()))
}

/**
 * The base URL to prefix every `/api/...` call with.
 *
 * On a plain web/browser deployment (Docker, HA Add-on, local dev) this is
 * always `''` — frontend and backend are served from the same origin, so
 * relative paths already work exactly as they do today; this preserves that
 * behavior with zero change. On the native Android build there is no
 * co-located backend, so this returns the user-configured LAN URL from
 * getBackendUrl() (or `''` if not yet configured — callers that need to
 * gate on "not yet configured" should check getBackendUrl() directly, e.g.
 * NativeBackendGate).
 */
export function getApiBaseUrl(): string {
  if (!Capacitor.isNativePlatform()) {
    return ''
  }
  return getBackendUrl() ?? ''
}

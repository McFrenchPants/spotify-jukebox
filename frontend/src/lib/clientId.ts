const STORAGE_KEY = 'jukebox_client_id'

/**
 * Returns a stable per-install client id for this browser.
 *
 * Reads a previously-generated id from localStorage. If none exists yet
 * (first run in this browser), generates one via `crypto.randomUUID()` and
 * persists it back to localStorage so subsequent calls — including after a
 * reload — return the same value. This id identifies this browser/install,
 * distinct from the guest session token in `session.ts`: it's used to let
 * the backend recognize this client as (potentially) the registered Jukebox
 * device, not to authenticate a user's session.
 */
export function getOrCreateClientId(): string {
  const existingId = localStorage.getItem(STORAGE_KEY)
  if (existingId) {
    return existingId
  }

  const newId = crypto.randomUUID()
  localStorage.setItem(STORAGE_KEY, newId)
  return newId
}

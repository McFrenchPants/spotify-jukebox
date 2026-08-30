/**
 * Tiny in-memory TTL cache for read-only Spotify lookups (search results,
 * track/artist metadata) that are likely to be requested again — by the same
 * guest re-opening a tab, or by a *different* guest at the same party — well
 * within a window where the answer can't realistically have changed. This
 * exists specifically to cut down on redundant Web API calls when multiple
 * guests are using the app concurrently (searching for the same popular
 * songs, queueing the same track, expanding the same currently-playing
 * artist's info), since Spotify's rate limit is shared across the whole app
 * (see rateLimitBackoff.ts) rather than scaling with guest count.
 *
 * Deliberately process-local and unbounded-but-short-lived: no eviction
 * policy beyond TTL expiry, since a home-party deployment's working set
 * (a session's worth of searched/queued tracks) is small and the process
 * restarts often enough that unbounded growth was judged not worth the
 * complexity of an LRU cap.
 */

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

const store = new Map<string, CacheEntry<unknown>>();

/**
 * Returns the cached value for `key` if it hasn't expired yet; otherwise
 * calls `fn`, caches its resolved value for `ttlMs`, and returns it. A
 * rejection from `fn` is never cached — the next call for the same key tries
 * again for real, so a transient Spotify failure (including a 429) doesn't
 * get "stuck" as a cached error.
 */
export async function withCache<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
  const entry = store.get(key);
  if (entry && entry.expiresAt > Date.now()) {
    return entry.value as T;
  }

  const value = await fn();
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
  return value;
}

/** Test-only: clears every cached entry. */
export function resetSpotifyCacheForTests(): void {
  store.clear();
}

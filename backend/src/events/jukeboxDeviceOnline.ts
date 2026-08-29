import { emitEvent } from "./bus";
import { getRegisteredJukeboxDeviceId } from "../db/jukeboxDevice";

/**
 * M1.2 — Jukebox-device online/offline tracking.
 *
 * Tracks, in-memory and per-process (no DB table — this is connection state,
 * not durable data), which client ids currently hold an open `GET
 * /api/events?clientId=...` SSE connection. This lets the backend answer "is
 * the currently-registered Jukebox device actually connected right now?" —
 * as opposed to "has a Jukebox device ever been registered" (M1.1, which only
 * covers durable registration storage).
 *
 * A reference count (rather than a plain Set) is used so that two
 * simultaneous connections sharing the same clientId (e.g. a page reload
 * that briefly overlaps the old and new connections) don't cause the first
 * one to close and prematurely mark the device offline while the second is
 * still live.
 *
 * KNOWN LIMITATION: if the registered Jukebox device id changes (a new
 * `registerJukeboxDeviceId` call, M1.1) while a client is connected, this
 * module does not proactively re-evaluate or re-emit anything — the
 * `connectionCounts` map is keyed by whatever clientId(s) are actually
 * connected, and `isJukeboxDeviceOnline()` always reflects the *current*
 * registration against that map, so a fresh call to `isJukeboxDeviceOnline()`
 * is always accurate. What's stale is the *event*: no `jukebox-device-status`
 * event fires at the moment of registration change, so an SSE listener only
 * learns about the new device's online/offline status on that device's next
 * connect/disconnect (or the old device's next disconnect, if it's still
 * connected under the old registration). Acceptable for v1; a later task can
 * have `registerJukeboxDeviceId` emit a follow-up event if this gap matters.
 */

const connectionCounts = new Map<string, number>();

/** Returns whether the currently-registered Jukebox device's clientId has at least one open SSE connection. */
export function isJukeboxDeviceOnline(): boolean {
  const registeredId = getRegisteredJukeboxDeviceId();
  return registeredId !== null && (connectionCounts.get(registeredId) ?? 0) > 0;
}

/**
 * Records that `clientId` opened an SSE connection. If this causes the
 * registered Jukebox device's online status to actually change, emits
 * `jukebox-device-status` with `{ online }`.
 */
export function clientConnected(clientId: string): void {
  const wasOnline = isJukeboxDeviceOnline();
  connectionCounts.set(clientId, (connectionCounts.get(clientId) ?? 0) + 1);
  const isOnline = isJukeboxDeviceOnline();

  if (isOnline !== wasOnline) {
    emitEvent("jukebox-device-status", { online: isOnline });
  }
}

/**
 * Records that `clientId` closed an SSE connection. If this causes the
 * registered Jukebox device's online status to actually change, emits
 * `jukebox-device-status` with `{ online }`.
 */
export function clientDisconnected(clientId: string): void {
  const wasOnline = isJukeboxDeviceOnline();

  const count = connectionCounts.get(clientId) ?? 0;
  if (count <= 1) {
    connectionCounts.delete(clientId);
  } else {
    connectionCounts.set(clientId, count - 1);
  }

  const isOnline = isJukeboxDeviceOnline();

  if (isOnline !== wasOnline) {
    emitEvent("jukebox-device-status", { online: isOnline });
  }
}

/**
 * Test-only: clears all tracked connections without emitting events, so test
 * files can start each case from a known-empty state regardless of what
 * earlier tests left behind. Mirrors the `resetNowPlayingState` /
 * `resetRateLimitForTests` pattern used elsewhere in this codebase.
 */
export function resetJukeboxDeviceOnlineForTests(): void {
  connectionCounts.clear();
}

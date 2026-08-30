import { emitEvent } from "./bus";

/**
 * Backlog item 19 — Jukebox-device volume reporting.
 *
 * Tracks, in-memory and per-process (no DB table — this is ephemeral live
 * device state, not durable data, mirroring the jukeboxDeviceOnline.ts
 * pattern), the last-known volume percent reported by the native Jukebox
 * device (Master Device Mode). Master Device Mode volume commands are
 * currently one-way (backend -> phone, see the jukebox-volume-command event
 * in routes/playback.ts); this module is the read-back half, letting the
 * phone report its actual current volume (its hardware buttons and Android's
 * own volume UI can change it out-of-band) so guest sliders can be seeded
 * accurately and kept in sync.
 */

let lastKnownVolumePercent: number | null = null;

/** Returns the last volume percent reported by the Jukebox device, or null if none has ever been reported. */
export function getLastKnownJukeboxVolumePercent(): number | null {
  return lastKnownVolumePercent;
}

/**
 * Records that the Jukebox device's actual volume is now `percent`. If this
 * causes the last-known value to actually change (including going from
 * unset to set), emits `jukebox-volume-status` with `{ volumePercent }` so
 * connected clients can update their sliders live. Repeated reports of the
 * same value (e.g. from a polling native client) do not re-emit, to avoid
 * spamming an SSE event every poll tick when the volume hasn't moved.
 */
export function reportJukeboxVolumePercent(percent: number): void {
  if (lastKnownVolumePercent === percent) {
    return;
  }

  lastKnownVolumePercent = percent;
  emitEvent("jukebox-volume-status", { volumePercent: percent });
}

/**
 * Test-only: resets the tracked volume to unset without emitting events, so
 * test files can start each case from a known state regardless of what
 * earlier tests left behind. Mirrors resetJukeboxDeviceOnlineForTests.
 */
export function resetJukeboxVolumeStatusForTests(): void {
  lastKnownVolumePercent = null;
}

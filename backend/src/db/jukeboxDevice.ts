import { getSetting, setSetting } from ".";

/**
 * M1.1 — Jukebox device registration.
 *
 * Stores the client id of the single native device currently registered as
 * "the Jukebox device" (the one the backend will later route local-volume
 * commands to). Only one registration exists at a time: registering a new
 * clientId simply overwrites whatever was registered before, following the
 * same key/value app_settings pattern as spotify_device_id in appSettings.ts.
 *
 * This module only covers registration storage — no routing, SSE, or
 * frontend wiring; those are later tasks in the same proposal.
 */
export const JUKEBOX_DEVICE_CLIENT_ID_KEY = "jukebox_device_client_id";

/** Returns the currently registered Jukebox device's clientId, or null if none has ever been registered. */
export function getRegisteredJukeboxDeviceId(): string | null {
  return getSetting(JUKEBOX_DEVICE_CLIENT_ID_KEY) ?? null;
}

/** Registers `clientId` as the current Jukebox device, superseding any previous registration. */
export function registerJukeboxDeviceId(clientId: string): void {
  setSetting(JUKEBOX_DEVICE_CLIENT_ID_KEY, clientId);
}

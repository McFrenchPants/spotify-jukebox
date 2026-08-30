import { getSetting, setSetting } from "../db";
import { getValidAccessToken } from "./client";
import { SpotifyRateLimitedError } from "./errors";
import { recordRateLimitFromResponse } from "./rateLimitBackoff";

const SPOTIFY_API_BASE = "https://api.spotify.com/v1";

export interface Device {
  id: string;
  name: string;
  type: string;
  is_active: boolean;
  volume_percent: number | null;
  supports_volume: boolean;
}

interface SpotifyDevicesResponse {
  devices?: Array<{
    id: string | null;
    name: string;
    type: string;
    is_active: boolean;
    volume_percent: number | null;
    supports_volume: boolean;
  }>;
}

export interface DeviceResolution {
  resolved: Device | null;
  devices: Device[];
}

/**
 * Fetches the live list of Spotify Connect devices visible to this account.
 *
 * `fetchFn` and `getTokenFn` are injectable for testing, following the same
 * pattern as `searchTracks` in ./client.ts.
 */
export async function listDevices(
  fetchFn: typeof fetch = fetch,
  getTokenFn: () => Promise<string> = getValidAccessToken
): Promise<Device[]> {
  const accessToken = await getTokenFn();

  const response = await fetchFn(`${SPOTIFY_API_BASE}/me/player/devices`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    // Arms the automatic pollers' backoff window (see rateLimitBackoff.ts)
    // on a 429 — this call still throws below either way, so the immediate
    // caller (an admin's manual retry, or the poller itself) still gets a
    // real, honest error; this just stops the *automatic* pollers from
    // continuing to hammer Spotify while the window is active.
    const wasRateLimited = recordRateLimitFromResponse(response);

    let message = `${response.status}`;
    try {
      const errBody = (await response.json()) as {
        error?: { message?: string };
      };
      if (errBody.error?.message) {
        message = `${response.status} ${errBody.error.message}`;
      }
    } catch {
      // Ignore JSON parse failures on the error body; fall back to status.
    }

    if (wasRateLimited) {
      // A dedicated error type so classifySpotifyAuthError() (errors.ts) can
      // surface this as a friendly 503 spotify_rate_limited response instead
      // of routes/device.ts's generic 502 spotify_device_lookup_failed with
      // the raw Spotify error text (see BACKLOG.md item 9, Bug B).
      throw new SpotifyRateLimitedError(`Spotify device list failed: ${message}`);
    }
    throw new Error(`Spotify device list failed: ${message}`);
  }

  const data = (await response.json()) as SpotifyDevicesResponse;
  const items = data.devices ?? [];

  // Devices without an id (Spotify can return null id in rare cases) aren't
  // addressable for targeting, so drop them.
  return items
    .filter((d): d is typeof items[number] & { id: string } => Boolean(d.id))
    .map((d) => ({
      id: d.id,
      name: d.name,
      type: d.type,
      is_active: d.is_active,
      volume_percent: d.volume_percent,
      supports_volume: d.supports_volume,
    }));
}

/**
 * Resolves which Spotify Connect device the app should treat as "the bridge
 * device" for playback targeting.
 *
 * Resolution order:
 *  1. A previously-selected device id (app_settings.spotify_device_id) that
 *     is still present in the live device list wins — return its current
 *     info from the live list (not the stale stored copy).
 *  2. If there's no valid prior selection but exactly one device is visible,
 *     that device is unambiguous — resolve to it and persist the choice so
 *     future polls short-circuit via rule 1.
 *  3. If there are zero or multiple devices with no valid prior selection,
 *     resolution is ambiguous — return `resolved: null` alongside the full
 *     device list so an admin can pick.
 */
export async function resolveDevice(
  fetchFn: typeof fetch = fetch,
  getTokenFn: () => Promise<string> = getValidAccessToken
): Promise<DeviceResolution> {
  const devices = await listDevices(fetchFn, getTokenFn);

  const previouslySelectedId = getSetting("spotify_device_id");
  if (previouslySelectedId) {
    const match = devices.find((d) => d.id === previouslySelectedId);
    if (match) {
      return { resolved: match, devices };
    }
  }

  if (devices.length === 1) {
    const only = devices[0];
    setSetting("spotify_device_id", only.id);
    return { resolved: only, devices };
  }

  return { resolved: null, devices };
}

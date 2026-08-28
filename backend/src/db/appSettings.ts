import { deleteSetting, getSetting, setSetting } from ".";
import {
  DEFAULT_EXPLICIT_FILTER_ENABLED,
  DEFAULT_MAX_DURATION_MS,
  DEFAULT_MIN_DURATION_MS,
  EXPLICIT_FILTER_ENABLED_KEY,
  MAX_DURATION_MS_KEY,
  MIN_DURATION_MS_KEY,
} from "../guardrails/queueGuardrails";
import { DEFAULT_RATE_LIMIT_WINDOW_MS, RATE_LIMIT_WINDOW_MS_KEY } from "../guardrails/rateLimiter";

/**
 * P3.2 — Settings CRUD.
 *
 * Trust-mode modeling: an `active_mode` setting ("restricted" | "trusted",
 * default "restricted") plus four individual boolean override settings, one
 * per gated capability from DESIGN_SPEC §4 (pause/resume, skip, volume,
 * reorder). A future `resolveEffectivePermissions()`-style consumer (P3.3)
 * checks the specific override first; if it's unset ("inherit"), it falls
 * back to what `active_mode` implies. This module does NOT implement that
 * resolution logic — only the settings storage/shape it will read.
 *
 * "Unset/inherit" representation: an override key with no row in
 * `app_settings` at all (not a sentinel string). PUT with `null` for an
 * allow* field calls `deleteSetting` to remove the row; GET treats a missing
 * row as `null` in the response. This reuses the existing getSetting/
 * setSetting contract (value is `string | undefined`) without needing a
 * magic "null" string value.
 */

export const ACTIVE_MODE_KEY = "active_mode";
export type ActiveMode = "restricted" | "trusted";
export const DEFAULT_ACTIVE_MODE: ActiveMode = "restricted";

export const ALLOW_PAUSE_RESUME_KEY = "allow_pause_resume";
export const ALLOW_SKIP_KEY = "allow_skip";
export const ALLOW_VOLUME_KEY = "allow_volume";
export const ALLOW_REORDER_KEY = "allow_reorder";

/**
 * app_settings key for the target Spotify device, already written by
 * POST /api/device/select (backend/src/routes/device.ts). Surfaced here
 * read-only for admin visibility in GET; not accepted by PUT /settings —
 * device selection stays owned by the dedicated /api/device route.
 */
export const SPOTIFY_DEVICE_ID_KEY = "spotify_device_id";

export interface AppSettingsResponse {
  rateLimitWindowMs: number;
  explicitFilterEnabled: boolean;
  minDurationMs: number;
  maxDurationMs: number;
  activeMode: ActiveMode;
  allowPauseResume: boolean | null;
  allowSkip: boolean | null;
  allowVolume: boolean | null;
  allowReorder: boolean | null;
  spotifyDeviceId: string | null;
}

/** Partial update body accepted by PUT /api/admin/settings. */
export interface AppSettingsUpdate {
  rateLimitWindowMs?: number;
  explicitFilterEnabled?: boolean;
  minDurationMs?: number;
  maxDurationMs?: number;
  activeMode?: ActiveMode;
  allowPauseResume?: boolean | null;
  allowSkip?: boolean | null;
  allowVolume?: boolean | null;
  allowReorder?: boolean | null;
}

function parseNumberSetting(key: string, fallback: number, minExclusive: boolean): number {
  const raw = getSetting(key);
  const parsed = raw === undefined ? NaN : Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  if (minExclusive && parsed <= 0) return fallback;
  if (!minExclusive && parsed < 0) return fallback;
  return parsed;
}

function parseTristateBoolean(key: string): boolean | null {
  const raw = getSetting(key);
  if (raw === "true") return true;
  if (raw === "false") return false;
  return null;
}

function parseActiveMode(): ActiveMode {
  const raw = getSetting(ACTIVE_MODE_KEY);
  return raw === "restricted" || raw === "trusted" ? raw : DEFAULT_ACTIVE_MODE;
}

/** Reads every app_settings value covered by P3.2, applying documented defaults. */
export function getAllAppSettings(): AppSettingsResponse {
  return {
    // minExclusive: false — 0 is a valid, meaningful value (disables the rate limit).
    rateLimitWindowMs: parseNumberSetting(RATE_LIMIT_WINDOW_MS_KEY, DEFAULT_RATE_LIMIT_WINDOW_MS, false),
    explicitFilterEnabled: (getSetting(EXPLICIT_FILTER_ENABLED_KEY) ?? DEFAULT_EXPLICIT_FILTER_ENABLED) !== "false",
    minDurationMs: parseNumberSetting(MIN_DURATION_MS_KEY, DEFAULT_MIN_DURATION_MS, false),
    maxDurationMs: parseNumberSetting(MAX_DURATION_MS_KEY, DEFAULT_MAX_DURATION_MS, true),
    activeMode: parseActiveMode(),
    allowPauseResume: parseTristateBoolean(ALLOW_PAUSE_RESUME_KEY),
    allowSkip: parseTristateBoolean(ALLOW_SKIP_KEY),
    allowVolume: parseTristateBoolean(ALLOW_VOLUME_KEY),
    allowReorder: parseTristateBoolean(ALLOW_REORDER_KEY),
    spotifyDeviceId: getSetting(SPOTIFY_DEVICE_ID_KEY) ?? null,
  };
}

export interface ValidationResult {
  errors: string[];
  value: AppSettingsUpdate;
}

function isPositiveFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

function isNonNegativeFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0;
}

/**
 * Validates a raw (untyped, from req.body) partial settings update.
 * Only fields present on the input object are validated/returned; unknown
 * extra fields are silently ignored. Returns collected error messages (empty
 * = valid) plus the narrowed, typed subset of fields that were present.
 */
export function validateAppSettingsUpdate(body: unknown): ValidationResult {
  const errors: string[] = [];
  const value: AppSettingsUpdate = {};

  if (typeof body !== "object" || body === null) {
    return { errors: ["request body must be a JSON object"], value };
  }
  const b = body as Record<string, unknown>;

  if ("rateLimitWindowMs" in b) {
    // 0 is a valid, meaningful value here — it disables the rate limit
    // entirely (see getRateLimitWindowMs in rateLimiter.ts).
    if (isNonNegativeFiniteNumber(b.rateLimitWindowMs)) {
      value.rateLimitWindowMs = b.rateLimitWindowMs;
    } else {
      errors.push("rateLimitWindowMs must be a non-negative number");
    }
  }

  if ("explicitFilterEnabled" in b) {
    if (typeof b.explicitFilterEnabled === "boolean") {
      value.explicitFilterEnabled = b.explicitFilterEnabled;
    } else {
      errors.push("explicitFilterEnabled must be a boolean");
    }
  }

  if ("minDurationMs" in b) {
    if (isNonNegativeFiniteNumber(b.minDurationMs)) {
      value.minDurationMs = b.minDurationMs;
    } else {
      errors.push("minDurationMs must be a non-negative number");
    }
  }

  if ("maxDurationMs" in b) {
    if (isPositiveFiniteNumber(b.maxDurationMs)) {
      value.maxDurationMs = b.maxDurationMs;
    } else {
      errors.push("maxDurationMs must be a positive number");
    }
  }

  if (
    "minDurationMs" in b &&
    "maxDurationMs" in b &&
    isNonNegativeFiniteNumber(b.minDurationMs) &&
    isPositiveFiniteNumber(b.maxDurationMs) &&
    b.minDurationMs >= b.maxDurationMs
  ) {
    errors.push("minDurationMs must be less than maxDurationMs");
  }

  if ("activeMode" in b) {
    if (b.activeMode === "restricted" || b.activeMode === "trusted") {
      value.activeMode = b.activeMode;
    } else {
      errors.push('activeMode must be "restricted" or "trusted"');
    }
  }

  for (const field of ["allowPauseResume", "allowSkip", "allowVolume", "allowReorder"] as const) {
    if (field in b) {
      const v = b[field];
      if (typeof v === "boolean" || v === null) {
        value[field] = v;
      } else {
        errors.push(`${field} must be a boolean or null`);
      }
    }
  }

  return { errors, value };
}

/** Persists only the fields present in `update` (all fields are optional). */
export function applyAppSettingsUpdate(update: AppSettingsUpdate): void {
  if (update.rateLimitWindowMs !== undefined) {
    setSetting(RATE_LIMIT_WINDOW_MS_KEY, String(update.rateLimitWindowMs));
  }
  if (update.explicitFilterEnabled !== undefined) {
    setSetting(EXPLICIT_FILTER_ENABLED_KEY, update.explicitFilterEnabled ? "true" : "false");
  }
  if (update.minDurationMs !== undefined) {
    setSetting(MIN_DURATION_MS_KEY, String(update.minDurationMs));
  }
  if (update.maxDurationMs !== undefined) {
    setSetting(MAX_DURATION_MS_KEY, String(update.maxDurationMs));
  }
  if (update.activeMode !== undefined) {
    setSetting(ACTIVE_MODE_KEY, update.activeMode);
  }

  const overrideKeys: Array<[keyof AppSettingsUpdate, string]> = [
    ["allowPauseResume", ALLOW_PAUSE_RESUME_KEY],
    ["allowSkip", ALLOW_SKIP_KEY],
    ["allowVolume", ALLOW_VOLUME_KEY],
    ["allowReorder", ALLOW_REORDER_KEY],
  ];
  for (const [field, key] of overrideKeys) {
    const v = update[field];
    if (v === undefined) continue;
    if (v === null) {
      deleteSetting(key);
    } else {
      setSetting(key, v ? "true" : "false");
    }
  }
}

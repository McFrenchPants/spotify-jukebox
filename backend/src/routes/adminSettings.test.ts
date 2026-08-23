import { AddressInfo } from "net";
import { Server } from "http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../app";
import { db, runMigrations, setSetting } from "../db";
import {
  ACTIVE_MODE_KEY,
  ALLOW_PAUSE_RESUME_KEY,
  ALLOW_REORDER_KEY,
  ALLOW_SKIP_KEY,
  ALLOW_VOLUME_KEY,
  DEFAULT_ACTIVE_MODE,
} from "../db/appSettings";
import {
  DEFAULT_EXPLICIT_FILTER_ENABLED,
  DEFAULT_MAX_DURATION_MS,
  DEFAULT_MIN_DURATION_MS,
  EXPLICIT_FILTER_ENABLED_KEY,
  MAX_DURATION_MS_KEY,
  MIN_DURATION_MS_KEY,
} from "../guardrails/queueGuardrails";
import { DEFAULT_RATE_LIMIT_WINDOW_MS, RATE_LIMIT_WINDOW_MS_KEY } from "../guardrails/rateLimiter";

let server: Server;
let baseUrl: string;
let adminToken: string;
const ORIGINAL_ADMIN_PIN = process.env.ADMIN_PIN;

async function login(): Promise<string> {
  const res = await fetch(`${baseUrl}/api/admin/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ pin: "4321" }),
  });
  const body = (await res.json()) as { token: string };
  return body.token;
}

beforeEach(async () => {
  process.env.ADMIN_PIN = "4321";
  runMigrations();

  // The backing DB is a real shared file with no per-test reset, so
  // explicitly reset every setting this suite touches to a known state.
  db.prepare("DELETE FROM app_settings WHERE key IN (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(
    RATE_LIMIT_WINDOW_MS_KEY,
    EXPLICIT_FILTER_ENABLED_KEY,
    MIN_DURATION_MS_KEY,
    MAX_DURATION_MS_KEY,
    ACTIVE_MODE_KEY,
    ALLOW_PAUSE_RESUME_KEY,
    ALLOW_SKIP_KEY,
    ALLOW_VOLUME_KEY,
    ALLOW_REORDER_KEY
  );

  const app = createApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });

  adminToken = await login();
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  process.env.ADMIN_PIN = ORIGINAL_ADMIN_PIN;
});

describe("GET /api/admin/settings", () => {
  it("returns 401 without a valid admin token", async () => {
    const res = await fetch(`${baseUrl}/api/admin/settings`);
    expect(res.status).toBe(401);
  });

  it("returns 401 with a garbage admin token", async () => {
    const res = await fetch(`${baseUrl}/api/admin/settings`, {
      headers: { "x-admin-token": "not-a-real-token" },
    });
    expect(res.status).toBe(401);
  });

  it("returns documented defaults when nothing is set", async () => {
    const res = await fetch(`${baseUrl}/api/admin/settings`, {
      headers: { "x-admin-token": adminToken },
    });
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body).toEqual({
      rateLimitWindowMs: DEFAULT_RATE_LIMIT_WINDOW_MS,
      explicitFilterEnabled: (DEFAULT_EXPLICIT_FILTER_ENABLED as string) !== "false",
      minDurationMs: DEFAULT_MIN_DURATION_MS,
      maxDurationMs: DEFAULT_MAX_DURATION_MS,
      activeMode: DEFAULT_ACTIVE_MODE,
      allowPauseResume: null,
      allowSkip: null,
      allowVolume: null,
      allowReorder: null,
      spotifyDeviceId: null,
    });
  });

  it("reflects previously-set values", async () => {
    setSetting(RATE_LIMIT_WINDOW_MS_KEY, "60000");
    setSetting(EXPLICIT_FILTER_ENABLED_KEY, "false");
    setSetting(MIN_DURATION_MS_KEY, "30000");
    setSetting(MAX_DURATION_MS_KEY, "300000");
    setSetting(ACTIVE_MODE_KEY, "trusted");
    setSetting(ALLOW_SKIP_KEY, "false");
    setSetting("spotify_device_id", "device-123");

    const res = await fetch(`${baseUrl}/api/admin/settings`, {
      headers: { "x-admin-token": adminToken },
    });
    const body = (await res.json()) as any;

    expect(res.status).toBe(200);
    expect(body.rateLimitWindowMs).toBe(60000);
    expect(body.explicitFilterEnabled).toBe(false);
    expect(body.minDurationMs).toBe(30000);
    expect(body.maxDurationMs).toBe(300000);
    expect(body.activeMode).toBe("trusted");
    expect(body.allowSkip).toBe(false);
    expect(body.allowPauseResume).toBeNull();
    expect(body.spotifyDeviceId).toBe("device-123");
  });
});

describe("PUT /api/admin/settings", () => {
  it("returns 401 without a valid admin token", async () => {
    const res = await fetch(`${baseUrl}/api/admin/settings`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ rateLimitWindowMs: 5000 }),
    });
    expect(res.status).toBe(401);
  });

  it("updates only the fields provided, and they persist across a subsequent GET", async () => {
    const putRes = await fetch(`${baseUrl}/api/admin/settings`, {
      method: "PUT",
      headers: { "content-type": "application/json", "x-admin-token": adminToken },
      body: JSON.stringify({ rateLimitWindowMs: 120000, activeMode: "trusted" }),
    });
    const putBody = (await putRes.json()) as any;

    expect(putRes.status).toBe(200);
    expect(putBody.rateLimitWindowMs).toBe(120000);
    expect(putBody.activeMode).toBe("trusted");
    // Untouched fields keep their defaults.
    expect(putBody.minDurationMs).toBe(DEFAULT_MIN_DURATION_MS);
    expect(putBody.maxDurationMs).toBe(DEFAULT_MAX_DURATION_MS);

    const getRes = await fetch(`${baseUrl}/api/admin/settings`, {
      headers: { "x-admin-token": adminToken },
    });
    const getBody = (await getRes.json()) as any;
    expect(getBody.rateLimitWindowMs).toBe(120000);
    expect(getBody.activeMode).toBe("trusted");
  });

  it("sets and then clears an allow* override (null clears back to inherit/null)", async () => {
    const setRes = await fetch(`${baseUrl}/api/admin/settings`, {
      method: "PUT",
      headers: { "content-type": "application/json", "x-admin-token": adminToken },
      body: JSON.stringify({ allowPauseResume: true }),
    });
    expect(((await setRes.json()) as any).allowPauseResume).toBe(true);

    const clearRes = await fetch(`${baseUrl}/api/admin/settings`, {
      method: "PUT",
      headers: { "content-type": "application/json", "x-admin-token": adminToken },
      body: JSON.stringify({ allowPauseResume: null }),
    });
    const clearBody = (await clearRes.json()) as any;
    expect(clearRes.status).toBe(200);
    expect(clearBody.allowPauseResume).toBeNull();

    const getRes = await fetch(`${baseUrl}/api/admin/settings`, {
      headers: { "x-admin-token": adminToken },
    });
    expect(((await getRes.json()) as any).allowPauseResume).toBeNull();
  });

  it("rejects a non-positive rateLimitWindowMs", async () => {
    const res = await fetch(`${baseUrl}/api/admin/settings`, {
      method: "PUT",
      headers: { "content-type": "application/json", "x-admin-token": adminToken },
      body: JSON.stringify({ rateLimitWindowMs: 0 }),
    });
    const body = (await res.json()) as any;
    expect(res.status).toBe(400);
    expect(body.error).toBe("invalid_settings");
    expect(body.details.some((d: string) => /rateLimitWindowMs/.test(d))).toBe(true);
  });

  it("rejects a non-numeric minDurationMs", async () => {
    const res = await fetch(`${baseUrl}/api/admin/settings`, {
      method: "PUT",
      headers: { "content-type": "application/json", "x-admin-token": adminToken },
      body: JSON.stringify({ minDurationMs: "not-a-number" }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects a non-positive maxDurationMs", async () => {
    const res = await fetch(`${baseUrl}/api/admin/settings`, {
      method: "PUT",
      headers: { "content-type": "application/json", "x-admin-token": adminToken },
      body: JSON.stringify({ maxDurationMs: -1 }),
    });
    expect(res.status).toBe(400);
  });

  it("rejects an invalid activeMode", async () => {
    const res = await fetch(`${baseUrl}/api/admin/settings`, {
      method: "PUT",
      headers: { "content-type": "application/json", "x-admin-token": adminToken },
      body: JSON.stringify({ activeMode: "godmode" }),
    });
    const body = (await res.json()) as any;
    expect(res.status).toBe(400);
    expect(body.details.some((d: string) => /activeMode/.test(d))).toBe(true);
  });

  it("rejects an invalid allow* value", async () => {
    const res = await fetch(`${baseUrl}/api/admin/settings`, {
      method: "PUT",
      headers: { "content-type": "application/json", "x-admin-token": adminToken },
      body: JSON.stringify({ allowSkip: "yes" }),
    });
    const body = (await res.json()) as any;
    expect(res.status).toBe(400);
    expect(body.details.some((d: string) => /allowSkip/.test(d))).toBe(true);
  });

  it("does not persist any field when validation fails", async () => {
    await fetch(`${baseUrl}/api/admin/settings`, {
      method: "PUT",
      headers: { "content-type": "application/json", "x-admin-token": adminToken },
      body: JSON.stringify({ rateLimitWindowMs: 5000, activeMode: "bogus" }),
    });

    const getRes = await fetch(`${baseUrl}/api/admin/settings`, {
      headers: { "x-admin-token": adminToken },
    });
    const body = (await getRes.json()) as any;
    // Neither field should have taken effect since the request was rejected wholesale.
    expect(body.rateLimitWindowMs).toBe(DEFAULT_RATE_LIMIT_WINDOW_MS);
    expect(body.activeMode).toBe(DEFAULT_ACTIVE_MODE);
  });
});

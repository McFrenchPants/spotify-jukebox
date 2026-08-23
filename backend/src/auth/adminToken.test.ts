import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSetting, runMigrations } from "../db";
import {
  ADMIN_TOKEN_TTL_MS,
  issueAdminToken,
  verifyAdminPin,
  verifyAdminToken,
} from "./adminToken";

const ORIGINAL_ADMIN_PIN = process.env.ADMIN_PIN;

beforeEach(() => {
  process.env.ADMIN_PIN = "1234";
  runMigrations();
});

afterEach(() => {
  process.env.ADMIN_PIN = ORIGINAL_ADMIN_PIN;
  vi.useRealTimers();
});

describe("verifyAdminPin", () => {
  it("returns true for the correct PIN (lazily hashing from ADMIN_PIN on first call)", () => {
    expect(verifyAdminPin("1234")).toBe(true);
  });

  it("returns false for an incorrect PIN", () => {
    expect(verifyAdminPin("9999")).toBe(false);
  });

  it("never stores the raw PIN in app_settings", () => {
    verifyAdminPin("1234");
    const stored = getSetting("admin_pin_hash");
    expect(stored).toBeDefined();
    expect(stored).not.toContain("1234");
  });
});

describe("issueAdminToken / verifyAdminToken", () => {
  it("issues a token that verifies as valid", () => {
    const { token } = issueAdminToken();
    expect(verifyAdminToken(token)).toBe(true);
  });

  it("rejects a missing token", () => {
    expect(verifyAdminToken(undefined)).toBe(false);
    expect(verifyAdminToken(null)).toBe(false);
    expect(verifyAdminToken("")).toBe(false);
  });

  it("rejects a malformed token (no signature segment)", () => {
    expect(verifyAdminToken("not-a-valid-token")).toBe(false);
  });

  it("rejects a tampered token (payload altered after signing)", () => {
    const { token } = issueAdminToken();
    const [payloadB64, sigB64] = token.split(".");
    const tamperedPayload = Buffer.from(
      JSON.stringify({ exp: Date.now() + 999 * ADMIN_TOKEN_TTL_MS })
    ).toString("base64url");
    const tampered = `${tamperedPayload}.${sigB64}`;

    expect(tampered).not.toBe(token);
    expect(verifyAdminToken(tampered)).toBe(false);
    // sanity: original untampered token still valid with same secret
    expect(verifyAdminToken(`${payloadB64}.${sigB64}`)).toBe(true);
  });

  it("rejects a token with a tampered signature", () => {
    const { token } = issueAdminToken();
    const [payloadB64, sigB64] = token.split(".");
    const flipped = sigB64.slice(0, -1) + (sigB64.at(-1) === "A" ? "B" : "A");

    expect(verifyAdminToken(`${payloadB64}.${flipped}`)).toBe(false);
  });

  it("rejects an expired token", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date());

    const { token } = issueAdminToken();
    expect(verifyAdminToken(token)).toBe(true);

    vi.setSystemTime(new Date(Date.now() + ADMIN_TOKEN_TTL_MS + 1000));
    expect(verifyAdminToken(token)).toBe(false);
  });
});

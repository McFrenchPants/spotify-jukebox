import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isRateLimited, recordRateLimitFromResponse, resetRateLimitForTests } from "./rateLimitBackoff";
import * as logger from "../logger";

function fakeResponse(status: number, retryAfterSeconds?: number) {
  return {
    status,
    headers: {
      get: (name: string) =>
        name.toLowerCase() === "retry-after" && retryAfterSeconds !== undefined
          ? String(retryAfterSeconds)
          : null,
    },
  };
}

beforeEach(() => {
  resetRateLimitForTests();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("isRateLimited", () => {
  it("is false with no prior 429", () => {
    expect(isRateLimited()).toBe(false);
  });
});

describe("recordRateLimitFromResponse", () => {
  it("ignores non-429 responses", () => {
    expect(recordRateLimitFromResponse(fakeResponse(500))).toBe(false);
    expect(isRateLimited()).toBe(false);
  });

  it("arms the backoff window using the Retry-After header", () => {
    vi.useFakeTimers();

    expect(recordRateLimitFromResponse(fakeResponse(429, 10))).toBe(true);
    expect(isRateLimited()).toBe(true);

    vi.advanceTimersByTime(9000);
    expect(isRateLimited()).toBe(true);

    vi.advanceTimersByTime(1100);
    expect(isRateLimited()).toBe(false);
  });

  it("falls back to a default window when Retry-After is missing", () => {
    expect(recordRateLimitFromResponse(fakeResponse(429))).toBe(true);
    expect(isRateLimited()).toBe(true);
  });

  it("falls back to a default window when Retry-After is not a valid number", () => {
    const response = {
      status: 429,
      headers: { get: () => "not-a-number" },
    };
    expect(recordRateLimitFromResponse(response)).toBe(true);
    expect(isRateLimited()).toBe(true);
  });

  describe("QUOTA_EXCEEDED handling", () => {
    it("arms the long QUOTA_EXCEEDED backoff and logs distinct wording for a top-level body.reason", () => {
      vi.useFakeTimers();
      const warnSpy = vi.spyOn(logger, "logWarn");

      expect(
        recordRateLimitFromResponse(fakeResponse(429, 10), "nowPlaying poll", { reason: "QUOTA_EXCEEDED" })
      ).toBe(true);
      expect(isRateLimited()).toBe(true);

      // Ordinary 30s (or the Retry-After 10s) would have expired by now —
      // the long QUOTA_EXCEEDED window should not have.
      vi.advanceTimersByTime(60_000);
      expect(isRateLimited()).toBe(true);

      const quotaLog = warnSpy.mock.calls.find((call) => /QUOTA_EXCEEDED/.test(String(call[1])));
      expect(quotaLog).toBeDefined();
      expect(String(quotaLog?.[1])).toMatch(/nowPlaying poll/);
      expect(String(quotaLog?.[1])).toMatch(/quota/i);
    });

    it("also detects the nested body.error.reason shape", () => {
      vi.useFakeTimers();

      expect(
        recordRateLimitFromResponse(fakeResponse(429), "device list", {
          error: { status: 429, reason: "QUOTA_EXCEEDED" },
        })
      ).toBe(true);
      expect(isRateLimited()).toBe(true);

      vi.advanceTimersByTime(60_000);
      expect(isRateLimited()).toBe(true);
    });

    it("keeps ordinary Retry-After behavior unchanged for a 429 without a QUOTA_EXCEEDED reason", () => {
      vi.useFakeTimers();

      expect(
        recordRateLimitFromResponse(fakeResponse(429, 10), "device list", { error: { message: "slow down" } })
      ).toBe(true);
      expect(isRateLimited()).toBe(true);

      vi.advanceTimersByTime(11_000);
      expect(isRateLimited()).toBe(false);
    });

    it("also logs the raw body at warn level for an ordinary (non-quota) 429 with a body", () => {
      const warnSpy = vi.spyOn(logger, "logWarn");

      recordRateLimitFromResponse(fakeResponse(429, 5), "device list", { error: { message: "slow down" } });

      const bodyLog = warnSpy.mock.calls.find((call) => /slow down/.test(String(call[1])));
      expect(bodyLog).toBeDefined();
    });

    it("falls back to ordinary rate-limit handling without throwing when the body is missing/unparseable", () => {
      expect(recordRateLimitFromResponse(fakeResponse(429, 5), "device list", undefined)).toBe(true);
      expect(isRateLimited()).toBe(true);
    });

    it("does not throw when the body is present but not JSON-stringifiable", () => {
      const circular: Record<string, unknown> = {};
      circular.self = circular;

      expect(() => recordRateLimitFromResponse(fakeResponse(429, 5), "device list", circular)).not.toThrow();
      expect(isRateLimited()).toBe(true);
    });
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isRateLimited, recordRateLimitFromResponse, resetRateLimitForTests } from "./rateLimitBackoff";

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
});

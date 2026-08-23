import { AddressInfo } from "net";
import { Server } from "http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { emitEvent } from "../events/bus";
import { createApp } from "../app";

let server: Server;
let baseUrl: string;

beforeEach(async () => {
  const app = createApp();
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const { port } = server.address() as AddressInfo;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

/** Reads chunks off a fetch Response body until `predicate` matches or timeout elapses. */
async function readUntil(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  predicate: (accumulated: string) => boolean,
  timeoutMs = 2000
): Promise<string> {
  const decoder = new TextDecoder();
  let accumulated = "";
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const remaining = deadline - Date.now();
    const result = await Promise.race([
      reader.read(),
      new Promise<{ done: true; value: undefined }>((resolve) =>
        setTimeout(() => resolve({ done: true, value: undefined }), remaining)
      ),
    ]);

    if (result.value) {
      accumulated += decoder.decode(result.value, { stream: true });
    }

    if (predicate(accumulated)) {
      return accumulated;
    }

    if (result.done) {
      break;
    }
  }

  return accumulated;
}

describe("GET /api/events", () => {
  it("sets SSE headers on connect", async () => {
    const res = await fetch(`${baseUrl}/api/events`);
    expect(res.headers.get("content-type")).toMatch(/text\/event-stream/);
    expect(res.headers.get("cache-control")).toMatch(/no-cache/);
    await res.body?.cancel();
  });

  it("delivers an emitted event to a connected client within ~1s", async () => {
    const res = await fetch(`${baseUrl}/api/events`);
    const reader = res.body!.getReader();

    // Give the route a beat to subscribe before we emit.
    await new Promise((resolve) => setTimeout(resolve, 50));

    emitEvent("queue-update", { foo: "bar" });

    const accumulated = await readUntil(reader, (acc) => acc.includes("event: queue-update"));

    expect(accumulated).toContain("event: queue-update");
    expect(accumulated).toContain(`data: ${JSON.stringify({ foo: "bar" })}`);

    await reader.cancel();
  });

  it("does not deliver events to a client that already disconnected", async () => {
    const res = await fetch(`${baseUrl}/api/events`);
    const reader = res.body!.getReader();
    await reader.cancel();

    // Give the server a beat to notice the close and unsubscribe.
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Should not throw even though the subscriber disconnected.
    expect(() => emitEvent("queue-update", { foo: "baz" })).not.toThrow();
  });
});

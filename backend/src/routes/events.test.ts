import { AddressInfo } from "net";
import { Server } from "http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { emitEvent, subscribe } from "../events/bus";
import { createApp } from "../app";
import { db, runMigrations } from "../db";
import { JUKEBOX_DEVICE_CLIENT_ID_KEY, registerJukeboxDeviceId } from "../db/jukeboxDevice";
import { resetJukeboxDeviceOnlineForTests } from "../events/jukeboxDeviceOnline";

let server: Server;
let baseUrl: string;

beforeEach(async () => {
  runMigrations();
  db.prepare("DELETE FROM app_settings WHERE key = ?").run(JUKEBOX_DEVICE_CLIENT_ID_KEY);
  resetJukeboxDeviceOnlineForTests();

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

  it("connecting without ?clientId triggers no jukebox-device-status tracking", async () => {
    registerJukeboxDeviceId("device-abc");
    const received: unknown[] = [];
    const unsubscribe = subscribe((event) => {
      if (event.name === "jukebox-device-status") received.push(event.data);
    });

    const res = await fetch(`${baseUrl}/api/events`);
    await new Promise((resolve) => setTimeout(resolve, 50));
    await res.body?.cancel();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(received).toEqual([]);
    unsubscribe();
  });

  it("connecting with ?clientId matching the registered Jukebox device emits jukebox-device-status online: true", async () => {
    registerJukeboxDeviceId("device-abc");
    const received: unknown[] = [];
    const unsubscribe = subscribe((event) => {
      if (event.name === "jukebox-device-status") received.push(event.data);
    });

    const res = await fetch(`${baseUrl}/api/events?clientId=device-abc`);
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(received).toEqual([{ online: true }]);

    await res.body?.cancel();
    unsubscribe();
  });

  it("disconnecting the registered Jukebox device's clientId emits jukebox-device-status online: false", async () => {
    registerJukeboxDeviceId("device-abc");
    const res = await fetch(`${baseUrl}/api/events?clientId=device-abc`);
    await new Promise((resolve) => setTimeout(resolve, 50));

    const received: unknown[] = [];
    const unsubscribe = subscribe((event) => {
      if (event.name === "jukebox-device-status") received.push(event.data);
    });

    await res.body?.cancel();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(received).toEqual([{ online: false }]);
    unsubscribe();
  });

  it("a clientId that doesn't match the registered Jukebox device never triggers jukebox-device-status", async () => {
    registerJukeboxDeviceId("device-abc");
    const received: unknown[] = [];
    const unsubscribe = subscribe((event) => {
      if (event.name === "jukebox-device-status") received.push(event.data);
    });

    const res = await fetch(`${baseUrl}/api/events?clientId=guest-tab-1`);
    await new Promise((resolve) => setTimeout(resolve, 50));
    await res.body?.cancel();
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(received).toEqual([]);
    unsubscribe();
  });
});

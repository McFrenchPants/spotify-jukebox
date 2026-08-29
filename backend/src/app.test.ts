import { AddressInfo } from "net";
import { Server } from "http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "./app";
import { runMigrations } from "./db";

let server: Server;
let baseUrl: string;
const ORIGINAL_ADMIN_PIN = process.env.ADMIN_PIN;

beforeEach(async () => {
  process.env.ADMIN_PIN = "4321";
  runMigrations();
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
  process.env.ADMIN_PIN = ORIGINAL_ADMIN_PIN;
});

describe("global CORS handling", () => {
  it("responds 204 to an OPTIONS preflight on a protected admin route with the expected CORS headers", async () => {
    const res = await fetch(`${baseUrl}/api/admin/settings`, {
      method: "OPTIONS",
      headers: {
        Origin: "capacitor://localhost",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "x-admin-token",
      },
    });

    expect(res.status).toBe(204);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(res.headers.get("access-control-allow-methods")).toContain("GET");
    expect(res.headers.get("access-control-allow-methods")).toContain("OPTIONS");
    expect(res.headers.get("access-control-allow-headers")).toContain("x-admin-token");
  });

  it("still carries Access-Control-Allow-Origin on a normal GET request", async () => {
    const res = await fetch(`${baseUrl}/api/health`, { method: "GET" });

    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("still carries Access-Control-Allow-Origin on a normal POST request", async () => {
    const res = await fetch(`${baseUrl}/api/admin/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pin: "4321" }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
  });
});

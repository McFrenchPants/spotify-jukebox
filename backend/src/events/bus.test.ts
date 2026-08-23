import { describe, expect, it } from "vitest";
import { emitEvent, subscribe } from "./bus";

describe("event bus", () => {
  it("delivers emitted events to subscribed listeners", () => {
    const received: Array<{ name: string; data: unknown }> = [];
    const unsubscribe = subscribe((event) => received.push(event));

    emitEvent("queue-update", { foo: "bar" });

    expect(received).toEqual([{ name: "queue-update", data: { foo: "bar" } }]);

    unsubscribe();
  });

  it("stops delivering events after unsubscribe", () => {
    const received: Array<{ name: string; data: unknown }> = [];
    const unsubscribe = subscribe((event) => received.push(event));

    unsubscribe();
    emitEvent("queue-update", { foo: "baz" });

    expect(received).toEqual([]);
  });

  it("delivers to multiple independent subscribers", () => {
    const receivedA: unknown[] = [];
    const receivedB: unknown[] = [];
    const unsubA = subscribe((event) => receivedA.push(event));
    const unsubB = subscribe((event) => receivedB.push(event));

    emitEvent("leaderboard-update", { rank: 1 });

    expect(receivedA).toHaveLength(1);
    expect(receivedB).toHaveLength(1);

    unsubA();
    unsubB();
  });
});

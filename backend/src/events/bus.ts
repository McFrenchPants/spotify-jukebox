import { EventEmitter } from "events";

/**
 * Generic in-process pub/sub bus for server-sent events.
 *
 * This module is intentionally domain-agnostic: it knows nothing about
 * queues, leaderboards, or now-playing state. Callers emit named events with
 * a JSON-serializable payload via `emitEvent`, and the SSE route (or any
 * other in-process listener) subscribes via `subscribe`.
 */

const emitter = new EventEmitter();

// Many SSE connections may subscribe concurrently (one listener per
// connected client); raise the default cap so Node doesn't warn about a
// "possible EventEmitter memory leak" under normal usage.
emitter.setMaxListeners(0);

export const EVENT_CHANNEL = "event";

export interface BusEvent {
  name: string;
  data: unknown;
}

/** Emits a named event with a JSON-serializable payload to all subscribers. */
export function emitEvent(eventName: string, data: unknown): void {
  emitter.emit(EVENT_CHANNEL, { name: eventName, data } satisfies BusEvent);
}

/**
 * Subscribes to all events emitted via `emitEvent`. Returns an unsubscribe
 * function that must be called (e.g. on client disconnect) to avoid leaking
 * listeners.
 */
export function subscribe(listener: (event: BusEvent) => void): () => void {
  emitter.on(EVENT_CHANNEL, listener);
  return () => {
    emitter.off(EVENT_CHANNEL, listener);
  };
}

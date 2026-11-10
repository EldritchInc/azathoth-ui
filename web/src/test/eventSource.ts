/**
 * A stand-in for the browser's `EventSource`, which jsdom lacks: each one
 * made is kept, so a test can send it the events a server would.
 */

import { vi } from "vitest";

type Listener = (event: Event) => void;

/** An event stream a test sends events on by hand. */
export class FakeEventSource {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSED = 2;

  /** Every stream opened since `stubEventSource`, oldest first. */
  static opened: FakeEventSource[] = [];

  readonly url: string;
  readyState: number = FakeEventSource.OPEN;
  private readonly listeners = new Map<string, Listener[]>();

  constructor(url: string) {
    this.url = url;
    FakeEventSource.opened.push(this);
  }

  addEventListener(type: string, listener: Listener): void {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }

  close(): void {
    this.readyState = FakeEventSource.CLOSED;
  }

  /** Sends one event, its data as JSON, numbered `id` when it has one. */
  emit(type: string, data: unknown, id = ""): void {
    const event = new MessageEvent(type, { data: JSON.stringify(data), lastEventId: id });

    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
    }
  }

  /** Loses the stream for good, as a browser does when the server refuses it. */
  fail(): void {
    this.readyState = FakeEventSource.CLOSED;

    for (const listener of this.listeners.get("error") ?? []) {
      listener(new Event("error"));
    }
  }
}

/** Puts the stand-in in place of `EventSource`, with no stream opened yet. */
export function stubEventSource(): void {
  FakeEventSource.opened = [];
  vi.stubGlobal("EventSource", FakeEventSource);
}

/** Returns the stream opened last. */
export function lastStream(): FakeEventSource {
  const last = FakeEventSource.opened.at(-1);

  if (last === undefined) {
    throw new Error("No event stream was opened.");
  }
  return last;
}

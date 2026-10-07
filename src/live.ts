// Live arrival and presence, held in this process's memory only. fly.toml
// runs exactly one machine, so every open page is connected to this process
// and an in-process broadcast reaches all of them; a second machine would
// need shared pub/sub (README.md, "Multi-user, for now").
import type { ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import type { Mark } from "./db.ts";

// A hand is a bearer token: anyone who learns another browser's hand can
// copy it into their own cookie and pass as that browser. So it never
// leaves the server — every stroke a client sees says only whether it
// belongs to the reader asking.
export interface PublicMark {
  id: number;
  note: string;
  color: string;
  createdAt: string;
  yours: boolean;
}

export function toPublic(mark: Mark, reader: string | null): PublicMark {
  return {
    id: mark.id,
    note: mark.note,
    color: mark.color,
    createdAt: mark.createdAt,
    yours: reader !== null && mark.hand === reader,
  };
}

interface Stream {
  res: ServerResponse;
  hand: string | null;
}

const streams = new Set<Stream>();

// Presence is distinct hands, not connections: every stream is filed under
// its hand, and a hand counts while it has at least one stream open, so two
// tabs in one browser are one hand. A stream with no valid hand (cookies
// blocked) is its own key, since it can't be matched to anyone.
const openPerHand = new Map<string, number>();

export function handsHere(): number {
  return openPerHand.size;
}

function send(res: ServerResponse, event: string, data: unknown): void {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

function broadcastPresence(): void {
  for (const s of streams) send(s.res, "presence", { hands: handsHere() });
}

// Returns the detach function the caller runs when the connection closes.
export function attach(res: ServerResponse, hand: string | null): () => void {
  const stream: Stream = { res, hand };
  const key = hand ?? `anonymous:${randomUUID()}`;
  streams.add(stream);
  const before = openPerHand.get(key) ?? 0;
  openPerHand.set(key, before + 1);

  // EventSource waits this long before its own automatic reconnect.
  res.write("retry: 2000\n\n");
  if (before === 0) broadcastPresence();
  else send(res, "presence", { hands: handsHere() });

  let detached = false;
  return () => {
    if (detached) return;
    detached = true;
    streams.delete(stream);
    const left = (openPerHand.get(key) ?? 1) - 1;
    if (left > 0) {
      openPerHand.set(key, left);
    } else {
      openPerHand.delete(key);
      broadcastPresence();
    }
  };
}

// Each connection gets its own copy, so yours is true only for the streams
// whose cookie made the stroke, and the stored hand is never on the wire.
export function broadcastMark(mark: Mark): void {
  for (const s of streams) send(s.res, "mark", toPublic(mark, s.hand));
}

// Fly's proxy and some networks close a connection that's silent for too
// long; an SSE comment line keeps it open without the client seeing an event.
setInterval(() => {
  for (const s of streams) s.res.write(": keepalive\n\n");
}, 20_000).unref();

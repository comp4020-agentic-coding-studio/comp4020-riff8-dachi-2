import { randomUUID } from "node:crypto";
import { expect, inject, it } from "vitest";

// /api/stream is what makes the scroll live: every open page holds one, and
// the server pushes each newly stored stroke and the presence count down it.
// These tests read the stream the way EventSource does, and wait on the
// event they expect rather than sleeping, failing if it never arrives.
const baseUrl = inject("baseUrl");

interface StreamEvent {
  event: string;
  data: string;
}

interface Stream {
  raw: () => string;
  next: (event: string, match?: (data: any) => boolean, timeoutMs?: number) => Promise<any>;
  close: () => void;
}

async function openStream(cookie?: string): Promise<Stream> {
  const controller = new AbortController();
  const res = await fetch(new URL("/api/stream", baseUrl), {
    headers: cookie ? { cookie } : {},
    signal: controller.signal,
  });
  expect(res.status).toBe(200);
  expect(res.headers.get("content-type")).toMatch(/^text\/event-stream/);

  const events: StreamEvent[] = [];
  const waiters: Array<() => void> = [];
  let raw = "";
  let buffer = "";
  (async () => {
    const decoder = new TextDecoder();
    try {
      for await (const chunk of res.body!) {
        const text = decoder.decode(chunk, { stream: true });
        raw += text;
        buffer += text;
        let end: number;
        while ((end = buffer.indexOf("\n\n")) !== -1) {
          const block = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          let event = "message";
          const data: string[] = [];
          for (const line of block.split("\n")) {
            if (line.startsWith("event: ")) event = line.slice(7);
            else if (line.startsWith("data: ")) data.push(line.slice(6));
          }
          if (data.length > 0) events.push({ event, data: data.join("\n") });
        }
        waiters.splice(0).forEach((wake) => wake());
      }
    } catch {
      // aborted by close()
    }
  })();

  let seen = 0;
  return {
    raw: () => raw,
    close: () => controller.abort(),
    async next(event, match = () => true, timeoutMs = 3000) {
      const deadline = Date.now() + timeoutMs;
      for (;;) {
        while (seen < events.length) {
          const e = events[seen++];
          if (e.event !== event) continue;
          const data = JSON.parse(e.data);
          if (match(data)) return data;
        }
        const left = deadline - Date.now();
        if (left <= 0) throw new Error(`no "${event}" event arrived within ${timeoutMs}ms`);
        await new Promise<void>((resolve) => {
          const timer = setTimeout(resolve, left);
          waiters.push(() => {
            clearTimeout(timer);
            resolve();
          });
        });
      }
    },
  };
}

async function post(note: string, cookie?: string): Promise<{ mark: any; cookie: string }> {
  const res = await fetch(new URL("/api/marks", baseUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: baseUrl,
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify({ color: "#3a5a6b", note }),
  });
  expect(res.status).toBe(201);
  return {
    mark: (await res.json()).mark,
    cookie: cookie ?? res.headers.get("set-cookie")!.split(";")[0],
  };
}

async function newHand(): Promise<string> {
  const res = await fetch(new URL("/api/marks", baseUrl));
  return res.headers.get("set-cookie")!.split(";")[0];
}

it("pushes a newly stored stroke to every open stream, yours only to its own hand", async () => {
  const author = await newHand();
  const watcher = await newHand();
  const authorStream = await openStream(author);
  const watcherStream = await openStream(watcher);
  try {
    const note = `stream test ${randomUUID()}`;
    const { mark } = await post(note, author);

    const toAuthor = await authorStream.next("mark", (m) => m.note === note);
    const toWatcher = await watcherStream.next("mark", (m) => m.note === note);
    expect(toAuthor).toEqual({ ...mark, yours: true });
    expect(toWatcher).toEqual({ ...mark, yours: false });
  } finally {
    authorStream.close();
    watcherStream.close();
  }
});

it("never sends a hand down the stream, in any form", async () => {
  const author = await newHand();
  const hand = author.split("=")[1];
  const own = await openStream(author);
  const other = await openStream(await newHand());
  try {
    const note = `stream privacy ${randomUUID()}`;
    await post(note, author);
    for (const stream of [own, other]) {
      const mark = await stream.next("mark", (m) => m.note === note);
      expect(mark).not.toHaveProperty("hand");
      expect(typeof mark.yours).toBe("boolean");
      expect(stream.raw()).not.toContain(hand);
    }
  } finally {
    own.close();
    other.close();
  }
});

it("counts distinct hands present, not open streams", async () => {
  const a = await newHand();
  const b = await newHand();

  const a1 = await openStream(a);
  const base = (await a1.next("presence")).hands;
  const a2 = await openStream(a);
  // a second tab for the same hand gets the count, unchanged
  expect((await a2.next("presence")).hands).toBe(base);

  const b1 = await openStream(b);
  expect((await a1.next("presence", (p) => p.hands === base + 1)).hands).toBe(base + 1);

  // closing one of hand a's two tabs leaves a still present...
  a2.close();
  b1.close();
  expect((await a1.next("presence", (p) => p.hands === base)).hands).toBe(base);

  // ...and hand b's leaving is what brought the count back down
  const b2 = await openStream(b);
  expect((await b2.next("presence")).hands).toBe(base + 1);
  b2.close();
  a1.close();
});

it("accepts no writes on the stream", async () => {
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    const res = await fetch(new URL("/api/stream", baseUrl), {
      method,
      headers: { "content-type": "application/json", origin: baseUrl },
      body: JSON.stringify({ color: "#2b2118", note: "via the stream" }),
    });
    expect(res.ok, `${method} /api/stream answered ${res.status}`).toBe(false);
  }
  const { marks } = await (await fetch(new URL("/api/marks", baseUrl))).json();
  expect(marks.some((m: { note: string }) => m.note === "via the stream")).toBe(false);
});

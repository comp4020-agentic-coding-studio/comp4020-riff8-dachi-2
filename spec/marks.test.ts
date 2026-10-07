import { connect } from "node:net";
import { expect, inject, it } from "vitest";

// The two things spec/invariants.test.ts already checks (/ answers, /readme/
// publishes README.md) aren't repeated here. Everything below is what
// CLAUDE.md commits this app to on top of that: a request that isn't the
// form can send anything, so the server, not the browser, is what these
// tests hold to account.
const baseUrl = inject("baseUrl");

function firstCookie(res: Response): string | undefined {
  return res.headers.get("set-cookie")?.split(";")[0];
}

// The server rejects a POST whose Origin doesn't match its own host (see
// src/server.ts's isSameOrigin), the same way a real browser's own Origin
// header would on every one of these calls. Every test below that posts
// opts into that match explicitly, the same way crit 7's own spec learned
// to for an equivalent same-origin check.
function postHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { "content-type": "application/json", origin: baseUrl, ...extra };
}

it("rejects a colour outside the six the palette offers", async () => {
  const res = await fetch(new URL("/api/marks", baseUrl), {
    method: "POST",
    headers: postHeaders(),
    body: JSON.stringify({ color: "#ff00ff", note: "not on the palette" }),
  });
  expect(res.status).toBe(422);
  expect((await res.json()).error).toBe("unknown-color");
});

it("rejects a note over 140 characters even though the input's own maxlength would stop it", async () => {
  const res = await fetch(new URL("/api/marks", baseUrl), {
    method: "POST",
    headers: postHeaders(),
    body: JSON.stringify({ color: "#2b2118", note: "x".repeat(141) }),
  });
  expect(res.status).toBe(422);
  expect((await res.json()).error).toBe("note-too-long");
});

it("rejects a body larger than the server's own cap, before it ever reaches validation", async () => {
  const res = await fetch(new URL("/api/marks", baseUrl), {
    method: "POST",
    headers: postHeaders(),
    body: JSON.stringify({ color: "#2b2118", note: "x".repeat(20_000) }),
  });
  expect(res.status).toBe(413);
});

it("rejects a malformed JSON body without crashing the server", async () => {
  const res = await fetch(new URL("/api/marks", baseUrl), {
    method: "POST",
    headers: postHeaders(),
    body: "not json",
  });
  expect(res.status).toBe(400);

  // the same process still answers the next request
  const health = await fetch(new URL("/", baseUrl));
  expect(health.status).toBe(200);
});

it("adds a valid stroke, and a fresh read of the scroll includes it", async () => {
  const note = `crit-8 spec run ${Date.now()}`;
  const post = await fetch(new URL("/api/marks", baseUrl), {
    method: "POST",
    headers: postHeaders(),
    body: JSON.stringify({ color: "#3f5d40", note }),
  });
  expect(post.status).toBe(201);
  const created = (await post.json()).mark;
  expect(created.note).toBe(note);
  expect(created.color).toBe("#3f5d40");

  const list = await fetch(new URL("/api/marks", baseUrl));
  const { marks } = await list.json();
  expect(marks.some((m: { id: number }) => m.id === created.id)).toBe(true);
});

it("remembers a hand across requests, and a returning hand can see its own past strokes", async () => {
  const first = await fetch(new URL("/api/marks", baseUrl), {
    method: "POST",
    headers: postHeaders(),
    body: JSON.stringify({ color: "#3a5a6b", note: "first visit" }),
  });
  const cookie = firstCookie(first);
  expect(cookie, "no hand cookie was set on first contact").toBeTruthy();
  const created = (await first.json()).mark;
  expect(created.yours).toBe(true);

  // a second request from the same hand, cookie carried by hand this time
  const returned = await fetch(new URL("/api/marks", baseUrl), {
    headers: { cookie: cookie! },
  });
  const { marks } = await returned.json();
  expect(marks.find((m: { id: number }) => m.id === created.id)?.yours).toBe(true);

  // and the same stroke, read by anyone else, is not theirs
  const stranger = await (await fetch(new URL("/api/marks", baseUrl))).json();
  expect(stranger.marks.find((m: { id: number }) => m.id === created.id)?.yours).toBe(false);
});

// A hand is a bearer token: a client that could read another browser's hand
// could copy it into its own cookie and pass as them. Ownership travels only
// as a per-reader boolean.
it("never sends a hand to any client, only a per-reader yours flag", async () => {
  const post = await fetch(new URL("/api/marks", baseUrl), {
    method: "POST",
    headers: postHeaders(),
    body: JSON.stringify({ color: "#5b4636", note: "no hand on the wire" }),
  });
  const cookie = firstCookie(post)!;
  const hand = cookie.split("=")[1];
  const postText = await post.text();
  expect(postText).not.toContain(hand);
  expect(JSON.parse(postText).mark).not.toHaveProperty("hand");

  for (const headers of [{}, { cookie }] as Record<string, string>[]) {
    const text = await (await fetch(new URL("/api/marks", baseUrl), { headers })).text();
    expect(text).not.toContain(hand);
    const body = JSON.parse(text);
    expect(body).not.toHaveProperty("you");
    for (const mark of body.marks) {
      expect(mark).not.toHaveProperty("hand");
      expect(typeof mark.yours).toBe("boolean");
    }
  }
});

it("treats a malformed percent-encoded hand cookie as no hand, not a 500", async () => {
  const res = await fetch(new URL("/api/marks", baseUrl), {
    headers: { cookie: "hand=%zz" },
  });
  expect(res.status).toBe(200);
  const { marks } = await res.json();
  expect(marks.every((m: { yours: boolean }) => m.yours === false)).toBe(true);
});

it("treats an oversized hand cookie as no hand, not a stored value, and mints a fresh one", async () => {
  const oversized = "a".repeat(5000);
  const res = await fetch(new URL("/api/marks", baseUrl), {
    method: "POST",
    headers: postHeaders({ cookie: `hand=${oversized}` }),
    body: JSON.stringify({ color: "#8a6d3b", note: "oversized hand probe" }),
  });
  expect(res.status).toBe(201);
  const created = (await res.json()).mark;

  const cookie = firstCookie(res);
  expect(cookie, "a fresh hand cookie should be issued when the supplied one is invalid").toBeTruthy();
  expect(cookie!.length).toBeLessThan(oversized.length);

  // the stroke belongs to the freshly minted hand, not the oversized one
  const asFresh = await (await fetch(new URL("/api/marks", baseUrl), { headers: { cookie: cookie! } })).json();
  expect(asFresh.marks.find((m: { id: number }) => m.id === created.id)?.yours).toBe(true);
});

it("rejects a cross-site POST even when every field is otherwise valid", async () => {
  const res = await fetch(new URL("/api/marks", baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json", origin: "https://attacker.example" },
    body: JSON.stringify({ color: "#2b2118", note: "drive-by" }),
  });
  expect(res.status).toBe(403);

  const list = await fetch(new URL("/api/marks", baseUrl));
  const { marks } = await list.json();
  expect(marks.some((m: { note: string }) => m.note === "drive-by")).toBe(false);
});

it("rejects a POST with no Origin header at all, the same as a mismatched one", async () => {
  const res = await fetch(new URL("/api/marks", baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ color: "#2b2118", note: "no origin header" }),
  });
  expect(res.status).toBe(403);
});

it("survives a client that vanishes mid-upload, not just an oversized one", async () => {
  // Distinct from the oversized-body test above: that one sends a complete,
  // over-cap request and gets a clean 413. This one never finishes sending —
  // a client whose connection drops mid-body (a flaky network, a closed tab)
  // hits a different branch of src/server.ts's readBody (the socket's own
  // "error" event, not the size-cap check), which no existing test reached.
  const { hostname, port } = new URL(baseUrl);
  await new Promise<void>((resolve, reject) => {
    const socket = connect(Number(port) || 80, hostname, () => {
      socket.write(
        `POST /api/marks HTTP/1.1\r\n` +
          `Host: ${hostname}:${port}\r\n` +
          `Origin: ${baseUrl}\r\n` +
          `Content-Type: application/json\r\n` +
          `Content-Length: 5000\r\n` +
          `Connection: close\r\n\r\n` +
          `{"color":"#2b2118","note":"`,
      );
      // Never send the rest: reset the connection instead of a graceful FIN.
      socket.resetAndDestroy();
    });
    socket.on("close", () => resolve());
    socket.on("error", reject);
  });

  const health = await fetch(new URL("/", baseUrl));
  expect(health.status).toBe(200);
});

it("refuses to be framed, on every response, not just the API", async () => {
  // A forged Origin is already rejected above; framing is a different attack
  // — a genuine request, with a genuine visitor's own cookie, that they were
  // tricked into making by a page overlaying the real UI inside an iframe.
  for (const path of ["/", "/readme/", "/api/marks"]) {
    const res = await fetch(new URL(path, baseUrl));
    expect(res.headers.get("x-frame-options"), `${path} is missing x-frame-options`).toBe("DENY");
    expect(
      res.headers.get("content-security-policy"),
      `${path} is missing a frame-ancestors CSP`,
    ).toBe("frame-ancestors 'none'");
  }
});

it("sets nosniff and no-referrer on every response, not just the frame headers", async () => {
  for (const path of ["/", "/readme/", "/api/marks"]) {
    const res = await fetch(new URL(path, baseUrl));
    expect(res.headers.get("x-content-type-options"), `${path} is missing nosniff`).toBe(
      "nosniff",
    );
    expect(res.headers.get("referrer-policy"), `${path} is missing a referrer-policy`).toBe(
      "no-referrer",
    );
  }
});

it("answers 404 for a route that isn't part of the app", async () => {
  const res = await fetch(new URL("/not-a-real-route", baseUrl));
  expect(res.status).toBe(404);
});

// CLAUDE.md's first rule: a stored stroke is never edited or deleted. Today
// that holds only because no route handles any other method, so a future
// route added carelessly is exactly what this test exists to catch.
it("refuses to edit or delete a stored stroke, by any method, from the stroke's own hand", async () => {
  const note = `append-only check ${Date.now()}`;
  const post = await fetch(new URL("/api/marks", baseUrl), {
    method: "POST",
    headers: postHeaders(),
    body: JSON.stringify({ color: "#7a3b3b", note }),
  });
  const cookie = firstCookie(post)!;
  const created = (await post.json()).mark;

  for (const path of ["/api/marks", `/api/marks/${created.id}`]) {
    for (const method of ["PUT", "PATCH", "DELETE"]) {
      const res = await fetch(new URL(path, baseUrl), {
        method,
        headers: postHeaders({ cookie }),
        body: JSON.stringify({ id: created.id, color: "#2b2118", note: "rewritten" }),
      });
      expect(res.ok, `${method} ${path} answered ${res.status}`).toBe(false);
    }
  }

  const { marks } = await (
    await fetch(new URL("/api/marks", baseUrl), { headers: { cookie } })
  ).json();
  expect(marks.find((m: { id: number }) => m.id === created.id)).toEqual(created);
});

// A hand is minted by the server and carried only in its cookie: a body that
// names its own hand, id or timestamp can't use them to pass a stroke off as
// someone else's, or slot it anywhere but the end of the scroll.
it("ignores a hand, id or timestamp a request body tries to set for itself", async () => {
  // someone else's hand, learned the only way a test can: from their cookie
  const other = await fetch(new URL("/api/marks", baseUrl), {
    method: "POST",
    headers: postHeaders(),
    body: JSON.stringify({ color: "#2b2118", note: "someone else" }),
  });
  const otherCookie = firstCookie(other)!;
  const someoneElse = otherCookie.split("=")[1];
  const before = (await (await fetch(new URL("/api/marks", baseUrl))).json()).marks;

  const res = await fetch(new URL("/api/marks", baseUrl), {
    method: "POST",
    headers: postHeaders(),
    body: JSON.stringify({
      color: "#8a6d3b",
      note: "forged fields",
      hand: someoneElse,
      id: before[0].id,
      createdAt: "1269-01-01T00:00:00.000Z",
    }),
  });
  expect(res.status).toBe(201);
  const created = (await res.json()).mark;
  const ownCookie = firstCookie(res)!;
  expect(ownCookie).not.toBe(otherCookie);
  expect(created.id).toBeGreaterThan(Math.max(...before.map((m: { id: number }) => m.id)));
  expect(created.createdAt).not.toBe("1269-01-01T00:00:00.000Z");

  const read = async (cookie: string) =>
    (await (await fetch(new URL("/api/marks", baseUrl), { headers: { cookie } })).json()).marks.find(
      (m: { id: number }) => m.id === created.id,
    );
  expect((await read(otherCookie)).yours).toBe(false);
  expect((await read(ownCookie)).yours).toBe(true);
});

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { addMark, listMarks } from "./db.ts";
import { attach, broadcastMark, toPublic } from "./live.ts";
import { validateMark } from "./marks.ts";
import { renderReadme } from "./readme.ts";

const PORT = Number(process.env.PORT ?? 8080);
const PUBLIC_DIR = new URL("../public/", import.meta.url);

// A hand-rolled cap, not framework config, but the same lesson: a 256MB
// machine has no defence against a body an order of magnitude past what the
// form itself ever sends (a note plus a color is well under 1KB).
const MAX_BODY_BYTES = 8 * 1024;

// A hand is only ever an identity token, never content — but the cookie it
// rides in is exactly as client-controlled as any body field, and unlike the
// note it had no cap at all: a request that isn't the form could set a
// multi-kilobyte "hand" that then sits in the append-only store forever,
// once per request, with no edit or delete path to ever remove it. The only
// shape a hand should ever take is the one this server itself mints below.
const HAND_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidHand(value: string | undefined): value is string {
  return typeof value === "string" && HAND_PATTERN.test(value);
}

// A cross-site page can make a visitor's browser submit a POST without the
// visitor ever meaning to — a hidden auto-submitting <form
// enctype="text/plain"> lands raw JSON in the body despite the form's own
// Content-Type, and this server never checked the Content-Type header
// anyway, so nothing above stopped it. Confirmed live: such a page added a
// mark with no user interaction at all. Into a store with no edit or delete
// path, every such write is permanent, so every browser's own Origin header
// (sent on every unsafe-method request, same-origin or not, and never
// settable by page script) is checked against this request's own host.
function isSameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (typeof origin !== "string") return false;
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    const key = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (!key) continue;
    // A cookie header is client-supplied input like any other: malformed
    // percent-encoding must degrade to "no hand", not throw and 500 the
    // whole request.
    try {
      out[key] = decodeURIComponent(value);
    } catch {
      continue;
    }
  }
  return out;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let rejected = false;
    // Reject on an oversized body, but don't destroy the socket here: that
    // would drop the connection before the 413 response below ever reaches
    // the client. The caller destroys it, after writing that response.
    req.on("data", (chunk: Buffer) => {
      if (rejected) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        rejected = true;
        reject(new Error("body too large"));
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!rejected) resolve(Buffer.concat(chunks).toString("utf8"));
    });
    req.on("error", reject);
  });
}

// Reads the request's hand, or mints a fresh one and adds the set-cookie
// that carries it. Minted on the first read, not just the first write, so a
// visitor who has only looked can still be counted as one hand on the stream.
function handFor(req: IncomingMessage, headers: Record<string, string>): string {
  const cookies = parseCookies(req.headers.cookie);
  if (isValidHand(cookies.hand)) return cookies.hand;
  const hand = randomUUID();
  const fiveYears = 60 * 60 * 24 * 365 * 5;
  // HttpOnly: no script on this page ever reads document.cookie, so
  // there's no reason a hand — a five-year bearer token for a store
  // with no delete path — should be exposed to one. Secure: fly.toml
  // forces https, so the browser never has an http origin to send it
  // from anyway.
  headers["set-cookie"] = `hand=${hand}; Path=/; Max-Age=${fiveYears}; SameSite=Lax; HttpOnly; Secure`;
  return hand;
}

async function serveStatic(res: ServerResponse, filename: string, contentType: string) {
  const data = await readFile(new URL(filename, PUBLIC_DIR));
  res.writeHead(200, { "content-type": `${contentType}; charset=utf-8` });
  res.end(data);
}

const server = createServer(async (req, res) => {
  try {
    // Cross-origin JS can't read a framed page's content, but it can still
    // render it under an attacker's own layout and trick a real visitor into
    // clicking "Add to the scroll" believing they're clicking something
    // else — confirmed live by embedding this app in a plain cross-origin
    // iframe with no defence of any kind in place. The Origin check above
    // guards a forged request; it does nothing for a genuine one a visitor
    // was tricked into making with their own real hand cookie, into a store
    // with no edit or delete path. This app never needs to be framed by
    // anything, so refuse it outright, both ways browsers check for it.
    res.setHeader("x-frame-options", "DENY");
    res.setHeader("content-security-policy", "frame-ancestors 'none'");
    // Every response already sets its own content-type explicitly, but
    // nosniff is a one-line guard against a browser second-guessing it (MIME
    // sniffing a response into a type it was never served as) at zero cost
    // here. Referrer-Policy matters because this page links out (the source
    // repo, the README's own cited essays): without it, a click carries this
    // app's full URL as the Referer header to whatever site a visitor lands
    // on next. Neither URL is secret, but there's no reason to send it either.
    res.setHeader("x-content-type-options", "nosniff");
    res.setHeader("referrer-policy", "no-referrer");

    const url = new URL(req.url ?? "/", "http://localhost");

    if (req.method === "GET" && url.pathname === "/") {
      await serveStatic(res, "index.html", "text/html");
      return;
    }
    if (req.method === "GET" && url.pathname === "/app.js") {
      await serveStatic(res, "app.js", "text/javascript");
      return;
    }
    if (req.method === "GET" && url.pathname === "/style.css") {
      await serveStatic(res, "style.css", "text/css");
      return;
    }
    if (req.method === "GET" && (url.pathname === "/readme" || url.pathname === "/readme/")) {
      const html = await renderReadme();
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(html);
      return;
    }
    if (req.method === "GET" && url.pathname === "/api/marks") {
      const headers: Record<string, string> = { "content-type": "application/json" };
      const reader = handFor(req, headers);
      res.writeHead(200, headers);
      res.end(JSON.stringify({ marks: listMarks().map((m) => toPublic(m, reader)) }));
      return;
    }
    // Read-only: it pushes each newly stored stroke and the presence count,
    // and no method on it writes anything. Writes stay on the same-origin
    // POST below.
    if (req.method === "GET" && url.pathname === "/api/stream") {
      const cookies = parseCookies(req.headers.cookie);
      const reader = isValidHand(cookies.hand) ? cookies.hand : null;
      res.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
      });
      const detach = attach(res, reader);
      req.on("close", detach);
      res.on("close", detach);
      return;
    }
    if (req.method === "POST" && url.pathname === "/api/marks") {
      if (!isSameOrigin(req)) {
        res.writeHead(403, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: "cross-site-request" }));
        return;
      }

      const headers: Record<string, string> = {};
      const hand = handFor(req, headers);

      let body: string;
      try {
        body = await readBody(req);
      } catch {
        res.writeHead(413, { ...headers, connection: "close" });
        res.end();
        req.destroy();
        return;
      }

      let payload: unknown;
      try {
        payload = JSON.parse(body);
      } catch {
        res.writeHead(400, { ...headers, "content-type": "application/json" });
        res.end(JSON.stringify({ error: "bad-json" }));
        return;
      }
      if (typeof payload !== "object" || payload === null) {
        res.writeHead(400, { ...headers, "content-type": "application/json" });
        res.end(JSON.stringify({ error: "bad-json" }));
        return;
      }

      const validated = validateMark(payload as Record<string, unknown>);
      if (!validated.ok) {
        res.writeHead(422, { ...headers, "content-type": "application/json" });
        res.end(JSON.stringify({ error: validated.reason }));
        return;
      }

      const mark = addMark(hand, validated.note, validated.color);
      res.writeHead(201, { ...headers, "content-type": "application/json" });
      res.end(JSON.stringify({ mark: toPublic(mark, hand) }));
      broadcastMark(mark);
      return;
    }

    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found");
  } catch (err) {
    console.error(err);
    if (!res.headersSent) {
      res.writeHead(500, { "content-type": "text/plain" });
    }
    res.end("internal error");
  }
});

// Astro's own Content-Type-mismatch behaviour (checked on crit 7) is what
// this mirrors: an unexpected request shouldn't take the process down, just
// answer badly and keep serving the next one — every route above is already
// wrapped by the try/catch, this is the last resort.
server.on("clientError", (_err, socket) => {
  socket.end("HTTP/1.1 400 Bad Request\r\n\r\n");
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`long scroll listening on 0.0.0.0:${PORT}`);
});

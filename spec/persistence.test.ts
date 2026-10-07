import { type ChildProcess, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, expect, it } from "vitest";

// README.md lists this, under "Enforced, in spec/": a returning hand's past
// strokes are still in the response after a fresh server restart. Every
// other test in this directory hits the one app spec/global-setup.ts found
// already running — it never restarts, so that specific claim had nothing
// behind it. This test manages its own short-lived server processes against
// an isolated DATA_DIR instead, the same persistence path src/db.ts uses in
// production (a Fly volume standing in for this temp directory).

const dataDir = mkdtempSync(join(tmpdir(), "long-scroll-persistence-"));
const port = 18173;
const origin = `http://localhost:${port}`;

function startServer(): { child: ChildProcess; stderr: () => string } {
  const child = spawn("node", ["src/server.ts"], {
    env: { ...process.env, PORT: String(port), DATA_DIR: dataDir },
    stdio: ["ignore", "ignore", "pipe"],
  });
  let stderr = "";
  child.stderr?.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });
  return { child, stderr: () => stderr };
}

async function waitForServer(stderr: () => string): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt++) {
    try {
      await fetch(origin);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error(`nothing answered at ${origin}; stderr: ${stderr()}`);
}

function stopServer(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    child.on("exit", () => resolve());
    child.kill();
  });
}

afterAll(() => {
  rmSync(dataDir, { recursive: true, force: true });
});

it("keeps a hand's past strokes after the server process restarts", async () => {
  const first = startServer();
  await waitForServer(first.stderr);

  const post = await fetch(new URL("/api/marks", origin), {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify({ color: "#3a5a6b", note: "survives a restart" }),
  });
  expect(post.status, `POST failed; stderr: ${first.stderr()}`).toBe(201);
  const cookie = post.headers.get("set-cookie")?.split(";")[0];
  expect(cookie, "no hand cookie was set on first contact").toBeTruthy();
  const created = (await post.json()).mark;

  await stopServer(first.child);

  const second = startServer();
  try {
    await waitForServer(second.stderr);
    const res = await fetch(new URL("/api/marks", origin), {
      headers: { cookie: cookie! },
    });
    const { marks } = await res.json();
    const survived = marks.find((m: { id: number }) => m.id === created.id);
    expect(survived, "the pre-restart stroke is missing from the post-restart response").toBeTruthy();
    expect(survived.yours, `hand not recognised after restart; stderr: ${second.stderr()}`).toBe(
      true,
    );
  } finally {
    await stopServer(second.child);
  }
});

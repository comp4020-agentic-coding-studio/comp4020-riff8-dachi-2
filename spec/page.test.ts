import { JSDOM } from "jsdom";
import { randomUUID } from "node:crypto";
import { expect, inject, it } from "vitest";

// marks.test.ts holds the server to CLAUDE.md; this holds the page's own
// script to the two rules only the browser side can keep: a stroke's owner is
// told in text, not just ink, and every control is a native labelled form
// element. It loads the served page and the served public/app.js against the
// running app, so it sees what a visitor's browser would.
const baseUrl = inject("baseUrl");

async function addStroke(note: string, cookie?: string): Promise<string> {
  const res = await fetch(new URL("/api/marks", baseUrl), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: baseUrl,
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify({ color: "#3f5d40", note }),
  });
  expect(res.status).toBe(201);
  return cookie ?? res.headers.get("set-cookie")!.split(";")[0];
}

// jsdom has no cookie jar shared with Node's fetch, so the page's fetch is
// Node's own, carrying this hand's cookie the way the browser would.
async function openPage(cookie: string): Promise<Document> {
  const html = await (await fetch(new URL("/", baseUrl))).text();
  const script = await (await fetch(new URL("/app.js", baseUrl))).text();
  const { window } = new JSDOM(html, { url: baseUrl, runScripts: "outside-only" });
  window.fetch = ((input: string, init: RequestInit = {}) =>
    fetch(new URL(input, baseUrl), {
      ...init,
      headers: { ...(init.headers as Record<string, string>), cookie, origin: baseUrl },
    })) as typeof window.fetch;
  window.eval(script);
  return window.document;
}

async function itemFor(doc: Document, note: string): Promise<Element> {
  for (let attempt = 0; attempt < 50; attempt++) {
    const li = [...doc.querySelectorAll("#scroll li")].find((el) =>
      el.textContent?.includes(note),
    );
    if (li) return li;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`the page never rendered the stroke "${note}"`);
}

it("says in text which strokes are yours, not just in ink", async () => {
  const mine = `page test, mine ${randomUUID()}`;
  const theirs = `page test, theirs ${randomUUID()}`;
  const cookie = await addStroke(mine);
  await addStroke(theirs);

  const doc = await openPage(cookie);
  expect((await itemFor(doc, mine)).textContent).toMatch(/ — yours$/);
  expect((await itemFor(doc, theirs)).textContent).not.toContain("yours");

  const welcome = doc.getElementById("welcome-back")!;
  expect(welcome.hidden).toBe(false);
  expect(welcome.textContent).toMatch(/still there/);
});

it("offers only native, labelled, keyboard-reachable controls", async () => {
  const doc = await openPage(await addStroke(`page test, controls ${randomUUID()}`));
  const form = doc.getElementById("add-mark-form")!;

  const radios = [...form.querySelectorAll<HTMLInputElement>('input[type="radio"]')];
  expect(radios).toHaveLength(6);

  const controls = [...form.querySelectorAll<HTMLInputElement>("input, button")];
  for (const control of controls) {
    const name =
      control.tagName === "BUTTON"
        ? control.textContent
        : [...(control.labels ?? [])].map((l) => l.textContent).join("");
    expect(name?.trim(), `${control.outerHTML} has no label`).toBeTruthy();
    expect(control.tabIndex, `${control.outerHTML} is out of the tab order`).toBeGreaterThanOrEqual(0);
    expect(control.disabled).toBe(false);
  }
  expect(form.querySelectorAll("[tabindex], [onclick], [role='button']")).toHaveLength(0);
});

// A stroke's brush shape is generated from its id alone, so every load (and
// every browser) draws the same stored stroke identically, and no two differ.
it("draws the same stroke identically on every load, and different strokes differently", async () => {
  const note = `page test, shape ${randomUUID()}`;
  const cookie = await addStroke(note);
  const shapes = async () => {
    const doc = await openPage(cookie);
    await itemFor(doc, note);
    return [...doc.querySelectorAll("#scroll .mark")].map((li) => [
      li.id,
      li.querySelector("svg")!.innerHTML,
    ]);
  };
  const first = await shapes();
  const second = await shapes();
  expect(second).toEqual(first);
  expect(new Set(first.map(([, svg]) => svg)).size).toBe(first.length);
});

it("links a returning browser straight to its latest stroke", async () => {
  const cookie = await addStroke(`page test, older ${randomUUID()}`);
  const latest = `page test, latest ${randomUUID()}`;
  await addStroke(latest, cookie);

  const doc = await openPage(cookie);
  const li = await itemFor(doc, latest);
  const link = doc.querySelector<HTMLAnchorElement>("#welcome-back a")!;
  expect(link.getAttribute("href")).toBe(`#${li.id}`);
  expect(link.textContent).toMatch(/latest stroke/);
});

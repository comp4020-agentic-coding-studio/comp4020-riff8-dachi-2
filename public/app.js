// Vanilla JS, no build step: this page is small enough that a bundler would
// be more machinery than the app itself.

// Mirrors src/marks.ts's PALETTE and order exactly; the server is the one
// that actually enforces membership, this just has to offer the same set.
const PALETTE = [
  { color: "#2b2118", name: "walnut" },
  { color: "#5b4636", name: "umber" },
  { color: "#8a6d3b", name: "ochre" },
  { color: "#3f5d40", name: "pine" },
  { color: "#3a5a6b", name: "slate" },
  { color: "#7a3b3b", name: "madder" },
];

const scrollList = document.getElementById("scroll");
const emptyNotice = document.getElementById("scroll-empty");
const welcomeBack = document.getElementById("welcome-back");
const growingEl = document.getElementById("growing");
const presenceEl = document.getElementById("presence");
const announcer = document.getElementById("announcer");
const form = document.getElementById("add-mark-form");
const paletteEl = form.querySelector(".palette");
const noteInput = document.getElementById("note");
const statusEl = document.getElementById("form-status");

// Every stroke this page knows about, by id. Strokes are only ever added:
// the scroll is append-only, so nothing here is ever removed or replaced.
const marks = new Map();

function buildPalette() {
  PALETTE.forEach(({ color, name }, i) => {
    const id = `color-${name}`;
    const label = document.createElement("label");
    label.className = "swatch";
    label.style.setProperty("--stroke", color);
    label.htmlFor = id;

    const input = document.createElement("input");
    input.type = "radio";
    input.name = "color";
    input.id = id;
    input.value = color;
    if (i === 0) input.checked = true;

    const text = document.createElement("span");
    text.textContent = name;

    label.append(input, text);
    paletteEl.append(label);
  });
}

// en-AU explicitly, not the visitor's own locale, so every reader of the
// same scroll sees its times written the same way.
function timeLabel(iso) {
  return new Date(iso).toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function noteText(mark) {
  return mark.note ? mark.note : "(a stroke, no note)";
}

// ---- brush marks ----

// A stroke's shape comes from its id alone, through a small seeded generator
// (mulberry32), so the same stored stroke draws identically on every load and
// in every browser, and no two ids draw alike.
function seeded(id) {
  let a = Math.imul(id ^ 0x9e3779b9, 0x85ebca6b) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SVG_NS = "http://www.w3.org/2000/svg";
const f1 = (n) => n.toFixed(1);

// The brush lands heavy at the left, swells briefly, then thins along a
// gently bent line as it lifts, with a little seeded wobble in the width.
function brushShape(id) {
  const rand = seeded(id);
  const length = 165 + rand() * 65;
  const x0 = 10 + rand() * 8;
  const y0 = 24 + (rand() - 0.5) * 8;
  const slope = (rand() - 0.5) * 0.1;
  const bend = (rand() - 0.5) * 10;
  const heavy = 8.5 + rand() * 5;
  const lift = 0.7 + rand() * 0.6;
  const steps = 28;

  const centre = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = x0 + t * length;
    const y = y0 + slope * t * length + bend * Math.sin(Math.PI * t);
    const swell = t < 0.1 ? 0.7 + 3 * t : 1;
    const width = Math.max(0.35, heavy * swell * Math.pow(1 - t, lift) * (0.9 + rand() * 0.2));
    centre.push({ x, y, width });
  }

  const upper = [];
  const lower = [];
  centre.forEach((p, i) => {
    const prev = centre[Math.max(0, i - 1)];
    const next = centre[Math.min(steps, i + 1)];
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    upper.push([p.x + nx * p.width, p.y + ny * p.width]);
    lower.push([p.x - nx * p.width, p.y - ny * p.width]);
  });

  const edge = (points) =>
    points
      .slice(1)
      .map(([x, y], i) => {
        const [px, py] = points[i];
        return `Q${f1(px)} ${f1(py)} ${f1((px + x) / 2)} ${f1((py + y) / 2)}`;
      })
      .join(" ");
  const back = [...lower].reverse();
  const body =
    `M${f1(upper[0][0])} ${f1(upper[0][1])} ${edge(upper)} ` +
    `L${f1(back[0][0])} ${f1(back[0][1])} ${edge(back)} Z`;

  // the landing: a slightly rotated blot where the brush first pressed down
  const landing = {
    cx: x0 + heavy * 0.3,
    cy: y0,
    rx: heavy * (1.05 + rand() * 0.25),
    ry: heavy * (0.85 + rand() * 0.2),
    rotate: (rand() - 0.5) * 40,
  };

  // dry-brush hairs where the ink runs thin towards the lift
  const hairs = [];
  const hairCount = Math.floor(rand() * 3);
  for (let h = 0; h < hairCount; h++) {
    const from = Math.floor(steps * (0.35 + rand() * 0.2));
    const to = Math.min(steps, from + Math.floor(steps * (0.15 + rand() * 0.25)));
    const offset = (rand() - 0.5) * 0.9;
    const pts = centre
      .slice(from, to)
      .map((p) => `${f1(p.x)},${f1(p.y + offset * p.width)}`)
      .join(" ");
    hairs.push(pts);
  }

  return { body, landing, hairs, drift: rand(), tilt: (rand() - 0.5) * 8 };
}

function brushSvg(mark, shape) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 250 48");
  svg.setAttribute("class", "mark__stroke");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.style.setProperty("--stroke", mark.color);

  const blot = document.createElementNS(SVG_NS, "ellipse");
  const { cx, cy, rx, ry, rotate } = shape.landing;
  blot.setAttribute("cx", f1(cx));
  blot.setAttribute("cy", f1(cy));
  blot.setAttribute("rx", f1(rx));
  blot.setAttribute("ry", f1(ry));
  blot.setAttribute("transform", `rotate(${f1(rotate)} ${f1(cx)} ${f1(cy)})`);

  const body = document.createElementNS(SVG_NS, "path");
  body.setAttribute("d", shape.body);

  const ink = document.createElementNS(SVG_NS, "g");
  ink.setAttribute("class", "mark__ink");
  ink.append(blot, body);
  for (const pts of shape.hairs) {
    const hair = document.createElementNS(SVG_NS, "polyline");
    hair.setAttribute("points", pts);
    hair.setAttribute("class", "mark__hair");
    ink.append(hair);
  }
  svg.append(ink);
  return svg;
}

function markToListItem(mark) {
  const shape = brushShape(mark.id);
  const li = document.createElement("li");
  li.className = "mark" + (mark.yours ? " mark--yours" : "");
  li.id = `mark-${mark.id}`;
  li.dataset.id = String(mark.id);
  // focus target for "find your latest stroke"; not in the tab order
  li.tabIndex = -1;
  li.style.setProperty("--drift", shape.drift.toFixed(3));

  const brush = document.createElement("span");
  brush.className = "mark__brush";
  brush.append(brushSvg(mark, shape));

  // The seal is decoration; the text below says "— yours" for everyone,
  // including anyone who can't see the seal or its colour.
  if (mark.yours) {
    const seal = document.createElement("span");
    seal.className = "seal";
    seal.setAttribute("aria-hidden", "true");
    seal.style.setProperty("--tilt", `${shape.tilt.toFixed(1)}deg`);
    seal.textContent = "yours";
    brush.append(seal);
  }

  const text = document.createElement("span");
  text.className = "mark__text";
  const yoursSuffix = mark.yours ? " — yours" : "";
  text.textContent = `${noteText(mark)} — ${timeLabel(mark.createdAt)}${yoursSuffix}`;

  li.append(brush, text);
  return li;
}

// Places a stroke in id order (the order strokes were stored), whether it
// came from the first load, a resync, the stream or this page's own POST.
// Returns its element, and whether it was new to this page.
function insertMark(mark) {
  const existing = document.getElementById(`mark-${mark.id}`);
  if (existing) return { el: existing, added: false };
  marks.set(mark.id, mark);
  emptyNotice.remove();

  const li = markToListItem(mark);
  const after = [...scrollList.querySelectorAll(".mark")].find(
    (el) => Number(el.dataset.id) > mark.id,
  );
  scrollList.insertBefore(li, after ?? null);
  updateSummary();
  return { el: li, added: true };
}

function sortedMarks() {
  return [...marks.values()].sort((a, b) => a.id - b.id);
}

function updateSummary() {
  const all = sortedMarks();
  const count = all.length;
  const countText = `${count} ${count === 1 ? "mark" : "marks"}`;
  if (count === 0) {
    growingEl.textContent = "This scroll is waiting for its first mark.";
  } else {
    const days = Math.floor((Date.now() - new Date(all[0].createdAt).getTime()) / 86_400_000);
    growingEl.textContent =
      days < 1
        ? `This scroll began today · ${countText}`
        : `This scroll has been growing for ${days} ${days === 1 ? "day" : "days"} · ${countText}`;
  }

  const own = all.filter((m) => m.yours);
  if (own.length > 0) showWelcome(own);
}

// Shown only to a browser that already owns strokes, with a link to the
// latest of them; kept current as that browser adds more.
function showWelcome(own) {
  const latest = own[own.length - 1];
  welcomeBack.hidden = false;
  welcomeBack.replaceChildren(
    own.length === 1
      ? "Welcome back — your stroke is still there. "
      : `Welcome back — your ${own.length} strokes are still there. `,
  );
  const link = document.createElement("a");
  link.href = `#mark-${latest.id}`;
  link.textContent = "Find your latest stroke.";
  link.addEventListener("click", (event) => {
    event.preventDefault();
    goTo(document.getElementById(`mark-${latest.id}`));
  });
  welcomeBack.append(link);
}

function reducedMotion() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

// Moves both the view and keyboard focus, so the next Tab continues from
// the stroke rather than from wherever the link was.
function goTo(el) {
  if (!el) return;
  el.scrollIntoView?.({ block: "center", behavior: reducedMotion() ? "auto" : "smooth" });
  el.focus({ preventScroll: true });
}

function announce(text) {
  announcer.textContent = text;
}

let resyncNeeded = false;

async function load() {
  // fly.toml stops this app's one machine when idle and starts it on the next
  // request, so a cold start (or any dropped connection) is a real, not
  // hypothetical, way for this fetch to reject rather than resolve.
  try {
    const res = await fetch("/api/marks");
    const data = await res.json();
    for (const mark of data.marks) insertMark(mark);
    updateSummary();
    return true;
  } catch {
    resyncNeeded = true;
    if (marks.size === 0) {
      emptyNotice.textContent =
        "couldn't load the scroll yet — it will appear here as soon as the connection comes back.";
    }
    return false;
  }
}

// ---- live arrival and presence ----

function setPresence(hands) {
  presenceEl.textContent = `${hands} ${hands === 1 ? "hand" : "hands"} here now`;
}

let submitting = false;

function onLiveMark(mark) {
  // This page's own POST places and animates its own stroke; the stream's
  // copy of it is the same row and is skipped while that POST is in flight.
  if (mark.yours && submitting) return;
  const { el, added } = insertMark(mark);
  if (!added) return;
  land(el);
  if (!mark.yours) announce(`A new stroke from another hand: ${noteText(mark)}`);
}

// EventSource reconnects by itself after a dropped connection (the server
// asks for a 2 s retry), but gives up for good if a reconnect is answered
// with an error status, which is what Fly's proxy can return while this
// app's machine is starting from cold. So a stream the browser has closed is
// reopened here, backing off from 1 s to 15 s. Any reconnect refetches the
// scroll, since strokes stored while the page was away were never pushed.
let source = null;
let retryDelay = 1000;
let retryTimer = null;

function connect() {
  if (!("EventSource" in window)) return;
  clearTimeout(retryTimer);
  source = new EventSource("/api/stream");
  source.addEventListener("open", () => {
    retryDelay = 1000;
    if (resyncNeeded) {
      resyncNeeded = false;
      load();
    }
  });
  source.addEventListener("presence", (e) => setPresence(JSON.parse(e.data).hands));
  source.addEventListener("mark", (e) => onLiveMark(JSON.parse(e.data)));
  source.addEventListener("error", () => {
    resyncNeeded = true;
    presenceEl.textContent = "reconnecting…";
    if (source.readyState === EventSource.CLOSED) {
      source.close();
      retryTimer = setTimeout(connect, retryDelay);
      retryDelay = Math.min(retryDelay * 2, 15_000);
    }
  });
}

window.addEventListener("online", () => {
  if (!source || source.readyState === EventSource.CLOSED) connect();
});

// ---- adding a stroke ----

const submitButton = form.querySelector('button[type="submit"]');
const noteCount = document.getElementById("note-count");
const NOTE_LIMIT = 140;

// The server's 140-character check is the one that counts; this only says
// how much room is left before it, counting the way the server does.
function updateCount() {
  const left = NOTE_LIMIT - noteInput.value.trim().length;
  noteCount.textContent =
    left >= 0
      ? `${left} ${left === 1 ? "character" : "characters"} left`
      : `${-left} ${left === -1 ? "character" : "characters"} over`;
}
noteInput.addEventListener("input", updateCount);

// What the server actually said, in words, with what to do next.
function describeRejection(status, error) {
  switch (error) {
    case "note-too-long":
      return "The scroll refused that note: it's over 140 characters. Shorten it and add it again.";
    case "unknown-color":
      return "The scroll refused that ink: it isn't one of its six colours. Pick one of the swatches and try again.";
    case "cross-site-request":
      return "The scroll refused that write because it didn't come from this page (writes from other sites are blocked). Reload the scroll and add your stroke from here.";
    case "bad-json":
      return "The server couldn't read that request (bad-json). Reload the page and try again.";
  }
  if (status === 413) {
    return "The server refused that request as too large (413). Shorten the note and try again.";
  }
  const detail = error ? `${status}, ${error}` : String(status);
  return `The server couldn't store that stroke (${detail}). Nothing was added; try again in a moment.`;
}

function setStatus(text, isError = false) {
  statusEl.textContent = text;
  statusEl.classList.toggle("form-status--error", isError);
}

function setSubmitting(on) {
  submitting = on;
  submitButton.disabled = on;
  form.setAttribute("aria-busy", String(on));
}

// A one-time draw-down: the class is only ever added to a stroke that has
// just arrived, never on a load, so nothing replays after a reload. Under
// reduced motion the stylesheet drops the animation and the scroll jumps.
function land(el) {
  if (reducedMotion()) return;
  el.classList.add("mark--landing");
  el.addEventListener("animationend", () => el.classList.remove("mark--landing"), { once: true });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (submitting) return;
  const color = new FormData(form).get("color");
  const note = noteInput.value;

  setSubmitting(true);
  setStatus("adding your stroke…");
  try {
    let res;
    try {
      res = await fetch("/api/marks", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ color, note }),
      });
    } catch {
      setStatus(
        "Your stroke couldn't reach the scroll — the connection dropped. Nothing was added; check your connection and try again.",
        true,
      );
      return;
    }

    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setStatus(describeRejection(res.status, body?.error), true);
      if (body?.error === "note-too-long") noteInput.focus();
      return;
    }

    const { mark } = await res.json();
    noteInput.value = "";
    updateCount();
    const { el } = insertMark(mark);
    land(el);
    el.scrollIntoView?.({ block: "center", behavior: reducedMotion() ? "auto" : "smooth" });
    setStatus("Your stroke is on the scroll, at the end.");
  } finally {
    setSubmitting(false);
    // a disabled button drops focus; give it back rather than strand it on <body>
    if (document.activeElement === document.body || document.activeElement === null) {
      submitButton.focus();
    }
  }
});

buildPalette();
updateCount();
// The first read mints this browser's hand cookie if it has none, so the
// stream opened after it is counted under that hand.
load().then(connect);

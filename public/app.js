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

function markToListItem(mark) {
  const li = document.createElement("li");
  li.className = "mark" + (mark.yours ? " mark--yours" : "");
  li.id = `mark-${mark.id}`;
  li.dataset.id = String(mark.id);

  const stroke = document.createElement("span");
  stroke.className = "mark__stroke";
  stroke.style.setProperty("--stroke", mark.color);
  stroke.setAttribute("aria-hidden", "true");

  const text = document.createElement("span");
  text.className = "mark__text";
  const yoursSuffix = mark.yours ? " — yours" : "";
  text.textContent = `${noteText(mark)} — ${timeLabel(mark.createdAt)}${yoursSuffix}`;

  li.append(stroke, text);
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

  const own = all.filter((m) => m.yours).length;
  if (own > 0) {
    welcomeBack.hidden = false;
    welcomeBack.textContent =
      own === 1
        ? "You've left a mark on this scroll before — it's still there."
        : `You've left ${own} marks on this scroll before — they're still there.`;
  }
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
  const { added } = insertMark(mark);
  if (!added) return;
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

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (submitting) return;
  const color = new FormData(form).get("color");
  const note = noteInput.value;

  submitting = true;
  statusEl.textContent = "adding your mark…";
  let res;
  try {
    res = await fetch("/api/marks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ color, note }),
    });
  } catch {
    submitting = false;
    statusEl.textContent = "that mark couldn't be added — check your connection and try again.";
    return;
  }

  if (!res.ok) {
    submitting = false;
    statusEl.textContent = "that mark couldn't be added — try a shorter note.";
    return;
  }

  const { mark } = await res.json();
  submitting = false;
  noteInput.value = "";
  insertMark(mark);
  statusEl.textContent = "added to the scroll.";
});

buildPalette();
// The first read mints this browser's hand cookie if it has none, so the
// stream opened after it is counted under that hand.
load().then(connect);

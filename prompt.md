# Riff: a scroll you can hear, with other hands on it

This is your brief for one unattended run in **this repo**
(`comp4020-riff8-dachi-2`). Build it, test it, commit it. Don't write a design
proposal, don't stop to ask: nobody is there to answer. Where this prompt
leaves a choice open, make it and say what you chose, and why, in the commit
message that makes it. Never touch `comp4020-final-dachi`.

The next brief is real-time: several hands on the scroll at once. Long Scroll
already persists and is already multi-user; this run makes it live, and gives
the shared scroll a second reading, as sound.

## The idea

Long Scroll is a shared handscroll: anyone can add a stroke of ink (one of six
colours, an optional note), nothing is ever removed, and a returning browser
finds its own strokes still there. It must never turn into a feed, a chat or a
comment wall.

Three things should be true when this run is done:

1. **It looks and feels like one mounted scroll**, not a list of comments.
2. **Other people are present.** A stroke someone adds appears on everyone's
   open page without a reload, and you can tell how many hands are here now.
3. **The scroll can be heard.** The sequence of colours plays as a quiet piece
   of music, and while you listen, other people's new strokes arrive as notes.

## Build, in this order

If time runs short, finish an earlier item properly rather than half-doing a
later one.

### 1. Live updates and presence

- A server-sent events endpoint (e.g. `GET /api/stream`) that pushes each new
  stroke to every open page the moment it is stored. Keep `GET /api/marks`
  for the first load. No new dependencies: `node:http` can do this. One Fly
  machine means an in-process broadcast is enough; say so in the README.
- The page inserts arriving strokes in place, marks them "— yours" only if
  they are, and reconnects on its own after a dropped connection or a cold
  start (the machine stops when idle).
- A presence line, e.g. "3 hands here now", counted from open streams. It is
  anonymous: a count, never a list of who.

### 2. The mounted scroll

- The page background is a dark mounting silk; only the scroll is paper, with
  a wooden roller at its top and bottom. Calm and contemporary, not a museum
  replica or "ancient China" pastiche.
- Each stroke is drawn as a brush mark (SVG is fine): heavy where the brush
  lands, thinning as it lifts. Its shape is derived from the stroke's `id`
  with a seeded generator, so every stroke differs but the same stroke looks
  identical on every load, for everyone.
- Your own strokes carry a small vermilion seal reading "yours", like a
  collector's seal. The text " — yours" must still end the item's text, so
  the seal is never the only signal.
- A welcome-back line for a returning browser, with a link that jumps to its
  most recent stroke.
- A line under the title that makes time visible, computed from real data:
  "This scroll has been growing for 12 days · 86 marks". It updates when a
  stroke arrives live.
- Times are formatted in the page's own language (`en-AU`), not the
  visitor's browser locale.

### 3. Adding a stroke

- The form is headed "Add the next stroke". The six colours show as ink
  swatches, but they are still native radio inputs: keyboard works, focus is
  clearly visible, each has its name as a label.
- A live "N characters left" counter for the 140-character note.
- The button is disabled while the stroke is being added. Errors say what the
  server actually answered (note too long, unknown colour, cross-site,
  anything else) and what to do next.
- The new stroke "inks on" once (a short draw-down animation) and is scrolled
  into view. With `prefers-reduced-motion: reduce`, no animation and no smooth
  scrolling.

### 4. Hear the scroll

- A "Hear the scroll" button (a native `<button>` with `aria-pressed`, label
  changes to "Stop") plays the strokes in the order they were added, using
  the Web Audio API only: no audio libraries, no sample files.
- Each of the six colours is one fixed note from a pentatonic scale, with a
  soft attack and a long decay, so any sequence sounds consonant. A stroke
  with a note can sound slightly longer than one without. Keep it quiet and
  slow: this is ambience, not a game.
- While playing, the stroke being heard is visibly highlighted (not by colour
  alone) and announced politely to screen readers by its note text and time.
  With reduced motion, highlight without auto-scrolling.
- While it is on, a stroke arriving live from someone else sounds its note
  as it lands. That is the point of the riff: you hear other hands arrive.
- Sound never starts on its own; only the button starts it.

## Keep

Everything in the "Your harness" section of `CLAUDE.md` still holds:
append-only, six colours and 140 characters validated server-side, no
accounts, same-origin writes only, nothing signalled by colour alone, native
labelled controls. The stream must not become a write path or leak any
browser's `hand` value to other browsers: send each page only whether a
stroke is its own.

Fix the same leak where it already exists: `GET /api/marks` currently returns
every stroke's `hand`, so anyone can read another browser's identity and
copy it into their own cookie. Return a per-request `yours: true/false`
instead, and never send `hand` values out at all.

`README.md` is the app's argument and `CLAUDE.md` says the argument changes
first. Update its "What I chose not to build" and "Multi-user, for now"
sections to describe what live updates, presence and sound now mean here,
and why. Keep its headings and its cited sources.

## Leave alone

Accounts or names, editing or deleting strokes, chat or replies, likes or
ranking, rate limiting, a canvas-only scroll, audio tooling beyond one
button, any new runtime dependency, a framework or a stack change.

## Done means

- Two browsers open on the page: a stroke added in one appears in the other
  within two seconds, without a reload, with the presence count showing 2.
- A new spec test opens the stream, posts a stroke, and receives it; another
  checks that neither the stream nor `GET /api/marks` ever carries a `hand`
  value. The existing spec files
  stay green (update `page.test.ts` only where the markup genuinely changed).
  `spec/invariants.test.ts` stays green untouched. `pnpm check` passes.
- In a real browser, at desktop and phone width: every control is reachable
  by keyboard with visible focus, "Hear the scroll" plays and stops, the
  highlight follows the sound, the console is clean.
- `README.md` reads as the updated argument, and `/readme/` renders it.
- `main` is deployable, and your last commit deletes this file.
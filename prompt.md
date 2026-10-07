# Riff: a scroll you can hear, with other hands on it

This is your brief for one unattended run in **this repo**
(`comp4020-riff8-dachi-2`).

Build it, test it, commit it.

Do not write a design proposal. Do not stop to ask questions: nobody is there
to answer. Where this prompt leaves a choice open, make the choice yourself and
explain what you chose and why in the commit message that introduces it.

Never touch `comp4020-final-dachi`.

The next brief is real-time: several hands on the scroll at once. Long Scroll
already persists and is already multi-user; this run makes it live, and gives
the shared scroll a second reading, as sound.

---

## Repository safety check

Before changing anything:

- verify the current repository is `comp4020-riff8-dachi-2`
- verify `pwd`
- verify `git remote -v`
- verify the current branch and working tree
- inspect the existing `CLAUDE.md`, `README.md`, `src/`, and `spec/` before
  implementation

If this is `comp4020-final-dachi`, or the repository identity does not match,
stop immediately without modifying any file.

Do not copy changes back into `comp4020-final-dachi`.

---

## The idea

Long Scroll is a shared handscroll: anyone can add a stroke of ink, choosing
one of six colours and optionally leaving a short note. Nothing is ever
removed, and a returning browser finds its own strokes still there.

It must never turn into a feed, a chat, or a comment wall.

Three things should be true when this run is done:

1. **It looks and feels like one mounted scroll**, not a list of comments.
2. **Other people are present.** A stroke someone adds appears on everyone's
   open page without a reload, and you can tell how many distinct hands are
   here now.
3. **The scroll can be heard.** The sequence of colours plays as a quiet piece
   of music, and while you listen, other people's new strokes arrive as notes.

---

## Build, in this order

If time runs short, finish an earlier item properly rather than half-doing a
later one.

---

### 0. Update the argument first

`CLAUDE.md` says the argument changes first, so update `README.md` before
implementation.

Keep its current headings and cited sources, but revise the argument so it now
describes:

- live arrival
- anonymous presence
- hearing the scroll
- why these additions still preserve the idea of one small shared object
- why the scroll is still not a feed, chat, ranking system, or social network

Update the existing sections:

- `What I chose not to build, this week`
- `Multi-user, for now`

They should no longer describe live updates as deferred future work.

Explain that:

- every open page receives new strokes live
- presence is anonymous and represented only as a count
- sound is generated from the same colour sequence already stored in the
  scroll
- no identity, account, profile, or social graph has been added

`/readme/` must continue to render the updated README.

---

### 1. Live updates and presence

#### Server-sent events

Add a server-sent events endpoint, for example:

`GET /api/stream`

It must push each newly stored stroke to every currently open page immediately
after the stroke is successfully stored.

Keep:

`GET /api/marks`

for the initial page load.

Do not add a runtime dependency. Use the existing stack and platform APIs such
as `node:http` where needed.

One Fly machine means an in-process broadcast is sufficient for this version.
State this explicitly in the README, including the limitation that a future
multi-machine deployment would need shared pub/sub or equivalent coordination.

#### Per-connection privacy

Stored stroke records may contain an internal `hand` value, but raw `hand`
values must never be sent to clients.

Fix the existing privacy leak in `GET /api/marks`.

It currently returns each stroke's `hand`, which allows a client to inspect
another browser's identity and potentially copy it into its own cookie.

Instead, for every returned stroke, send only a per-request boolean such as:

`yours: true`

or:

`yours: false`

Never return the underlying `hand`.

The SSE stream must follow the same rule.

The SSE event payload must be personalised per connection:

- for the browser whose `hand` owns the newly created stroke, send
  `yours: true`
- for every other connection, send `yours: false`

Never broadcast a raw stored stroke object if that object contains `hand`.

The stream must not leak another browser's `hand` in any form.

#### Client behaviour

When a stroke arrives over the stream:

- insert it into the scroll in the correct position
- do not reload the page
- render `— yours` only when that page received `yours: true`
- preserve all existing accessibility signals
- reconnect automatically if the stream drops
- recover after Fly cold starts and idle shutdowns without requiring a manual
  reload

Do not create a second write path through the stream.

All writes still use the existing same-origin POST path.

#### Presence

Add an anonymous presence line such as:

`3 hands here now`

Presence means **distinct active hands**, not raw SSE connection count.

If the same browser opens multiple tabs, those tabs should count as one hand.

The server may use a browser's internal `hand` value for presence bookkeeping,
but must never send that value to any client.

Presence exposes only an aggregate count.

When the last stream associated with one hand closes, that hand should stop
counting as present.

The count should update live as hands arrive and leave.

Do not show:
- names
- IDs
- avatars
- lists of visitors
- persistent presence history

---

### 2. The mounted scroll

The page should visually read as one mounted handscroll.

#### Background and paper

- use a dark mounting silk or restrained brocade-like background
- only the scroll itself should read as paper
- add a wooden roller at the top and bottom
- keep the composition calm and contemporary
- do not make it look like a museum replica
- avoid stereotyped or theatrical "ancient China" styling

The scroll should feel like one continuous object, not a series of cards.

#### Brush marks

Each stroke should be rendered as a brush mark.

SVG is fine.

The form should suggest:

- a heavier landing point
- a gradual thinning as the brush lifts
- slight variation from stroke to stroke

The stroke shape must be derived deterministically from the stroke's `id`.

Use a seeded deterministic generator so that:

- every stroke differs
- the same stored stroke always renders identically
- every browser sees the same shape for the same stroke
- refreshing does not change the stroke

Do not use non-deterministic `Math.random()` directly for final stroke shape.

#### Your own strokes

A stroke belonging to the current browser should carry a small vermilion seal
reading:

`yours`

The visual idea may borrow lightly from a collector's seal.

However, the seal must not be the only indication of ownership.

The item's accessible text must still end with:

`— yours`

or equivalent existing wording that preserves the same semantic signal.

Nothing about ownership may rely on colour alone.

#### Welcome back

If the current browser already owns one or more strokes, show a welcome-back
line.

Include a direct link to the visitor's most recent stroke.

Example wording may be:

`Welcome back — find your latest stroke.`

The link should move focus or location meaningfully to that stroke and work
with keyboard navigation.

#### Time

Under the title, show a line computed from real stored data such as:

`This scroll has been growing for 12 days · 86 marks`

Calculate:

- age from the earliest stored stroke
- mark count from actual stored strokes

Do not hard-code example values.

Update the mark count live when a new stroke arrives.

Use `en-AU` explicitly for date and time formatting.

Do not use the visitor's browser locale implicitly.

---

### 3. Adding a stroke

Change the form heading to:

`Add the next stroke`

The interaction should feel like continuing the shared object, not submitting
a generic comment form.

#### Colour choices

Show the six allowed colours as ink swatches.

They must still be backed by native radio inputs.

Requirements:

- keyboard operation works
- each option has an accessible name
- native radio semantics remain intact
- focus is clearly visible
- selection is not indicated by colour alone
- do not visually duplicate unnecessary default radio circles if a cleaner
  accessible treatment is possible

Do not replace the radio group with an inaccessible custom-only control.

#### Character counter

Add a live counter for the optional note:

`N characters left`

The server-side 140-character limit remains authoritative.

Client-side behaviour must not weaken existing server validation.

#### Submission state

While a stroke is being submitted:

- disable the submit button
- prevent accidental duplicate submission
- keep the UI understandable to keyboard and screen-reader users

When the server rejects the request, show the actual server response in useful
language.

Errors should distinguish cases such as:

- note too long
- unknown colour
- cross-site write rejected
- other server failure

Tell the user what happened and, where meaningful, what to do next.

Do not replace real server error detail with a generic "Something went wrong"
message.

#### New-stroke feedback

After the current user successfully adds a stroke:

- render the new stroke
- give it a one-time short "ink landing" or draw-down animation
- move it into view automatically
- do not replay the animation after reload

Respect:

`prefers-reduced-motion: reduce`

For reduced-motion users:

- no ink animation
- no smooth auto-scroll
- update state immediately and clearly

---

### 4. Hear the scroll

Add one native button:

`Hear the scroll`

When active:

- its accessible label changes to `Stop`
- use `aria-pressed`
- sound starts only after user activation
- sound never starts automatically

Use only the Web Audio API.

Do not add:

- audio libraries
- sample files
- MIDI libraries
- external audio assets
- audio frameworks

#### Musical mapping

There are six colours.

Map them to six fixed pitches drawn from a consonant pentatonic palette across
more than one octave.

A valid approach would be equivalent in spirit to:

- C4
- D4
- E4
- G4
- A4
- C5

The exact note-to-colour mapping is an implementation choice.

Choose one stable mapping and document the choice in the commit message that
introduces it.

The important constraints are:

- six distinct fixed pitches
- consonant relationship
- predictable colour-to-pitch mapping
- quiet, slow, ambient character

Each note should use:

- soft attack
- long decay
- restrained gain

A stroke with an attached note text may sound slightly longer than a stroke
without one.

Keep the piece slow enough that the user can perceive the visual traversal.

This is ambience, not a game soundtrack.

#### Sequential playback

When playback starts:

- play stored strokes in the order they were added
- visibly highlight the stroke currently being heard
- do not rely on colour alone for the highlight
- expose the current stroke state semantically

Announce the current stroke politely to screen readers using its note text and
time.

Use a non-disruptive live region.

Do not flood screen readers with unnecessary repeated wording.

When reduced motion is not requested, it is acceptable to bring the currently
playing stroke into view.

With `prefers-reduced-motion: reduce`:

- still highlight the active stroke
- do not auto-scroll through the scroll

Stopping playback must:

- stop future scheduled playback
- clear the active visual state
- return the button to `Hear the scroll`

#### Live arrival while listening

While playback is active, a newly arriving stroke from another hand should
sound once immediately as it lands.

That is a key part of the riff: the listener can hear another hand arrive.

After sounding immediately, that new stroke should **not** be added into the
current sequential playback pass.

It becomes part of the stored sequence and will be included the next time the
user starts `Hear the scroll`.

This avoids the same newly arrived stroke sounding twice during one listening
session.

A stroke arriving from the current browser's own submission should not be
treated as "another hand arriving" for this live-arrival sound rule.

---

## Keep

Everything in the `Your harness` section of `CLAUDE.md` still applies.

Preserve all existing invariants, including:

- append-only storage
- exactly six allowed colours
- 140-character maximum validated server-side
- no accounts
- anonymous browser identity
- same-origin writes only
- native labelled controls
- keyboard usability
- visible focus
- nothing important signalled only by colour
- stored strokes cannot be edited or deleted

The stream is read-only.

It must not:

- accept writes
- expose `hand`
- create an alternative mutation path
- weaken origin checks

---

## Leave alone

Do not add:

- accounts
- names
- profiles
- editing
- deleting
- chat
- replies
- likes
- ranking
- moderation workflows
- rate limiting
- a canvas-only scroll
- audio tooling beyond the one listening control
- new runtime dependencies
- framework changes
- stack changes
- external venue, identity, analytics, or media services

Do not redesign this into a social network.

---

## Testing

Add or update tests only as needed to verify the new behaviour.

Required new coverage:

1. Open the SSE stream, post a valid stroke, and verify the stream receives
   that new stroke.
2. Verify `GET /api/marks` never contains a `hand` value.
3. Verify SSE payloads never contain a `hand` value.
4. Verify ownership is represented through `yours: true/false`.
5. Verify presence can distinguish distinct hands rather than simply counting
   connections where practical at the server level.

Do not implement SSE tests with fixed sleeps such as:

`await sleep(2000)`

Instead, wait for the relevant stream event and use a reasonable test timeout.
Fail explicitly if the expected event never arrives.

Keep the existing spec suite green.

`spec/invariants.test.ts` must remain untouched and green.

Update `page.test.ts` only where the page markup genuinely changed.

Run the full checks required by the repository, including:

`pnpm check`

All existing validation, invariant, and accessibility-oriented tests must still
pass.

---

## Real-browser acceptance

Verify the result in a real browser at both desktop and phone widths.

At minimum, manually confirm:

- two independent browser contexts open on the page
- presence displays `2 hands here now`
- a stroke added in one appears in the other without reload
- live arrival happens within roughly two seconds under normal local/deployed
  conditions
- ownership is correct in both browsers
- no `hand` value appears in API responses or stream payloads
- all controls can be reached by keyboard
- visible focus is present
- the colour swatches remain usable with keyboard input
- character count updates
- submit disabling works
- new-stroke feedback works
- reduced-motion behaviour is respected
- `Hear the scroll` starts and stops correctly
- the playback highlight follows the sound
- a live stroke from the other browser sounds while listening
- the browser console is clean
- the layout is usable at desktop and phone width
- `/readme/` renders the updated README

---

## Done means

This run is complete only when all of the following are true:

- Two browsers open on the page can see one another's new strokes without a
  reload.
- Presence shows two distinct hands, not merely two open streams.
- A new stroke appears in the other browser within roughly two seconds under
  normal conditions.
- The stream reconnects after interruption.
- `GET /api/marks` exposes `yours`, never `hand`.
- The SSE stream exposes `yours`, never `hand`.
- The page looks like one mounted scroll rather than a list of comments.
- Stroke shapes are deterministic from their ids.
- Returning visitors can jump to their latest stroke.
- The growing-days and mark-count line is computed from real data and updates
  live.
- The colour form remains accessible and keyboard-operable.
- The 140-character counter and submission states work.
- New strokes receive correct feedback with reduced-motion support.
- `Hear the scroll` plays and stops using only Web Audio.
- Six colours map to six consonant fixed pitches.
- Playback highlights and announces the current stroke.
- A live stroke from another hand sounds once while listening.
- No sound starts without user activation.
- The console is clean.
- Existing spec files remain green.
- New SSE/privacy tests pass without fixed-sleep timing hacks.
- `spec/invariants.test.ts` remains untouched and green.
- `pnpm check` passes.
- `README.md` reads as the updated argument.
- `/readme/` renders correctly.
- `main` is deployable.

---

## Commit discipline

Make coherent commits as work becomes complete.

Commit messages should record meaningful design or implementation choices where
this brief leaves room for judgement.

In particular, explain choices such as:

- presence bookkeeping strategy
- deterministic stroke-generation strategy
- six-colour pitch mapping
- playback timing
- SSE reconnection strategy
- reduced-motion behaviour where implementation choices were necessary

Do not leave unrelated working-tree changes behind.

Before the final commit:

- run the full test/check suite
- inspect `git diff --check`
- inspect repository status
- confirm the repository is still `comp4020-riff8-dachi-2`

The **last commit must delete this prompt file**.

Finish with a clean working tree on a deployable `main`.
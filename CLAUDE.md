# This repo is a pod riff: pods write the prompt, the agent does the work

This repo is a copy of [`comp4020-final-dachi`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-dachi) at
`aaa2f57f` --- dachi's crit agent's final project as it stood at
`08-its-alive`. Their repo is untouched and off limits. From here to the end of
semester, each crit a pod picks this repo up from wherever the last run left
it.

**Pods: the only file you change is `prompt.md`, at the repo root.** Read the
live app, the code and the history, then write the prompt that would take
this app to a strong, interesting answer to the next brief (the crit runsheet
links it). The prompt can point at any file here. After the session,
dachi's crit agent runs `prompt.md` once, unattended, start to finish, and
nobody is there to answer its questions --- so say what you want, what good
looks like and what to leave alone. Push it before you leave.

**Crit agent: when `prompt.md` exists, it is your brief.** Run it to
completion in one go, keep `main` deployable, and delete `prompt.md` in your
last commit. Leave this block of `CLAUDE.md` as it is.

**Nothing here is marked.** No cutoff, no reflection, no `PROCESS.md` entry.
The next crit opens by looking at where each pod repo ended up, beside the
prompt that got it there (the `prompt-crit<N>` tag).

**The agent's own spec tests are `spec/marks.test.ts`, `spec/page.test.ts` and `spec/persistence.test.ts`.** They encode the brief it was
working to, and they gate the deploy. A prompt aimed at a different brief can
have them changed or deleted; keep `spec/invariants.test.ts` green, since that
one is true of any good site.

Everything below this line was written for the agent's graded submission. Its
marks, cutoff and weekly skills don't govern this repo: read it for how the
agent was directed, not for what anyone owes.

---

# Your harness

Rules derived from `README.md`'s argument. If a change would break one of
these, the README's argument has to change first, not the other way round.

## What the app must never do

- Never edit or delete a stroke once it's stored. Append-only is a claim in
  the README, not an implementation detail; a future feature that needs
  editing needs a new argument first.
- Never accept a stroke whose colour isn't one of the six the palette
  offers, or a note over 140 characters, regardless of what a request
  claims a browser can't send. Validate server-side; never trust the
  `<input>`'s own `maxlength` or the radio group's own values.
- Never require an account, a name, or any information beyond an anonymous
  per-browser identity to add a stroke.
- Never send a stored `hand` to any client, in any response or stream
  event. A hand is a bearer token; ownership travels only as a per-reader
  `yours` boolean, and presence only as a count.
- Never let `/api/stream` write anything. Writes stay on the same-origin
  POST.
- Never start sound without a click on "Hear the scroll".
- Never accept a stroke from a cross-site request. A write with no edit or
  delete path is permanent, so a drive-by page silently posting on a
  visitor's behalf is as serious as a bad value in the fields themselves.

## What every page must hold to

- `/` and `/readme/` both answer 200; `/readme/` publishes `README.md` in
  full, headings intact, since the spec checks this and a visitor is meant
  to read it before using the app.
- No element's only signal is colour. A stroke's ink is decorative; the
  note, timestamp, and a `— yours` suffix are always present as text.
- Every interactive control is a native, labelled form element reachable by
  keyboard alone.

## What a change must not break

- The scroll persists across a restart: it's read fresh from SQLite on
  `/api/marks`, not held in memory.
- Live arrival and presence are an in-process broadcast, correct only
  because `fly.toml` runs one machine; scaling out needs shared pub/sub
  first (README, "Multi-user, for now").
- `pnpm check` and `pnpm check:evidence` pass before a commit.

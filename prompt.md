# Plenty, in first person: a voxel world you walk through

Plenty today is an isometric Canvas 2D game. Make it a first-person,
Minecraft-style voxel game that you play from your avatar's eyes, without
changing what the game is about. The premise stays exactly as it is: players
arrive in a living world, harvest it, build, grow more productive, and watch the
land die under them, across Earth -> Mars -> the Sun -> the Solar System -> the
Universe, with the same ledger, the same stock, the same buildings, and the
same endings (including the restraint ending). Only the way you see and touch
the world changes. The moment the grass under a grove turns brown and the last
tree is gone should hit harder in first person, not softer.

Run this start to finish without asking questions. Read `CLAUDE.md`,
`docs/ARCHITECTURE.md`, `docs/DESIGN.md`, `client/render.ts`, `client/Game.tsx`,
`client/net.ts` and `shared/worldgen.ts` before you change anything.

## What to build

### 1. A three.js first-person renderer

- Add `three` (pin an exact version, e.g. `0.170.0`) and `@types/three`. Write
  `client/render3d.ts` as a drop-in for the `Renderer` class in
  `client/render.ts`: same constructor `(canvas, client, view)`, `start`,
  `stop`, `pick`, `pickBuilding`, `facingTile`, `target`, `frameMs`, `photo`.
  It keeps its own `requestAnimationFrame` loop and reads `GameClient.state`
  directly; React still never renders per-entity updates. Keep `Tool`, `View`
  and `PLAYER_COLOURS` exported from `render.ts` (or move them), and have
  `Game.tsx` use the new renderer.
- World axes: tile `(x, y)` is the block centred at three.js `(x, ·, y)`, with Y up.
  Tile units stay the server's units, so range checks still agree.
- Camera at the local avatar's predicted position (`client.me`, still advanced
  by `client.predict(dt)`), eye height about 1.6 above the ground block, with a
  small walk bob (none under reduced motion). During a stage transition and
  after the ending, rise up and out so the whole spent world is visible.
- Everything is blocks:
  - **Ground**: one column per tile, earth-coloured, with a thin turf block
    on top coloured from the stage palette's `dead` to `lush` by
    `effectiveLife(tile, lifeCap(ledger))`, exactly the signal the 2D
    renderer used. Water (`t === 1`) sits one block lower and turns to mud
    when drawn down. The star core (`t === 3`) glows. Remnants (`t === 4`)
    are grey. Open space (`t === 2`) has no block.
  - **Trees** (Earth's matter): full-size voxels, not sticks. A trunk of
    1×1 log blocks one to three high, and a 3×3 crown of leaf blocks with a
    cap. Both shrink as the tile's `amt / init` falls, down to a single
    leaf block, and the tree disappears when it's spent.
  - **Stone, ore, ice and other matter**: full blocks in the family's
    palette colour, stacked two high while plentiful and one high when low.
  - **Buildings**: stacked boxes, a body plus a roof slab, using the colours and
    relative heights from `BUILD_LOOK` in `render.ts`. Translucent and short
    while under construction. A small flag in the owner's player colour.
  - **Other players**: blocky figures in their player colour, interpolated, facing
    their `facing`, bobbing when they walk. Don't draw your own avatar; show a
    held "hand" block at the bottom right that swings on every harvest.
  - Harvest feedback: a burst of small coloured cubes from the tile
    (`client.onTile`). Keep `client.onBoundary` working.
- Sky colour from `palette.sky`, fog to match, dimmer lighting on the space
  stages and a hot sun on the Sun stage. Use `InstancedMesh` for tiles and
  deposits so the largest world (64×64) stays smooth.
- Aim with a crosshair: raycast from the screen centre, about 9 blocks of reach.
  Map every voxel back to its tile (a leaf block on a neighbouring tile belongs
  to its tree), and buildings to their building. Draw a block outline on the
  target: green or red for build placement (use `placementProblem` with the
  predicted position), orange for demolish, dark otherwise, sized to the
  building footprint.
- `photo()` still works: `preserveDrawingBuffer`, `canvas.toDataURL`.

### 2. First-person controls in `client/Game.tsx`

- The first click on the canvas requests pointer lock; Esc releases it (the
  existing Esc handling still resets the tool). While locked, mouse movement
  sets yaw and pitch, with pitch clamped.
- WASD and the arrows move relative to where you're looking, not to screen
  diagonals. Convert to a tile-space `(dx, dy)` unit vector and send `move`.
  Quantise the heading (64 directions) and re-send at most every 100 ms while
  keys are held, so mouse look doesn't flood the server's rate limit.
- While locked, left click acts on the crosshair target with the current tool:
  harvest, build, demolish, inspect, name a place. E and Space still harvest
  the nearest thing in reach. The number keys, X, I, N, P and H work as before.
- A centred `+` crosshair overlay. Update the help panel and the canvas
  `aria-label` for the new controls. Wheel zoom and the survey view (V) have
  no 3D meaning: either give them one (V could highlight remaining stock
  through walls) or remove them cleanly, including from the help.

### 3. Make trees and shrubs actually breakable

In the quick version of this change, clicking a tree or shrub often did
nothing. The likely cause is that the crosshair reaches about 9 blocks while
the server only harvests within `HARVEST_RANGE` (2.2 tiles), so most clicks
were refused. Fix it properly. Every visible deposit voxel (log, leaf, stone,
ice) must be harvestable by clicking it once you're in range. When you aren't,
the player must see why: a "too far: walk closer" toast, and a different
outline colour for targets out of reach. You may raise `HARVEST_RANGE` in
`shared/content.ts` a little for first person (around 3–3.5). It's
server-validated, so change the constant there, never in the client. Don't
let clicks outside the range succeed. Verify in a real browser with
`node scripts/playbot.ts` that a tree loses blocks as it's chopped, and that
an emptied tree disappears.

### 4. World generation from Perlin noise

- Add `shared/noise.ts`: seeded 2D Perlin noise plus fractal (fBm) noise, pure,
  deterministic, erasable TypeScript only (node type-strips `shared/`), with no
  dependency. Export `elevation(seed, stage, x, y)` and
  `moisture(seed, stage, x, y, scale)` in `[0, 1]`.
- In `shared/worldgen.ts`, replace the random-walk `blobs` with noise-ranked
  placement. Among the tiles the existing `ok` predicate allows, take the
  top `count` by a per-family score:
  - On Earth and Mars, water and ice go in the lowest elevation, stone on the
    highest, and trees follow a separate moisture field.
  - On the space stages, use each family's own noise field.
  - More clusters means a finer field.
  - When a family asks for one cluster (Earth's pond), grow one connected
    body from the best tile by always taking the best neighbour.
- **Counts must stay exact.** The sanity check at the end of `generateStage`
  stays, and so does determinism: the same `(seed, stage)` gives the same map,
  because crash recovery depends on it.
- The ground is **flat**: one block high everywhere, water one lower. The noise
  shapes where stock lies, not the height of the land.

### 5. Wider worlds

Double every stage's `size` in `shared/content.ts`: 24/26/28/30/32 becomes
48/52/56/60/64. Keep each family's tile count and `perTile`, so totals and
the ledger are unchanged. Then check the space stages still read well, since
their rings and patches use absolute radii in `worldgen.ts`; scale those with
the map if they look lost. Re-measure pacing with hand-harvest-only bots at
normal pace, and if the bigger worlds make the walk between groves tedious,
say so in `docs/DESIGN.md` and adjust spawn placement or cluster counts, never
the totals. Make sure snapshots of a 64×64 room still flow comfortably over
the WebSocket.

### 6. Less timber, and trees that only ever shrink

Playtesting the quick version turned up two problems that make a world too
slow to finish:

- **There's too much stock, timber above all.** Stripping a world to move on
  takes too long, and the trees are the worst of it. Reduce Earth's timber
  substantially, in both tile count and `perTile` (`shared/content.ts`).
  Then look at every family on every stage: the room should be able to strip
  a world in a satisfying session, not a grind. The ledger invariant still
  holds, since it's computed from whatever totals the stage defines. Re-measure
  with hand-harvest-only bots at normal pace, then with machines, and record
  the new numbers and the reasoning in `docs/DESIGN.md`. Earth should still
  read as "a meadow island with a pond, a few groves and an old oak", so keep
  enough trees that the first felling feels like a loss. The point is that
  growth consumes the world, so consuming it must be achievable.
- **Hitting a tree makes it look like it grows.** Players report that chopping
  a tree makes it bigger. `shared/sim.ts` has no regrowth (`takeFrom` only
  removes stock), so this is almost certainly the renderer. Likely suspects:
  how the trunk height and crown are derived from `amt / init`; crown leaves
  from neighbouring trees overlapping the tree you aimed at; the aim mapping
  a leaf to the wrong tile; or instance slots being reassigned when
  `updateWorld` restacks, so voxels jump between trees. Reproduce it in a
  browser first, then fix the cause. A tree must visibly lose something on
  every successful hit, or at least never gain anything, and vanish when
  spent. The same goes for stone and ice stacks.

## What good looks like

- A new player opens a room, clicks once, and is standing in a meadow under
  a sky, with block trees in groves, a pond in a hollow, stone on the rise,
  and another player walking over. They chop a tree and watch its crown thin.
  They place a Furnace with a green outline, and a few minutes later the turf
  around it is visibly browner.
- It looks deliberate, not like a tech demo: consistent block sizes, no
  z-fighting stripes, no floating deposits, outlines that hug what you aim at.
- 60 fps on a laptop in the densest scene. Put measured frame time in
  `docs/TESTING.md`.

## What to leave alone

- The premise, the stages, the economy, `shared/sim.ts` rules, the ledger
  invariant (`initial = remaining + extracted + destroyed`), the endings, the
  protocol, and persistence. Browsers still only send intentions, and the
  server decides everything. Nothing here needs a `PROTOCOL_VERSION` or
  `SCHEMA_VERSION` bump. If you find one does, do it properly with a migration.
- Every rule under "What the game must never do" in `CLAUDE.md`, especially:
  user text renders only as text, and no deposit is ever unreachable (no
  collision is added, so walking stays unobstructed).
- The riff block at the top of `CLAUDE.md`.

## Finishing

- `spec/invariants.test.ts` stays green. `spec/page.test.ts`,
  `spec/marks.test.ts` and `spec/persistence.test.ts` encode the isometric
  brief. Update the parts that assume Canvas 2D or the old map sizes so they
  test the new first-person game, rather than deleting coverage.
  `pnpm check` must pass (`pnpm build && pnpm start` first) so the deploy goes
  out.
- Update `README.md` (controls), `docs/ARCHITECTURE.md` (three.js replaces
  Canvas 2D; why) and `docs/DESIGN.md` (sizes, placement, pacing) in the same
  commits as the behaviour.
- Delete `client/render.ts`'s drawing code once nothing uses it, keeping or
  moving the shared types.
- Keep `main` deployable, and delete this `prompt.md` in your last commit.

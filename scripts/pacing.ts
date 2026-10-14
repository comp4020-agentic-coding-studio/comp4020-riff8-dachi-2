// Headless pacing: N hand-harvest-only bots at normal pace, the slowest honest
// strategy, played straight through the simulation (no server, no socket).
// Prints when Earth ends and when the campaign ends, in minutes of play.
//   node scripts/pacing.ts [players...]   e.g. node scripts/pacing.ts 1 2 4
import { STAGES } from "../shared/content.ts";
import type { RoomState } from "../shared/protocol.ts";
import { applyCommand, createRoom, join, newChanges, tick, type Changes } from "../shared/sim.ts";

let n = 0;
const id = (): string => `p${n++}`;

function bot(s: RoomState, ch: Changes, pid: string): void {
  const p = s.players[pid];
  let best = -1;
  let bd = Infinity;
  s.tiles.forEach((t, i) => {
    if (!t.d || t.amt <= 0) return;
    const d = Math.hypot((i % s.w) - p.x, Math.floor(i / s.w) - p.y);
    if (d < bd) [bd, best] = [d, i];
  });
  if (best < 0) return;
  const x = best % s.w;
  const y = Math.floor(best / s.w);
  if (bd > 1.5) applyCommand(s, pid, id(), s.gen, { k: "move", dx: x - p.x, dy: y - p.y }, ch);
  else {
    applyCommand(s, pid, id(), s.gen, { k: "move", dx: 0, dy: 0 }, ch);
    applyCommand(s, pid, id(), s.gen, { k: "harvest", x, y }, ch);
  }
}

const minutes = (ticks: number): string => `${Math.round(ticks / 600)} min`;

for (const players of (process.argv.slice(2).length ? process.argv.slice(2) : ["1", "2", "4"]).map(Number)) {
  const s = createRoom("PACE", 7, "normal");
  const ch = newChanges();
  const ids = Array.from({ length: players }, (_, k) => `b${k}`);
  for (const p of ids) join(s, p, `tok-${p}`, p, ch);
  const ends: number[] = [];
  let gen = s.gen;
  while (s.phase.k !== "ended" && s.tick < 2_000_000) {
    if (s.phase.k === "play") for (const p of ids) bot(s, ch, p);
    tick(s, ch);
    if (s.gen !== gen) {
      ends.push(s.tick);
      gen = s.gen;
    }
  }
  const per = ends.map((t, k) => `${STAGES[k].name} ${minutes(t - (ends[k - 1] ?? 0))}`).join(", ");
  console.log(`${players} player(s): Earth ends ${minutes(ends[0] ?? s.tick)}, campaign ends ${minutes(s.tick)} (${per}, ${STAGES[STAGES.length - 1].name} ${minutes(s.tick - (ends[ends.length - 1] ?? 0))})`);
}

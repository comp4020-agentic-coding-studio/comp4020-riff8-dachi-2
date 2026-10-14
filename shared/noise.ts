// Seeded 2D Perlin noise, shared so the server's world generation and the
// browser's terrain heights read the same landscape from the same seed.
// Pure and deterministic: the same (seed, stage) always gives the same hills.

const fade = (t: number): number => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const cache = new Map<number, Uint8Array>();

function perm(seed: number): Uint8Array {
  let p = cache.get(seed);
  if (p) return p;
  const base = Array.from({ length: 256 }, (_, i) => i);
  let a = seed >>> 0;
  const r = (): number => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [base[i], base[j]] = [base[j], base[i]];
  }
  p = new Uint8Array(512);
  for (let i = 0; i < 512; i++) p[i] = base[i & 255];
  cache.set(seed, p);
  return p;
}

const grad = (h: number, x: number, y: number): number => {
  switch (h & 7) {
    case 0: return x + y;
    case 1: return -x + y;
    case 2: return x - y;
    case 3: return -x - y;
    case 4: return x;
    case 5: return -x;
    case 6: return y;
    default: return -y;
  }
};

/** Classic Perlin noise in roughly [-1, 1]. */
export function perlin(seed: number, x: number, y: number): number {
  const p = perm(seed);
  const xi = Math.floor(x) & 255;
  const yi = Math.floor(y) & 255;
  const xf = x - Math.floor(x);
  const yf = y - Math.floor(y);
  const u = fade(xf);
  const v = fade(yf);
  const aa = p[p[xi] + yi];
  const ab = p[p[xi] + yi + 1];
  const ba = p[p[xi + 1] + yi];
  const bb = p[p[xi + 1] + yi + 1];
  return lerp(lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u), lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u), v);
}

/** Fractal (layered) Perlin noise mapped to [0, 1]. */
export function fbm(seed: number, x: number, y: number, octaves = 4): number {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += perlin(seed + o * 1013, x * freq, y * freq) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return Math.max(0, Math.min(1, 0.5 + (sum / norm) * 0.75));
}

const stageSeed = (seed: number, stage: number, salt: number): number => (seed * 31 + stage * 7919 + salt * 104729) >>> 0;

/** The land's elevation at a tile, 0 (valley) to 1 (peak). */
export function elevation(seed: number, stage: number, x: number, y: number): number {
  return fbm(stageSeed(seed, stage, 1), x / 9, y / 9);
}

/** A second field, independent of elevation, that groves and ice follow. */
export function moisture(seed: number, stage: number, x: number, y: number, scale = 6): number {
  return fbm(stageSeed(seed, stage, 2), x / scale, y / scale, 3);
}

const RELIEF = [0, 0, 0, 0, 0]; // flat: the noise still shapes where stock lies, not the ground

/** Whole-block terrain height for a tile; water sits at 0, the lowest ground. */
export function blockHeight(seed: number, stage: number, x: number, y: number, terrain: number): number {
  if (terrain !== 0) return 0;
  const relief = RELIEF[stage] ?? 0;
  return 1 + Math.floor(elevation(seed, stage, x, y) * relief);
}

/*
 * 위상수학 · 평평한 우주 걷기: a square room whose edges are glued, seen from inside.
 * The plane is tiled by copies of the room; each copy is the image of the room under one
 * element of the deck group, and each copy of the start point is one loop class.
 * Free of DOM so the lesson's claims can be checked.
 *
 * Coordinates: (u, v) on the floor, u to the right and v forward. A tile (m, n) is the
 * square of side L centred at (mL, nL).
 */

export type GlueId = 'none' | 'cylinder' | 'torus' | 'klein';

/** Side of the square room. */
export const L = 4;

/** Deck transformation (u, v) ↦ (s·u + mL, v + nL); s = −1 is a mirror. */
export interface Deck {
  m: number;
  n: number;
  s: 1 | -1;
}

/** Klein bottle: crossing the top or bottom edge mirrors left and right. */
export const parity = (id: GlueId, n: number): 1 | -1 => (id === 'klein' && Math.abs(n) % 2 === 1 ? -1 : 1);

export const tileElement = (id: GlueId, m: number, n: number): Deck => ({ m, n, s: parity(id, n) });

export const applyDeck = (d: Deck, u: number, v: number): [number, number] => [d.s * u + d.m * L, v + d.n * L];

/** The copies of the room to draw around the origin, `R` tiles in every glued direction. */
export function tilesFor(id: GlueId, R: number): Deck[] {
  const out: Deck[] = [];
  const ms = id === 'none' ? [0] : range(-R, R);
  const ns = id === 'torus' ? range(-R, R) : id === 'klein' ? range(-R, R + 1) : [0];
  for (const n of ns) for (const m of ms) out.push(tileElement(id, m, n));
  return out;
}

function range(a: number, b: number): number[] {
  const out: number[] = [];
  for (let i = a; i <= b; i++) out.push(i);
  return out;
}

export const tileOf = (u: number, v: number): [number, number] => [Math.round(u / L), Math.round(v / L)];

/**
 * Keep the walker near the origin by moving it by a translation of the deck group, which leaves
 * the picture unchanged. Torus: by L either way. Klein bottle: by L sideways, but by 2L forward,
 * because one step of L forward is a glide reflection, not a translation; so the walker stays in
 * the two tiles n = 0 and n = 1. Returns the new position and how many tiles it was moved.
 */
export function recenter(id: GlueId, u: number, v: number): { u: number; v: number; dm: number; dn: number } {
  let dm = 0;
  let dn = 0;
  if (id !== 'none') {
    while (u > L / 2) (u -= L), dm++;
    while (u < -L / 2) (u += L), dm--;
  }
  if (id === 'torus') {
    while (v > L / 2) (v -= L), dn++;
    while (v < -L / 2) (v += L), dn--;
  } else if (id === 'klein') {
    while (v > (3 * L) / 2) (v -= 2 * L), (dn += 2);
    while (v < -L / 2) (v += 2 * L), (dn -= 2);
  }
  return { u, v, dm, dn };
}

/** Walls of the unglued edges keep the walker this far inside. */
export const WALL_GAP = 0.25;

/** Clamp to the room where an edge is a wall rather than glued. */
export function clampWalls(id: GlueId, u: number, v: number): [number, number] {
  const lim = L / 2 - WALL_GAP;
  if (id === 'none') u = Math.max(-lim, Math.min(lim, u));
  if (id === 'none' || id === 'cylinder') v = Math.max(-lim, Math.min(lim, v));
  return [u, v];
}

export type Loop = 'a' | 'A' | 'b' | 'B';

/**
 * One loop step from the centre of the tile (m, n): follow the room's own arrows across one edge.
 * α (a) crosses the right edge, β (b) the top edge; capitals are the inverses. In a mirrored copy
 * the room's "right" is the world's left, so α moves the other way.
 */
export function loopStep(id: GlueId, m: number, n: number, step: Loop): [number, number] {
  const s = parity(id, n);
  if (step === 'a') return [m + s, n];
  if (step === 'A') return [m - s, n];
  if (step === 'b') return [m, n + 1];
  return [m, n - 1];
}

/** Tile reached by walking a word of loop steps from the start tile. */
export function walkWord(id: GlueId, word: Loop[]): [number, number] {
  let t: [number, number] = [0, 0];
  for (const w of word) t = loopStep(id, t[0], t[1], w);
  return t;
}

const SUP: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
const power = (g: string, k: number) => (k === 0 ? '' : k === 1 ? g : g + String(k).split('').map((c) => SUP[c]).join(''));

/**
 * Name of the copy of the start point in tile (m, n): the loop "α^m, then β^n" ends there,
 * so every loop that ends there is homotopic to it.
 */
export const tileWord = (m: number, n: number) => power('α', m) + power('β', n) || 'e';

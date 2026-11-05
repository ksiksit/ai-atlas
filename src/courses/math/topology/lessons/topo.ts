/*
 * 위상수학 · 위상 공간: finite topological spaces on three points. No imports, so node can run it.
 * A subset of {a, b, c} is a bitmask 0..7 (a = 1, b = 2, c = 4); a family of subsets is a sorted
 * list of masks.
 */

export const N = 3;
export const FULL = (1 << N) - 1;
export const NAMES = ['a', 'b', 'c'];

export const setLabel = (m: number, names = NAMES) => (m === 0 ? '∅' : `{${names.filter((_, i) => m & (1 << i)).join(', ')}}`);
export const allSubsets = () => Array.from({ length: FULL + 1 }, (_, m) => m);
const popcount = (m: number) => (m & 1) + ((m >> 1) & 1) + ((m >> 2) & 1);
/** Subsets in a readable order: by size, then by members. */
export const SUBSET_ORDER = allSubsets().sort((x, y) => popcount(x) - popcount(y) || x - y);

export interface Check {
  ok: boolean;
  missingEnds: number[];
  /** Pairs (U, V) whose union / intersection is not in the family. */
  badUnion: [number, number, number][];
  badMeet: [number, number, number][];
}

/** Check the three axioms (∅ and X; unions; finite intersections). On a finite set, pairs suffice. */
export function check(fam: Set<number>): Check {
  const missingEnds = [0, FULL].filter((m) => !fam.has(m));
  const list = [...fam].sort((x, y) => x - y);
  const badUnion: [number, number, number][] = [];
  const badMeet: [number, number, number][] = [];
  for (let i = 0; i < list.length; i++)
    for (let j = i + 1; j < list.length; j++) {
      const u = list[i], v = list[j];
      if (!fam.has(u | v)) badUnion.push([u, v, u | v]);
      if (!fam.has(u & v)) badMeet.push([u, v, u & v]);
    }
  return { ok: missingEnds.length === 0 && badUnion.length === 0 && badMeet.length === 0, missingEnds, badUnion, badMeet };
}

/** The smallest topology containing the family: add ∅ and X, then close under ∪ and ∩. */
export function generate(fam: Iterable<number>): Set<number> {
  const out = new Set<number>([0, FULL, ...fam]);
  let grew = true;
  while (grew) {
    grew = false;
    const list = [...out];
    for (const u of list)
      for (const v of list)
        for (const w of [u | v, u & v])
          if (!out.has(w)) {
            out.add(w);
            grew = true;
          }
  }
  return out;
}

export const isTopology = (fam: Set<number>) => check(fam).ok;

/** Every topology on three points: 2^6 candidate families of the six middle subsets, filtered. */
export function allTopologies(): number[][] {
  const middle = SUBSET_ORDER.filter((m) => m !== 0 && m !== FULL);
  const out: number[][] = [];
  for (let k = 0; k < 1 << middle.length; k++) {
    const fam = new Set<number>([0, FULL]);
    middle.forEach((m, i) => k & (1 << i) && fam.add(m));
    if (isTopology(fam)) out.push(SUBSET_ORDER.filter((m) => fam.has(m)));
  }
  return out;
}

const PERMS = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
];
const permuteMask = (m: number, p: number[]) => p.reduce((acc, to, from) => (m & (1 << from) ? acc | (1 << to) : acc), 0);
const key = (fam: number[]) => [...fam].sort((x, y) => x - y).join(',');
/** A canonical name for a topology up to relabelling the points. */
export const canonical = (fam: number[]) => PERMS.map((p) => key(fam.map((m) => permuteMask(m, p)))).sort()[0];

export interface TopClass {
  /** A representative, in readable order. */
  rep: number[];
  /** How many of the 29 topologies relabel to this one. */
  count: number;
  members: number[][];
}

/** The 29 topologies grouped into the 9 shapes they take up to relabelling, coarse to fine. */
export function topologyClasses(): TopClass[] {
  const groups = new Map<string, number[][]>();
  for (const t of allTopologies()) {
    const k = canonical(t);
    groups.set(k, [...(groups.get(k) ?? []), t]);
  }
  return [...groups.values()]
    .map((members) => ({ rep: members[0], count: members.length, members }))
    .sort((x, y) => x.rep.length - y.rep.length || key(x.rep).localeCompare(key(y.rep)));
}

/* ───────── interior and closure in a finite space ───────── */

/** Interior: the union of the open sets inside A. */
export const interior = (fam: Set<number>, A: number) => [...fam].filter((U) => (U & A) === U).reduce((acc, U) => acc | U, 0);
/** Closure: the complement of the interior of the complement. */
export const closure = (fam: Set<number>, A: number) => FULL & ~interior(fam, FULL & ~A);

/* ───────── continuity of maps between finite spaces ───────── */

/** Preimage of V ⊆ Y under f (f[i] is the image of point i). */
export const preimage = (f: number[], V: number) => f.reduce((acc, y, i) => (V & (1 << y) ? acc | (1 << i) : acc), 0);

/** Open sets of Y whose preimage is not open in X; empty means f is continuous. */
export function continuityFailures(f: number[], TX: Set<number>, TY: Set<number>): { V: number; pre: number }[] {
  return [...TY].sort((x, y) => x - y).filter((V) => !TX.has(preimage(f, V))).map((V) => ({ V, pre: preimage(f, V) }));
}

/* ───────── presets ───────── */

export interface Preset {
  id: string;
  name: string;
  opens: number[];
}

export const PRESETS: Preset[] = [
  { id: 'indiscrete', name: '밀집 위상', opens: [0, FULL] },
  { id: 'sierpinski', name: '{a}만 더한 위상', opens: [0, 1, FULL] },
  { id: 'chain', name: '사슬 ∅ ⊂ {a} ⊂ {a, b} ⊂ X', opens: [0, 1, 3, FULL] },
  { id: 'split', name: '{a}, {b, c}로 나뉜 위상', opens: [0, 1, 6, FULL] },
  { id: 'discrete', name: '이산 위상', opens: allSubsets() },
];

/* ───────── rubber-sheet deformation ───────── */

/** The square [-1,1]² onto the unit disk (a homeomorphism), blended with the identity by t. */
export function squareToDisk(x: number, y: number, t: number): [number, number] {
  const u = x * Math.sqrt(1 - (y * y) / 2), v = y * Math.sqrt(1 - (x * x) / 2);
  return [x + (u - x) * t, y + (v - y) * t];
}

/** A wavy, stretched picture of the disk: still one-to-one and continuous both ways for |a| < 1. */
export function wobble(x: number, y: number, t: number): [number, number] {
  const r = Math.hypot(x, y), th = Math.atan2(y, x);
  const r2 = r * (1 + 0.28 * t * Math.sin(3 * th));
  // twist by the new radius, so the original angle can be read back: one-to-one
  const th2 = th + 0.9 * t * r2 * r2;
  return [r2 * Math.cos(th2) * (1 + 0.35 * t), r2 * Math.sin(th2)];
}

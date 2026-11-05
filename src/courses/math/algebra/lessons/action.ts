/*
 * 현대대수학 · 순열군과 군의 작용: permutations, the 8-puzzle invariant, necklaces and Burnside.
 * No imports, so node can run it directly. Permutations are 0-indexed arrays: p[i] is the image of i.
 */

export type Perm = number[];

export const identityPerm = (n: number): Perm => Array.from({ length: n }, (_, i) => i);

/** (p ∘ q)(i) = p(q(i)): apply q first, then p. */
export const compose = (p: Perm, q: Perm): Perm => q.map((qi) => p[qi]);

export function inversePerm(p: Perm): Perm {
  const r = new Array(p.length);
  p.forEach((v, i) => (r[v] = i));
  return r;
}

/** Cycles of length ≥ 2, each starting at its smallest element, in order of that element. */
export function cycles(p: Perm): number[][] {
  const seen = new Array(p.length).fill(false);
  const out: number[][] = [];
  for (let i = 0; i < p.length; i++) {
    if (seen[i]) continue;
    const c: number[] = [];
    let j = i;
    while (!seen[j]) {
      seen[j] = true;
      c.push(j);
      j = p[j];
    }
    if (c.length > 1) out.push(c);
  }
  return out;
}

/** Number of cycles counting fixed points as 1-cycles. */
export function cycleCount(p: Perm): number {
  const seen = new Array(p.length).fill(false);
  let k = 0;
  for (let i = 0; i < p.length; i++) {
    if (seen[i]) continue;
    k++;
    for (let j = i; !seen[j]; j = p[j]) seen[j] = true;
  }
  return k;
}

/** Fewest transpositions whose product is p: n − (number of cycles). */
export const transpositionCount = (p: Perm) => p.length - cycleCount(p);
export const sign = (p: Perm) => (transpositionCount(p) % 2 === 0 ? 1 : -1);

/** Cycle notation with 1-based labels, e.g. "(1 3 2)(4 5)", or "e" for the identity. */
export function cycleString(p: Perm, labels?: string[]): string {
  const cs = cycles(p);
  if (!cs.length) return 'e';
  const L = (i: number) => (labels ? labels[i] : String(i + 1));
  return cs.map((c) => `(${c.map(L).join(' ')})`).join('');
}

/** A product of transpositions equal to p: each k-cycle (a b c …) = (a b)(b c)…, applied right to left. */
export function asTranspositions(p: Perm): [number, number][] {
  const out: [number, number][] = [];
  for (const c of cycles(p)) for (let k = 0; k < c.length - 1; k++) out.push([c[k], c[k + 1]]);
  return out;
}

export const transposition = (n: number, a: number, b: number): Perm => {
  const t = identityPerm(n);
  t[a] = b;
  t[b] = a;
  return t;
};

/** Inversions: pairs i < j with p[i] > p[j]. Their parity equals the sign's. */
export function inversions(p: Perm): number {
  let k = 0;
  for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) if (p[i] > p[j]) k++;
  return k;
}

/* ───────── the 8-puzzle ───────── */

/** A board lists the tile on each of the 9 squares, row by row; 0 is the blank. Solved: 1..8 then 0. */
export type Board = number[];
export const W = 3;
export const SOLVED: Board = [1, 2, 3, 4, 5, 6, 7, 8, 0];

export const blankAt = (b: Board) => b.indexOf(0);

/** Squares the blank can move to (tiles that can slide into the blank). */
export function neighbours(sq: number): number[] {
  const r = Math.floor(sq / W), c = sq % W;
  const out: number[] = [];
  if (r > 0) out.push(sq - W);
  if (r < W - 1) out.push(sq + W);
  if (c > 0) out.push(sq - 1);
  if (c < W - 1) out.push(sq + 1);
  return out;
}

/** Slide the tile on square `sq` into the blank, if they are adjacent. */
export function slide(b: Board, sq: number): Board | null {
  const z = blankAt(b);
  if (!neighbours(z).includes(sq)) return null;
  const nb = b.slice();
  nb[z] = nb[sq];
  nb[sq] = 0;
  return nb;
}

export const swapSquares = (b: Board, i: number, j: number): Board => {
  const nb = b.slice();
  [nb[i], nb[j]] = [nb[j], nb[i]];
  return nb;
};

/**
 * The invariant. Read the board as a permutation of the 9 squares (the blank as tile 9): its sign,
 * times (−1)^(taxicab distance of the blank from its home square), never changes under a slide,
 * because a slide is one transposition that moves the blank one step. It is +1 for the solved board.
 */
export function invariant(b: Board): { perm: Perm; sign: number; blankDist: number; value: number } {
  const perm = b.map((t) => (t === 0 ? W * W - 1 : t - 1));
  const z = blankAt(b);
  const blankDist = Math.abs(Math.floor(z / W) - (W - 1)) + Math.abs((z % W) - (W - 1));
  const s = sign(perm);
  return { perm, sign: s, blankDist, value: s * (blankDist % 2 === 0 ? 1 : -1) };
}

/** Inversions among the 8 numbered tiles, read row by row, skipping the blank. */
export const tileInversions = (b: Board) => inversions(b.filter((t) => t !== 0));

/* Ranking boards 0..9!−1 (Lehmer code) so a whole-puzzle BFS fits in a typed array. */
const FACT = [1, 1, 2, 6, 24, 120, 720, 5040, 40320, 362880];
export function rank(b: Board): number {
  let r = 0;
  for (let i = 0; i < 9; i++) {
    let smaller = 0;
    for (let j = i + 1; j < 9; j++) if (b[j] < b[i]) smaller++;
    r += smaller * FACT[8 - i];
  }
  return r;
}

let DIST: Uint8Array | null = null;
/**
 * Distance (fewest slides) from every board to the solved one, by breadth-first search from the
 * solved board. 255 marks boards that can never be reached. Computed once, on first use.
 */
export function distances(): Uint8Array {
  if (DIST) return DIST;
  const d = new Uint8Array(362880).fill(255);
  let frontier: Board[] = [SOLVED];
  d[rank(SOLVED)] = 0;
  let depth = 0;
  while (frontier.length) {
    depth++;
    const next: Board[] = [];
    for (const b of frontier) {
      for (const sq of neighbours(blankAt(b))) {
        const nb = slide(b, sq)!;
        const k = rank(nb);
        if (d[k] === 255) {
          d[k] = depth;
          next.push(nb);
        }
      }
    }
    frontier = next;
  }
  DIST = d;
  return d;
}

/** Reachable count and the largest distance, for the prose. */
export function puzzleStats(): { reachable: number; maxDist: number } {
  const d = distances();
  let reachable = 0, maxDist = 0;
  for (const v of d)
    if (v !== 255) {
      reachable++;
      if (v > maxDist) maxDist = v;
    }
  return { reachable, maxDist };
}

/** A shortest solution as the list of squares to slide, or null if the board cannot be solved. */
export function solve(b: Board): number[] | null {
  const d = distances();
  if (d[rank(b)] === 255) return null;
  const path: number[] = [];
  let cur = b;
  while (d[rank(cur)] > 0) {
    const here = d[rank(cur)];
    for (const sq of neighbours(blankAt(cur))) {
      const nb = slide(cur, sq)!;
      if (d[rank(nb)] === here - 1) {
        path.push(sq);
        cur = nb;
        break;
      }
    }
  }
  return path;
}

/** A solvable start: `steps` random slides from the solved board, never undoing the last one. */
export function scramble(steps: number, rand: () => number): Board {
  let b = SOLVED.slice();
  let prev = -1;
  for (let k = 0; k < steps; k++) {
    const opts = neighbours(blankAt(b)).filter((s) => s !== prev);
    const sq = opts[Math.floor(rand() * opts.length)];
    prev = blankAt(b);
    b = slide(b, sq)!;
  }
  return b;
}

/* ───────── necklaces: the dihedral group acting on colourings of n beads ───────── */

/**
 * The symmetries of an n-bead necklace. Rotation r^k sends bead i to i + k; reflection s r^k sends
 * bead i to k − i (all mod n). With `flips` false, only the n rotations.
 */
export interface Sym {
  name: string;
  /** TeX label. */
  tex: string;
  perm: Perm;
  kind: 'rot' | 'flip';
}

export function necklaceGroup(n: number, flips: boolean): Sym[] {
  const out: Sym[] = [];
  for (let k = 0; k < n; k++)
    out.push({ name: k === 0 ? '그대로' : `${(360 * k) / n}° 회전`, tex: k === 0 ? 'e' : k === 1 ? 'r' : `r^{${k}}`, perm: Array.from({ length: n }, (_, i) => (i + k) % n), kind: 'rot' });
  if (flips)
    for (let k = 0; k < n; k++)
      out.push({ name: `뒤집기 ${k + 1}`, tex: k === 0 ? 's' : k === 1 ? 'sr' : `sr^{${k}}`, perm: Array.from({ length: n }, (_, i) => (((k - i) % n) + n) % n), kind: 'flip' });
  return out;
}

/** A colouring is a list of colour indices, one per bead. g moves the colour on bead i to bead g(i). */
export function act(g: Perm, col: number[]): number[] {
  const out = new Array(col.length);
  for (let i = 0; i < col.length; i++) out[g[i]] = col[i];
  return out;
}

export const key = (col: number[]) => col.join('');

/** The orbit (distinct colourings reachable by the group) and the stabilizer (elements fixing it). */
export function orbitStabilizer(G: Sym[], col: number[]): { orbit: number[][]; stabilizer: Sym[] } {
  const seen = new Map<string, number[]>();
  for (const g of G) {
    const c = act(g.perm, col);
    if (!seen.has(key(c))) seen.set(key(c), c);
  }
  return { orbit: [...seen.values()], stabilizer: G.filter((g) => key(act(g.perm, col)) === key(col)) };
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/** Colourings fixed by g: one colour per cycle of g (fixed points count as cycles), so k^(cycles). */
export const fixedCount = (g: Perm, k: number) => Math.pow(k, cycleCount(g));

/** Burnside: the number of orbits is the average number of fixed colourings. */
export function burnside(n: number, k: number, flips: boolean): { rows: { sym: Sym; cyc: number; fixed: number }[]; total: number; orbits: number } {
  const G = necklaceGroup(n, flips);
  const rows = G.map((sym) => ({ sym, cyc: cycleCount(sym.perm), fixed: fixedCount(sym.perm, k) }));
  const total = rows.reduce((a, r) => a + r.fixed, 0);
  return { rows, total, orbits: total / G.length };
}

/** For rotations the cycle count of r^j is gcd(n, j); exported for the prose. */
export const rotationCycles = (n: number, j: number) => gcd(n, j === 0 ? n : j);

/** Brute force: list all k^n colourings and count distinct orbits. Only for small k^n. */
export function bruteForceOrbits(n: number, k: number, flips: boolean): number | null {
  const total = Math.pow(k, n);
  if (total > 300000) return null;
  const G = necklaceGroup(n, flips);
  const seen = new Set<string>();
  let orbits = 0;
  const col = new Array(n).fill(0);
  for (let m = 0; m < total; m++) {
    let x = m;
    for (let i = 0; i < n; i++) {
      col[i] = x % k;
      x = Math.floor(x / k);
    }
    const kk = key(col);
    if (seen.has(kk)) continue;
    orbits++;
    for (const g of G) seen.add(key(act(g.perm, col)));
  }
  return orbits;
}

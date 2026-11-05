/*
 * 위상수학 · 거리 공간: pure helpers for the lesson's figures. No imports, so node can run it.
 */

/** The p-distance on the plane; p = Infinity is the maximum distance. */
export function pDist(ax: number, ay: number, bx: number, by: number, p: number): number {
  const dx = Math.abs(ax - bx), dy = Math.abs(ay - by);
  if (!isFinite(p)) return Math.max(dx, dy);
  if (p === 1) return dx + dy;
  return Math.pow(Math.pow(dx, p) + Math.pow(dy, p), 1 / p);
}

/** Points on the boundary of the p-unit ball, by scaling each direction to p-length 1. */
export function unitBall(p: number, n = 240): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * Math.PI * 2;
    const c = Math.cos(t), s = Math.sin(t);
    const len = pDist(0, 0, c, s, p);
    out.push([c / len, s / len]);
  }
  return out;
}

/* ───────── sets in the plane, for "is there a ball inside?" ───────── */

export type SetId = 'disk' | 'square' | 'notop';

export interface PlaneSet {
  id: SetId;
  name: string;
  /** Signed Euclidean distance to the set's boundary: negative inside, positive outside. */
  sd: (x: number, y: number) => number;
  /** Is the point a member of the set? (Differs from sd < 0 on the boundary.) */
  contains: (x: number, y: number) => boolean;
  /** Is the set open / closed? */
  open: boolean;
  closed: boolean;
  /** Nearest point on the boundary, for snapping. */
  snap: (x: number, y: number) => [number, number];
}

const boxSd = (x: number, y: number) => {
  const qx = Math.abs(x) - 1, qy = Math.abs(y) - 1;
  const out = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  return out + Math.min(Math.max(qx, qy), 0);
};
const boxSnap = (x: number, y: number): [number, number] => {
  const cx = Math.max(-1, Math.min(1, x)), cy = Math.max(-1, Math.min(1, y));
  if (Math.abs(cx) < 1 && Math.abs(cy) < 1) {
    // inside: push to the nearest edge
    const d = [1 - cx, cx + 1, 1 - cy, cy + 1];
    const k = d.indexOf(Math.min(...d));
    return k === 0 ? [1, cy] : k === 1 ? [-1, cy] : k === 2 ? [cx, 1] : [cx, -1];
  }
  return [cx, cy];
};

export const SETS: PlaneSet[] = [
  {
    id: 'disk',
    name: '열린 원판 |p| < 1',
    sd: (x, y) => Math.hypot(x, y) - 1,
    contains: (x, y) => Math.hypot(x, y) < 1,
    open: true,
    closed: false,
    snap: (x, y) => {
      const r = Math.hypot(x, y) || 1;
      return [x / r, y / r];
    },
  },
  {
    id: 'square',
    name: '닫힌 정사각형 [−1, 1]²',
    sd: boxSd,
    contains: (x, y) => Math.max(Math.abs(x), Math.abs(y)) <= 1,
    open: false,
    closed: true,
    snap: boxSnap,
  },
  {
    id: 'notop',
    name: '윗변이 빠진 정사각형',
    sd: boxSd,
    // the top edge (y = 1) is left out; the other three edges are kept
    contains: (x, y) => Math.abs(x) <= 1 && y >= -1 && y < 1,
    open: false,
    closed: false,
    snap: boxSnap,
  },
];

export type PointKind = 'interior' | 'boundary' | 'exterior';

/** Classify a point and give the largest ball (Euclidean) inside the set or inside its complement. */
export function classify(S: PlaneSet, x: number, y: number, tol = 1e-9): { kind: PointKind; r: number; member: boolean } {
  const d = S.sd(x, y);
  const member = S.contains(x, y);
  if (d < -tol) return { kind: 'interior', r: -d, member };
  if (d > tol) return { kind: 'exterior', r: d, member };
  return { kind: 'boundary', r: 0, member };
}

/* ───────── distances between words ───────── */

/** Levenshtein distance: fewest one-letter insertions, deletions and substitutions. */
export function editDistance(a: string, b: string): number {
  const A = [...a], B = [...b];
  let prev = Array.from({ length: B.length + 1 }, (_, j) => j);
  for (let i = 1; i <= A.length; i++) {
    const cur = [i];
    for (let j = 1; j <= B.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (A[i - 1] === B[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[B.length];
}

/** Hamming distance: positions that differ. Only defined for equal lengths (null otherwise). */
export function hamming(a: string, b: string): number | null {
  const A = [...a], B = [...b];
  if (A.length !== B.length) return null;
  return A.reduce((n, ch, i) => n + (ch === B[i] ? 0 : 1), 0);
}

/* ───────── subsets of the real line ───────── */

export interface LineSet {
  id: string;
  name: string;
  interior: string;
  closure: string;
  boundary: string;
  open: boolean;
  closed: boolean;
}

export const LINE_SETS: LineSet[] = [
  { id: 'halfopen', name: '(0, 1]', interior: '(0, 1)', closure: '[0, 1]', boundary: '{0, 1}', open: false, closed: false },
  { id: 'recip', name: '{1, 1/2, 1/3, …}', interior: '∅', closure: '{0, 1, 1/2, 1/3, …}', boundary: '{0, 1, 1/2, 1/3, …}', open: false, closed: false },
  { id: 'ints', name: 'ℤ', interior: '∅', closure: 'ℤ', boundary: 'ℤ', open: false, closed: true },
  { id: 'rationals', name: 'ℚ ∩ [0, 1]', interior: '∅', closure: '[0, 1]', boundary: '[0, 1]', open: false, closed: false },
  { id: 'line', name: 'ℝ', interior: 'ℝ', closure: 'ℝ', boundary: '∅', open: true, closed: true },
];

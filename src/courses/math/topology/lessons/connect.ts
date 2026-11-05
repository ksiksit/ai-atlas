/* 위상수학 · 연결성: pure logic for the figures (no React, no DOM). */

import { rng } from '../../../../lib/math';

/* ───────── Figure 1: shapes on a grid and their pieces ───────── */

export const GW = 72;
export const GH = 40;
/** Cell size in world units; the grid covers x ∈ [−3.6, 3.6], y ∈ [−2, 2]. */
export const CELL = 0.1;
export const XMIN = -3.6;
export const YMAX = 2;

export type ShapeId = 'disks' | 'dumbbell' | 'cut' | 'annulus';

export const SHAPES: { id: ShapeId; name: string }[] = [
  { id: 'disks', name: '두 원판' },
  { id: 'dumbbell', name: '아령' },
  { id: 'cut', name: '다리 끊긴 아령' },
  { id: 'annulus', name: '고리' },
];

/** Centre of cell (i, j) in world coordinates; j counts down from the top. */
export const cellCenter = (i: number, j: number): [number, number] => [XMIN + (i + 0.5) * CELL, YMAX - (j + 0.5) * CELL];

/**
 * Whether the point (x, y) belongs to the shape.
 * `gap` is the width of the cut in the bridge; `cuts` is the number of radial slits in the ring.
 */
export function inShape(id: ShapeId, x: number, y: number, gap: number, cuts: number): boolean {
  const disk = (cx: number) => (x - cx) ** 2 + y ** 2 <= 1;
  const bar = Math.abs(y) <= 0.18 && Math.abs(x) <= 1.8;
  switch (id) {
    case 'disks':
      return disk(-1.9) || disk(1.9);
    case 'dumbbell':
      return disk(-1.8) || disk(1.8) || bar;
    case 'cut':
      return disk(-1.8) || disk(1.8) || (bar && Math.abs(x) > gap / 2);
    case 'annulus': {
      const r = Math.hypot(x, y);
      if (r < 1 || r > 1.85) return false;
      // slits of width 0.25 along evenly spaced directions, starting straight up
      for (let k = 0; k < cuts; k++) {
        const a = Math.PI / 2 + (2 * Math.PI * k) / Math.max(1, cuts);
        const along = x * Math.cos(a) + y * Math.sin(a);
        const across = -x * Math.sin(a) + y * Math.cos(a);
        if (along > 0 && Math.abs(across) < 0.125) return false;
      }
      return true;
    }
  }
}

/** The grid of filled cells for a shape. */
export function shapeGrid(id: ShapeId, gap: number, cuts: number): Uint8Array {
  const g = new Uint8Array(GW * GH);
  for (let j = 0; j < GH; j++)
    for (let i = 0; i < GW; i++) {
      const [x, y] = cellCenter(i, j);
      g[j * GW + i] = inShape(id, x, y, gap, cuts) ? 1 : 0;
    }
  return g;
}

/**
 * Label the pieces of a grid by flood fill: two filled cells are in the same piece when a chain of
 * filled cells sharing edges joins them. Returns a label per cell (−1 for empty) and the piece sizes.
 */
export function components(g: Uint8Array): { label: Int16Array; sizes: number[] } {
  const label = new Int16Array(GW * GH).fill(-1);
  const sizes: number[] = [];
  const stack: number[] = [];
  for (let s = 0; s < GW * GH; s++) {
    if (!g[s] || label[s] >= 0) continue;
    const id = sizes.length;
    let n = 0;
    label[s] = id;
    stack.push(s);
    while (stack.length) {
      const c = stack.pop()!;
      n++;
      const i = c % GW, j = (c - i) / GW;
      const nb = [i > 0 ? c - 1 : -1, i < GW - 1 ? c + 1 : -1, j > 0 ? c - GW : -1, j < GH - 1 ? c + GW : -1];
      for (const d of nb)
        if (d >= 0 && g[d] && label[d] < 0) {
          label[d] = id;
          stack.push(d);
        }
    }
    sizes.push(n);
  }
  return { label, sizes };
}

/* ───────── Figure 2: the image of a connected set ───────── */

export const f2 = (x: number) => 0.2 + 0.6 * x + 0.15 * Math.sin(7 * x);

export type DomainId = 'whole' | 'split';
/** The domain as a list of closed intervals. */
export const DOMAINS: Record<DomainId, [number, number][]> = {
  whole: [[0, 1]],
  split: [
    [0, 0.35],
    [0.65, 1],
  ],
};

/** The image of each interval under f2, found by dense sampling (f2 is smooth, so this is accurate to ~1e-6). */
export function images(dom: [number, number][]): [number, number][] {
  return dom.map(([a, b]) => {
    let lo = Infinity, hi = -Infinity;
    const n = 4000;
    for (let k = 0; k <= n; k++) {
      const v = f2(a + ((b - a) * k) / n);
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
    return [lo, hi] as [number, number];
  });
}

/** All x in the domain with f2(x) = c, by scanning for sign changes and bisecting. */
export function preimages(dom: [number, number][], c: number): number[] {
  const out: number[] = [];
  for (const [a, b] of dom) {
    const n = 2000;
    let x0 = a, v0 = f2(a) - c;
    if (v0 === 0) out.push(a);
    for (let k = 1; k <= n; k++) {
      const x1 = a + ((b - a) * k) / n, v1 = f2(x1) - c;
      if (v1 === 0) out.push(x1);
      else if (v0 * v1 < 0) {
        let lo = x0, hi = x1;
        for (let it = 0; it < 50; it++) {
          const m = (lo + hi) / 2;
          if ((f2(lo) - c) * (f2(m) - c) <= 0) hi = m;
          else lo = m;
        }
        out.push((lo + hi) / 2);
      }
      x0 = x1;
      v0 = v1;
    }
  }
  return out;
}

/* ───────── Figure 3: the topologist's sine curve ───────── */

/** Zeros of sin(1/x) in [ε, 1]: x = 1/(nπ) for n = 1 … ⌊1/(πε)⌋. */
export const zerosFrom = (eps: number) => Math.floor(1 / (Math.PI * eps));

/**
 * Length of the curve y = sin(1/x) from x = ε to x = 1. Integrated in t = 1/x, where the curve is
 * y = sin t and dx = −dt/t², so the length is ∫ √(1/t⁴ + cos² t) dt over t ∈ [1, 1/ε].
 */
export function arcLength(eps: number): number {
  const T = 1 / eps;
  const n = Math.max(2000, Math.ceil((T - 1) * 40));
  const g = (t: number) => Math.sqrt(1 / t ** 4 + Math.cos(t) ** 2);
  const h = (T - 1) / n;
  let s = g(1) + g(T);
  for (let k = 1; k < n; k++) s += (k % 2 ? 4 : 2) * g(1 + k * h);
  return (s * h) / 3;
}

/* ───────── Figure 4a: opposite points with equal temperature ───────── */

/** A smooth temperature around a circle: a seeded sum of a few Fourier modes, in °C around 15. */
export function temperature(seed: number): (theta: number) => number {
  const r = rng(seed);
  const modes = [1, 2, 3, 4].map((k) => ({ k, a: (r() * 2 - 1) * (8 / k), b: (r() * 2 - 1) * (8 / k) }));
  return (th) => 15 + modes.reduce((s, m) => s + m.a * Math.cos(m.k * th) + m.b * Math.sin(m.k * th), 0);
}

/** g(θ) = T(θ) − T(θ + π) changes sign on [0, π] because g(π) = −g(0); bisect for the first zero. */
export function antipodal(T: (th: number) => number): { theta: number; temp: number; g0: number } {
  const g = (th: number) => T(th) - T(th + Math.PI);
  const g0 = g(0);
  const n = 720;
  let a = 0;
  for (let k = 1; k <= n; k++) {
    const b = (Math.PI * k) / n;
    if (g(a) === 0) break;
    if (g(a) * g(b) <= 0) {
      let lo = a, hi = b;
      for (let it = 0; it < 60; it++) {
        const m = (lo + hi) / 2;
        if (g(lo) * g(m) <= 0) hi = m;
        else lo = m;
      }
      a = (lo + hi) / 2;
      break;
    }
    a = b;
  }
  return { theta: a, temp: T(a), g0 };
}

/* ───────── Figure 4b: one line cutting two pancakes in half ───────── */

export type Pt = [number, number];

/** Two pancakes as clouds of grid points: an ellipse and a crescent, so neither is symmetric about the other. */
export function pancakes(): { A: Pt[]; B: Pt[] } {
  const A: Pt[] = [], B: Pt[] = [];
  const s = 0.05;
  for (let x = -3; x <= 3 + 1e-9; x += s)
    for (let y = -2; y <= 2 + 1e-9; y += s) {
      // A: a tilted ellipse on the left
      const u = (x + 1.3) * Math.cos(0.5) + (y - 0.3) * Math.sin(0.5);
      const v = -(x + 1.3) * Math.sin(0.5) + (y - 0.3) * Math.cos(0.5);
      if ((u / 1.2) ** 2 + (v / 0.7) ** 2 <= 1) A.push([x, y]);
      // B: a crescent on the right (a disk minus a shifted disk)
      if ((x - 1.4) ** 2 + (y + 0.4) ** 2 <= 1.0 && (x - 1.75) ** 2 + (y + 0.15) ** 2 > 0.55) B.push([x, y]);
    }
  return { A, B };
}

/** For a direction φ (the line's normal), the offset t where the line {p·n = t} halves A, and B's share on the + side. */
export function cutAt(A: Pt[], B: Pt[], phi: number): { t: number; shareB: number } {
  const nx = Math.cos(phi), ny = Math.sin(phi);
  const pa = A.map(([x, y]) => x * nx + y * ny).sort((a, b) => a - b);
  const m = pa.length;
  const t = m % 2 ? pa[(m - 1) / 2] : (pa[m / 2 - 1] + pa[m / 2]) / 2;
  let plus = 0;
  for (const [x, y] of B) if (x * nx + y * ny > t) plus++;
  return { t, shareB: plus / B.length };
}

/** h(φ) = share of B on the + side − 1/2 satisfies h(φ + π) = −h(φ); find where it crosses 0 in [0, π]. */
export function sandwich(A: Pt[], B: Pt[]): { phi: number; t: number; shareB: number; h0: number } {
  const h = (p: number) => cutAt(A, B, p).shareB - 0.5;
  const h0 = h(0);
  const n = 360;
  let prev = 0, hp = h0;
  for (let k = 1; k <= n; k++) {
    const p = (Math.PI * k) / n, hv = h(p);
    if (hp === 0) break;
    if (hp * hv <= 0) {
      let lo = prev, hi = p;
      for (let it = 0; it < 40; it++) {
        const mid = (lo + hi) / 2;
        if (h(lo) * h(mid) <= 0) hi = mid;
        else lo = mid;
      }
      prev = (lo + hi) / 2;
      break;
    }
    prev = p;
    hp = hv;
  }
  const c = cutAt(A, B, prev);
  return { phi: prev, t: c.t, shareB: c.shareB, h0 };
}

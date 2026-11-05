/* 미적분학 · 극한과 연속: pure helpers for the figures (no imports, so node can run them). */

export interface LimitFn {
  id: string;
  /** Formula shown in the figure (KaTeX). */
  tex: string;
  f: (x: number) => number;
  /** The point x approaches. */
  a: number;
  /** The limit, or null when it does not exist. */
  L: number | null;
  /** Plot window half-widths at zoom 0. */
  xr: number;
  yLo: number;
  yHi: number;
}

/** Functions with a hole at the point: f(a) is undefined but the limit exists. */
export const HOLES: LimitFn[] = [
  { id: 'sinc', tex: '\\dfrac{\\sin x}{x}', f: (x) => (x === 0 ? NaN : Math.sin(x) / x), a: 0, L: 1, xr: 8, yLo: -0.4, yHi: 1.3 },
  { id: 'quot', tex: '\\dfrac{x^2-1}{x-1}', f: (x) => (x === 1 ? NaN : (x * x - 1) / (x - 1)), a: 1, L: 2, xr: 3, yLo: -1, yHi: 5 },
];

/** Values of f at a ± 10^-k, for the approach table. */
export function approachTable(fn: LimitFn, ks = [1, 2, 3, 4]) {
  return ks.map((k) => {
    const h = Math.pow(10, -k);
    return { h, left: fn.f(fn.a - h), right: fn.f(fn.a + h) };
  });
}

/* ───────── the ε-δ game ───────── */

export interface EpsDeltaResult {
  ok: boolean;
  /** Largest |f(x) − L| over the sampled x with 0 < |x − a| < δ. */
  maxDev: number;
  /** Where that largest deviation happens. */
  worstX: number;
  /** Sampled x values that leave the band (for drawing). */
  bad: number[];
}

/**
 * Check numerically whether every x with 0 < |x − a| < δ keeps f(x) within ε of L.
 * Samples n points on each side, up to δ·(n−1)/n so the open interval stays open.
 */
export function checkEpsDelta(f: (x: number) => number, a: number, L: number, eps: number, delta: number, n = 400): EpsDeltaResult {
  let maxDev = 0;
  let worstX = a;
  const bad: number[] = [];
  for (const side of [-1, 1]) {
    for (let k = 1; k < n; k++) {
      const x = a + side * (delta * k) / n;
      const d = Math.abs(f(x) - L);
      if (!isFinite(d)) continue;
      if (d > maxDev) {
        maxDev = d;
        worstX = x;
      }
      if (d >= eps) bad.push(x);
    }
  }
  return { ok: bad.length === 0, maxDev, worstX, bad };
}

/** For f(x) = x² at a = 2 (L = 4): the largest δ that works for a given ε, √(4+ε) − 2. */
export const bestDeltaSquare = (eps: number) => Math.min(Math.sqrt(4 + eps) - 2, 2 - Math.sqrt(Math.max(0, 4 - eps)));

/* ───────── when the limit fails ───────── */

export interface FailCase {
  id: string;
  name: string;
  tex: string;
  f: (x: number) => number;
  a: number;
  /** Left and right limits (null: does not exist, ±Infinity: blows up). */
  left: number | null;
  right: number | null;
  /** f(a) itself, or null if undefined. */
  value: number | null;
  xr: number;
  yLo: number;
  yHi: number;
}

export const FAILS: FailCase[] = [
  { id: 'jump', name: '점프', tex: 'f(x)=\\begin{cases}x & x<1\\\\ x+1 & x\\ge 1\\end{cases}', f: (x) => (x < 1 ? x : x + 1), a: 1, left: 1, right: 2, value: 2, xr: 2, yLo: -1, yHi: 4 },
  { id: 'osc', name: '진동', tex: 'f(x)=\\sin\\dfrac{1}{x}', f: (x) => (x === 0 ? NaN : Math.sin(1 / x)), a: 0, left: null, right: null, value: null, xr: 0.5, yLo: -1.5, yHi: 1.5 },
  { id: 'blow', name: '발산', tex: 'f(x)=\\dfrac{1}{x}', f: (x) => (x === 0 ? NaN : 1 / x), a: 0, left: -Infinity, right: Infinity, value: null, xr: 2, yLo: -8, yHi: 8 },
  { id: 'hole', name: '구멍', tex: 'f(x)=\\begin{cases}\\dfrac{x^2-1}{x-1} & x\\ne 1\\\\ 3 & x=1\\end{cases}', f: (x) => (x === 1 ? 3 : (x * x - 1) / (x - 1)), a: 1, left: 2, right: 2, value: 3, xr: 2, yLo: -1, yHi: 5 },
];

/* ───────── bisection ───────── */

export interface BisectFrame {
  lo: number;
  hi: number;
  mid: number;
  fLo: number;
  fHi: number;
  fMid: number;
  /** Which half is kept after evaluating the midpoint ('left' keeps [lo, mid]). */
  keep: 'left' | 'right' | 'done';
}

/** Bisection on [lo, hi] where f(lo) and f(hi) have opposite signs. Frame k shows the k-th midpoint. */
export function bisect(f: (x: number) => number, lo: number, hi: number, steps: number): BisectFrame[] {
  const out: BisectFrame[] = [];
  for (let k = 0; k < steps; k++) {
    const mid = (lo + hi) / 2;
    const fLo = f(lo), fHi = f(hi), fMid = f(mid);
    const keep: BisectFrame['keep'] = fMid === 0 ? 'done' : Math.sign(fMid) === Math.sign(fLo) ? 'right' : 'left';
    out.push({ lo, hi, mid, fLo, fHi, fMid, keep });
    if (keep === 'done') break;
    if (keep === 'right') lo = mid;
    else hi = mid;
  }
  return out;
}

export const cubic = (x: number) => x * x * x - x - 2;

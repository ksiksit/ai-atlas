/* 해석학 · 연속 함수: pure helpers for the figures (no imports, so node can run them). */

export type FnId = 'sq' | 'sqrt' | 'inv' | 'xsin';

export interface ContFn {
  id: FnId;
  name: string;
  tex: string;
  f: (x: number) => number;
  /** Domain [lo, hi]; `openLo` means lo itself is excluded. */
  lo: number;
  hi: number;
  openLo?: boolean;
  /** Default point and plotting window. */
  a: number;
  yLo: number;
  yHi: number;
  /** Is it uniformly continuous on this domain? */
  uniform: boolean;
}

export const xsin = (x: number) => (x === 0 ? 0 : x * Math.sin(1 / x));

export const FNS: ContFn[] = [
  { id: 'inv', name: '1/x, (0, 2]', tex: 'f(x) = \\tfrac{1}{x}', f: (x) => 1 / x, lo: 0, hi: 2, openLo: true, a: 1, yLo: 0, yHi: 6, uniform: false },
  { id: 'sq', name: 'x², [0, 2]', tex: 'f(x) = x^2', f: (x) => x * x, lo: 0, hi: 2, a: 1, yLo: 0, yHi: 4.4, uniform: true },
  { id: 'sqrt', name: '√x, [0, 2]', tex: 'f(x) = \\sqrt{x}', f: (x) => Math.sqrt(Math.max(0, x)), lo: 0, hi: 2, a: 1, yLo: 0, yHi: 1.6, uniform: true },
  { id: 'xsin', name: 'x·sin(1/x), [−1, 1]', tex: 'f(x) = x\\sin\\tfrac{1}{x},\\ f(0)=0', f: xsin, lo: -1, hi: 1, a: 0.3, yLo: -0.6, yHi: 0.9, uniform: true },
];

/**
 * The largest δ such that every x in the domain with |x − a| < δ has |f(x) − f(a)| < ε.
 * Monotone functions get it in closed form from the inverse; x·sin(1/x) is searched on a fine grid.
 * Capped at `cap` (the width of the domain), since beyond that δ changes nothing.
 */
export function largestDelta(fn: ContFn, a: number, eps: number): number {
  const cap = fn.hi - fn.lo;
  const fa = fn.f(a);
  if (fn.id === 'sq') {
    const right = Math.sqrt(fa + eps) - a;
    const left = fa - eps <= 0 ? Infinity : a - Math.sqrt(fa - eps);
    return Math.min(cap, right, left);
  }
  if (fn.id === 'sqrt') {
    const right = (Math.sqrt(a) + eps) ** 2 - a;
    const left = Math.sqrt(a) - eps <= 0 ? Infinity : a - (Math.sqrt(a) - eps) ** 2;
    return Math.min(cap, right, left);
  }
  if (fn.id === 'inv') {
    // 1/x decreases: |1/x − 1/a| < ε  ⇔  1/(1/a + ε) < x < 1/(1/a − ε)
    const left = a - 1 / (1 / a + eps);
    const right = 1 / a - eps <= 0 ? Infinity : 1 / (1 / a - eps) - a;
    return Math.min(cap, left, right);
  }
  // x·sin(1/x): walk outward from a on a fine grid until the first point that leaves the band
  const step = 1e-5;
  let d = 0;
  while (d < cap) {
    const n = d + step;
    const xs = [a - n, a + n].filter((x) => x >= fn.lo && x <= fn.hi);
    if (xs.some((x) => Math.abs(fn.f(x) - fa) >= eps)) return d;
    d = n;
  }
  return cap;
}

/** δ(a) across the domain, and its smallest value (0 in the limit if not uniformly continuous). */
export function deltaProfile(fn: ContFn, eps: number, samples = 160): { a: number; d: number }[] {
  const out: { a: number; d: number }[] = [];
  const lo = fn.openLo ? fn.lo + (fn.hi - fn.lo) / (samples * 4) : fn.lo;
  for (let i = 0; i <= samples; i++) {
    const a = lo + ((fn.hi - lo) * i) / samples;
    out.push({ a, d: largestDelta(fn, a, eps) });
  }
  return out;
}

/* ───────── intermediate value theorem by c = sup{x : f(x) < 0} ───────── */

export type IvtId = 'wavy' | 'jump';

export const IVT = {
  lo: 0,
  hi: 3,
  /** Continuous, negative at 0 and positive at 3, crossing zero three times. */
  wavy: (x: number) => 0.9 * Math.sin(2.4 * x) + 0.55 * x - 0.6,
  /** Same picture, but it jumps over zero at x = 1.6 instead of crossing it. */
  jump: (x: number) => (x < 1.6 ? -0.35 - 0.1 * Math.cos(3 * x) : 0.45 + 0.1 * Math.sin(3 * x)),
};

/** c = sup{x ∈ [lo, hi] : f(x) < 0}, found as the last sign change on a fine grid then refined. */
export function supNegative(f: (x: number) => number, lo: number, hi: number, n = 30000): number {
  let last = lo;
  for (let i = 0; i <= n; i++) {
    const x = lo + ((hi - lo) * i) / n;
    if (f(x) < 0) last = x;
  }
  // refine between `last` (negative) and the next grid point by bisection
  let a = last, b = Math.min(hi, last + (hi - lo) / n);
  for (let k = 0; k < 60; k++) {
    const m = (a + b) / 2;
    if (f(m) < 0) a = m;
    else b = m;
  }
  return (a + b) / 2;
}

/** The set {x : f(x) < 0} as intervals, from a fine grid. */
export function negativeIntervals(f: (x: number) => number, lo: number, hi: number, n = 3000): [number, number][] {
  const out: [number, number][] = [];
  let start: number | null = null;
  for (let i = 0; i <= n; i++) {
    const x = lo + ((hi - lo) * i) / n;
    const neg = f(x) < 0;
    if (neg && start === null) start = x;
    if (!neg && start !== null) {
      out.push([start, x]);
      start = null;
    }
  }
  if (start !== null) out.push([start, hi]);
  return out;
}

/* ───────── extreme value theorem: what each hypothesis buys ───────── */

export type EvtId = 'ok' | 'open' | 'unbounded' | 'jump';

export interface EvtCase {
  id: EvtId;
  label: string;
  tex: string;
  f: (x: number) => number;
  lo: number;
  hi: number;
  openLo: boolean;
  openHi: boolean;
  yMax: number;
  /** sup f (Infinity if unbounded) and whether some x attains it. */
  sup: number;
  attained: boolean;
  why: string;
}

export const EVT: EvtCase[] = [
  { id: 'ok', label: '닫힌 구간, 연속', tex: 'x(2-x)+0.3\\ \\text{on}\\ [0,2]', f: (x) => x * (2 - x) + 0.3, lo: 0, hi: 2, openLo: false, openHi: false, yMax: 2.2, sup: 1.3, attained: true, why: 'x = 1에서 최댓값 1.3을 가집니다.' },
  { id: 'open', label: '열린 구간', tex: 'x\\ \\text{on}\\ (0,2)', f: (x) => x, lo: 0, hi: 2, openLo: true, openHi: true, yMax: 2.2, sup: 2, attained: false, why: '값은 2에 한없이 가까워지지만, 2를 주는 x는 구간 밖에 있습니다.' },
  { id: 'unbounded', label: '한쪽이 열림', tex: '\\tfrac{1}{x}\\ \\text{on}\\ (0,2]', f: (x) => 1 / x, lo: 0, hi: 2, openLo: true, openHi: false, yMax: 2.2, sup: Infinity, attained: false, why: '0 근처에서 값이 끝없이 커져 위로 유계조차 아닙니다.' },
  { id: 'jump', label: '불연속', tex: 'x\\ (x<2),\\ f(2)=0\\ \\text{on}\\ [0,2]', f: (x) => (x < 2 ? x : 0), lo: 0, hi: 2, openLo: false, openHi: false, yMax: 2.2, sup: 2, attained: false, why: '구간은 닫혀 있지만 x = 2에서 값이 0으로 떨어져, 상한 2를 가지는 점이 없습니다.' },
];

/* ───────── Thomae's function ───────── */

export const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : Math.abs(a));

/** Every reduced p/q in [0, 1] with q ≤ Q, with Thomae's value 1/q. */
export function thomaePoints(Q: number): { x: number; p: number; q: number; y: number }[] {
  const out: { x: number; p: number; q: number; y: number }[] = [];
  for (let q = 1; q <= Q; q++)
    for (let p = 0; p <= q; p++) if (gcd(p, q) === 1) out.push({ x: p / q, p, q, y: 1 / q });
  return out;
}

/**
 * Continuity of Thomae's function at x0 (taken irrational, or rational p0/q0) for a given ε:
 * only the finitely many p/q with 1/q ≥ f(x0) + ε can break |f(x) − f(x0)| < ε, so δ is the distance
 * to the nearest of them other than x0 itself. For a rational x0 = p0/q0 with ε ≤ 1/q0 nothing works:
 * irrationals arbitrarily close give |0 − 1/q0| ≥ ε.
 */
export function thomaeDelta(x0: number, q0: number | null, eps: number): { delta: number; blockers: number; nearest: { p: number; q: number } | null } {
  if (q0 !== null && eps <= 1 / q0) return { delta: 0, blockers: Infinity, nearest: null };
  // |f(x) − f(x0)| ≥ ε needs f(x) = 1/q ≥ f(x0) + ε (values below f(x0) are all within ε here)
  const f0 = q0 === null ? 0 : 1 / q0;
  const Qmax = Math.floor(1 / (f0 + eps) + 1e-9);
  let best = Infinity;
  let nearest: { p: number; q: number } | null = null;
  let blockers = 0;
  for (let q = 1; q <= Qmax; q++)
    for (let p = 0; p <= q; p++) {
      if (gcd(p, q) !== 1) continue;
      blockers++;
      const d = Math.abs(p / q - x0);
      if (d < 1e-12) continue;
      if (d < best) {
        best = d;
        nearest = { p, q };
      }
    }
  return { delta: best, blockers, nearest };
}

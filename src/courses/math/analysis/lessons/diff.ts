/* 해석학 · 미분과 평균값 정리: pure numerics for the figures (no imports, so node can run it). */

/* ───────── Figure 1: continuous but not (nicely) differentiable at 0 ───────── */

export interface Kink {
  id: 'abs' | 'xsin' | 'x2sin';
  tex: string;
  f: (x: number) => number;
  /** f′(x) for x ≠ 0, where it exists. */
  df: (x: number) => number;
}

export const KINKS: Kink[] = [
  { id: 'abs', tex: '|x|', f: (x) => Math.abs(x), df: (x) => Math.sign(x) },
  { id: 'xsin', tex: 'x\\sin(1/x)', f: (x) => (x === 0 ? 0 : x * Math.sin(1 / x)), df: (x) => Math.sin(1 / x) - Math.cos(1 / x) / x },
  { id: 'x2sin', tex: 'x^2\\sin(1/x)', f: (x) => (x === 0 ? 0 : x * x * Math.sin(1 / x)), df: (x) => 2 * x * Math.sin(1 / x) - Math.cos(1 / x) },
];

/** Difference quotients (f(±h) − f(0)) / (±h) for h = 10^-1 … 10^-6. */
export function quotients(k: Kink): { h: number; right: number; left: number }[] {
  const out = [];
  for (let e = 1; e <= 6; e++) {
    const h = Math.pow(10, -e);
    out.push({ h, right: (k.f(h) - k.f(0)) / h, left: (k.f(-h) - k.f(0)) / -h });
  }
  return out;
}

/* ───────── Figure 2: the Weierstrass function ───────── */

export const WA = 0.5;
export const WB = 13;

/**
 * Partial sum Σ_{n=0}^{N-1} a^n cos(b^n π x). Terms whose wavelength 2/b^n is far below what the
 * window can show are left out, so the picture is what the full sum looks like at that zoom.
 */
export function weierstrass(x: number, terms: number): number {
  let s = 0, an = 1, bn = 1;
  for (let n = 0; n < terms; n++) {
    s += an * Math.cos(bn * Math.PI * x);
    an *= WA;
    bn *= WB;
  }
  return s;
}

/** How many terms are visible in a window of width w drawn with `samples` points: wavelength ≥ 4 samples. */
export function termsFor(w: number, samples: number): number {
  let n = 0;
  while (n < 12 && 2 / Math.pow(WB, n) >= (4 * w) / samples) n++;
  // one more term below the resolution limit keeps the finest wiggle honest
  return Math.min(12, n + 1);
}

/** Height of the graph's range in a window around x0 of width w, divided by w. */
export function steepness(x0: number, w: number, samples = 1500): { height: number; ratio: number; terms: number } {
  const t = termsFor(w, samples);
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i <= samples; i++) {
    const v = weierstrass(x0 - w / 2 + (w * i) / samples, t);
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  return { height: hi - lo, ratio: (hi - lo) / w, terms: t };
}

/* ───────── Figure 3: Rolle and the mean value theorem, with hypotheses switched off ───────── */

export interface MvtFn {
  id: 'smooth' | 'corner' | 'jump';
  label: string;
  f: (x: number) => number;
  /** Derivative where it exists; NaN at the corner or the jump. */
  df: (x: number) => number;
}

export const MVT_FNS: MvtFn[] = [
  { id: 'smooth', label: '매끄러운 함수', f: (x) => 0.3 * x * x * x - x + 1, df: (x) => 0.9 * x * x - 1 },
  { id: 'corner', label: '모서리 |x|', f: (x) => Math.abs(x), df: (x) => (x === 0 ? NaN : Math.sign(x)) },
  { id: 'jump', label: '끊긴 함수', f: (x) => (x < 1 ? x : x - 1.5), df: (x) => (x === 1 ? NaN : 1) },
];

/**
 * Points c in (a, b) where f′(c) equals the secant slope m, found by sign changes of f′ − m on a
 * fine grid and refined by bisection. A sign change across a corner or a jump (where f′ jumps
 * past m without ever equalling it) is rejected. `all` is true when f′ = m on the whole interval.
 */
export function mvtPoints(fn: MvtFn, a: number, b: number): { m: number; cs: number[]; all: boolean } {
  const m = (fn.f(b) - fn.f(a)) / (b - a);
  const g = (x: number) => fn.df(x) - m;
  const cs: number[] = [];
  const N = 4000;
  let zeros = 0;
  let px = a + (b - a) / N, pv = g(px);
  for (let i = 2; i < N; i++) {
    const x = a + ((b - a) * i) / N;
    const v = g(x);
    if (Math.abs(v) < 1e-12) zeros++;
    else if (isFinite(pv) && isFinite(v) && pv * v < 0) {
      let lo = px, hi = x;
      for (let k = 0; k < 60; k++) {
        const mid = (lo + hi) / 2;
        if (g(lo) * g(mid) <= 0) hi = mid;
        else lo = mid;
      }
      const c = (lo + hi) / 2;
      const gc = g(c);
      if (isFinite(gc) && Math.abs(gc) < 1e-6) cs.push(c);
    }
    px = x;
    pv = v;
  }
  if (zeros > N / 2) return { m, cs: [], all: true };
  return { m, cs, all: false };
}

/** Whether f is continuous on [a, b] and differentiable on (a, b), for this figure's three functions. */
export function hypotheses(fn: MvtFn, a: number, b: number): { continuous: boolean; differentiable: boolean } {
  if (fn.id === 'corner') return { continuous: true, differentiable: !(a < 0 && b > 0) };
  if (fn.id === 'jump') return { continuous: !(a < 1 && b >= 1), differentiable: !(a < 1 && b > 1) };
  return { continuous: true, differentiable: true };
}

/* ───────── Figure 4: Taylor's theorem with the Lagrange remainder, for e^x at 0 ───────── */

export function factorial(n: number): number {
  let p = 1;
  for (let k = 2; k <= n; k++) p *= k;
  return p;
}

/** Taylor polynomial of e^x at 0, degree n. */
export function expTaylor(x: number, n: number): number {
  let s = 0, term = 1;
  for (let k = 0; k <= n; k++) {
    s += term;
    term *= x / (k + 1);
  }
  return s;
}

/** Lagrange bound: |R_n(x)| ≤ max_{t between 0 and x} e^t · |x|^{n+1} / (n+1)!. */
export function expBound(x: number, n: number): number {
  return Math.exp(Math.max(0, x)) * Math.pow(Math.abs(x), n + 1) / factorial(n + 1);
}

export const expError = (x: number, n: number) => Math.abs(Math.exp(x) - expTaylor(x, n));

/* 미적분학 · 적분: Riemann sums and accumulation (no imports, so node can run this file directly). */

export type Rule = 'left' | 'right' | 'mid' | 'trap';
export const RULES: Rule[] = ['left', 'right', 'mid', 'trap'];
export const RULE_KO: Record<Rule, string> = { left: '왼쪽 끝', right: '오른쪽 끝', mid: '가운데', trap: '사다리꼴' };

export interface Fn {
  id: string;
  label: string;
  tex: string;
  f: (x: number) => number;
  /** An antiderivative, for the exact value. */
  F: (x: number) => number;
  a: number;
  b: number;
  yMax: number;
}

export const FUNCS: Fn[] = [
  { id: 'sq', label: 'x²', tex: 'x^2', f: (x) => x * x, F: (x) => (x * x * x) / 3, a: 0, b: 2, yMax: 4.4 },
  { id: 'sin', label: 'sin x', tex: '\\sin x', f: (x) => Math.sin(x), F: (x) => -Math.cos(x), a: 0, b: Math.PI, yMax: 1.25 },
  { id: 'exp', label: 'eˣ', tex: 'e^x', f: (x) => Math.exp(x), F: (x) => Math.exp(x), a: 0, b: 1, yMax: 3 },
];

export const exact = (fn: Fn) => fn.F(fn.b) - fn.F(fn.a);

/** One piece of a Riemann sum: a rectangle (or trapezoid) over [x0, x1]. */
export interface Piece {
  x0: number;
  x1: number;
  /** Heights at the left and right edge (equal for rectangles). */
  h0: number;
  h1: number;
}

export function pieces(f: (x: number) => number, a: number, b: number, n: number, rule: Rule): Piece[] {
  const h = (b - a) / n;
  const out: Piece[] = [];
  for (let i = 0; i < n; i++) {
    const x0 = a + i * h, x1 = x0 + h;
    if (rule === 'trap') out.push({ x0, x1, h0: f(x0), h1: f(x1) });
    else {
      const y = f(rule === 'left' ? x0 : rule === 'right' ? x1 : (x0 + x1) / 2);
      out.push({ x0, x1, h0: y, h1: y });
    }
  }
  return out;
}

export function riemann(f: (x: number) => number, a: number, b: number, n: number, rule: Rule): number {
  return pieces(f, a, b, n, rule).reduce((s, p) => s + ((p.h0 + p.h1) / 2) * (p.x1 - p.x0), 0);
}

/** |error| for n = 1, 2, 4, …, maxN, for the log–log plot. */
export function errorCurve(fn: Fn, rule: Rule, maxN = 1024): [number, number][] {
  const ex = exact(fn);
  const out: [number, number][] = [];
  for (let n = 1; n <= maxN; n *= 2) out.push([n, Math.abs(riemann(fn.f, fn.a, fn.b, n, rule) - ex)]);
  return out;
}

/** Slope of log(error) against log(n) between the last two points: about −1 or −2. */
export function errorOrder(curve: [number, number][]): number {
  const [n0, e0] = curve[curve.length - 2];
  const [n1, e1] = curve[curve.length - 1];
  return Math.log(e1 / e0) / Math.log(n1 / n0);
}

/** Positive part, negative part, net and total area of f on [a, b] (Simpson, fine grid). */
export function signedAreas(f: (x: number) => number, a: number, b: number, n = 2000): { pos: number; neg: number; net: number; total: number } {
  const lo = Math.min(a, b), hi = Math.max(a, b);
  const sgn = b >= a ? 1 : -1;
  const h = (hi - lo) / n;
  let pos = 0, neg = 0;
  for (let i = 0; i < n; i++) {
    const x0 = lo + i * h;
    const v = ((f(x0) + 4 * f(x0 + h / 2) + f(x0 + h)) / 6) * h;
    if (v >= 0) pos += v;
    else neg += v;
  }
  return { pos: sgn * pos, neg: sgn * neg, net: sgn * (pos + neg), total: pos - neg };
}

/** A(x) = ∫ₐˣ f by Simpson's rule on a fine grid (works for f with no closed-form antiderivative). */
export function accumulate(f: (t: number) => number, a: number, x: number, n = 400): number {
  if (x === a) return 0;
  const h = (x - a) / n;
  let s = f(a) + f(x);
  for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * f(a + i * h);
  return (s * h) / 3;
}

/* ───────── a trip: velocity in m/s against time in s ───────── */

/** Speeds up to 20 m/s in 10 s, cruises until 30 s, brakes to a stop at 40 s. */
export function velocity(t: number): number {
  if (t <= 0) return 0;
  if (t < 10) return 2 * t;
  if (t < 30) return 20;
  if (t < 40) return 20 - 2 * (t - 30);
  return 0;
}

/** Distance travelled by time t, from the areas of the triangle and rectangles. */
export function distance(t: number): number {
  const tt = Math.max(0, Math.min(40, t));
  if (tt < 10) return tt * tt;
  if (tt < 30) return 100 + 20 * (tt - 10);
  const s = tt - 30;
  return 500 + 20 * s - s * s;
}

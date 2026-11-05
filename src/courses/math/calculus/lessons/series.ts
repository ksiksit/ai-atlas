/*
 * 미적분학 · 수열, 급수, 테일러 급수: pure functions behind the figures.
 * No imports, so node can run it to check the numbers in the prose.
 */

/* ───────── Figure 1: a sequence that creeps up to e ───────── */

/** (1 + 1/n)ⁿ: money at 100% yearly interest, compounded n times a year. */
export const compound = (n: number) => Math.pow(1 + 1 / n, n);

/* ───────── Figure 2: partial sums ───────── */

export type SeriesCase = 'geometric' | 'harmonic' | 'alternating';

export interface SeriesInfo {
  /** The k-th term, k = 1, 2, 3, … */
  term: (k: number, r: number) => number;
  /** The sum, or Infinity / NaN when there is none. */
  limit: (r: number) => number;
  tex: (r: number) => string;
}

export const SERIES: Record<SeriesCase, SeriesInfo> = {
  // r + r² + r³ + …
  geometric: { term: (k, r) => Math.pow(r, k), limit: (r) => (Math.abs(r) < 1 ? r / (1 - r) : r >= 1 ? Infinity : NaN), tex: (r) => `\\sum_{k=1}^{\\infty} ${fmtR(r)}^{k}` },
  // 1 + 1/2 + 1/3 + …
  harmonic: { term: (k) => 1 / k, limit: () => Infinity, tex: () => '\\sum_{k=1}^{\\infty} \\frac{1}{k}' },
  // 1 − 1/2 + 1/3 − …
  alternating: { term: (k) => (k % 2 ? 1 : -1) / k, limit: () => Math.LN2, tex: () => '\\sum_{k=1}^{\\infty} \\frac{(-1)^{k+1}}{k}' },
};

function fmtR(r: number) {
  const s = (Math.round(r * 100) / 100).toString();
  return r < 0 ? `(${s.replace('-', '-')})` : s;
}

/** Partial sums S₁ … S_N. */
export function partialSums(c: SeriesCase, N: number, r = 0.5): number[] {
  const out: number[] = [];
  let s = 0;
  for (let k = 1; k <= N; k++) {
    s += SERIES[c].term(k, r);
    out.push(s);
  }
  return out;
}

/** Smallest n with 1 + 1/2 + … + 1/n > target. */
export function harmonicPast(target: number): number {
  let s = 0;
  let n = 0;
  while (s <= target) {
    n++;
    s += 1 / n;
  }
  return n;
}

/* ───────── Figure 3: Taylor polynomials ───────── */

export type TaylorCase = 'exp' | 'sin' | 'log' | 'geom';

export interface TaylorInfo {
  name: string;
  tex: string;
  f: (x: number) => number;
  /** Coefficient of xᵏ in the Taylor series about 0. */
  coef: (k: number) => number;
  /** Radius of convergence (Infinity for entire functions). */
  radius: number;
  /** Plot window. */
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  series: string;
}

const fact = (k: number) => {
  let p = 1;
  for (let i = 2; i <= k; i++) p *= i;
  return p;
};

export const TAYLOR: Record<TaylorCase, TaylorInfo> = {
  exp: { name: 'eˣ', tex: 'e^{x}', f: Math.exp, coef: (k) => 1 / fact(k), radius: Infinity, xMin: -4, xMax: 4, yMin: -2, yMax: 20, series: '1 + x + \\frac{x^2}{2!} + \\frac{x^3}{3!} + \\cdots' },
  sin: { name: 'sin x', tex: '\\sin x', f: Math.sin, coef: (k) => (k % 2 ? ((k - 1) / 2) % 2 ? -1 / fact(k) : 1 / fact(k) : 0), radius: Infinity, xMin: -8, xMax: 8, yMin: -2.5, yMax: 2.5, series: 'x - \\frac{x^3}{3!} + \\frac{x^5}{5!} - \\cdots' },
  log: { name: 'ln(1+x)', tex: '\\ln(1+x)', f: (x) => (x > -1 ? Math.log(1 + x) : NaN), coef: (k) => (k === 0 ? 0 : (k % 2 ? 1 : -1) / k), radius: 1, xMin: -1.5, xMax: 2.5, yMin: -3, yMax: 2, series: 'x - \\frac{x^2}{2} + \\frac{x^3}{3} - \\cdots' },
  geom: { name: '1/(1−x)', tex: '\\frac{1}{1-x}', f: (x) => 1 / (1 - x), coef: () => 1, radius: 1, xMin: -2, xMax: 1.6, yMin: -3, yMax: 8, series: '1 + x + x^2 + x^3 + \\cdots' },
};

/** Taylor polynomial of degree n about 0, evaluated by Horner's rule. */
export function taylor(c: TaylorCase, n: number, x: number): number {
  const t = TAYLOR[c];
  let y = 0;
  for (let k = n; k >= 0; k--) y = y * x + t.coef(k);
  return y;
}

/** Widest interval around 0 on which |f − Tₙ| stays below tol, searched on the plot window. */
export function goodInterval(c: TaylorCase, n: number, tol = 0.01): [number, number] {
  const t = TAYLOR[c];
  const step = 0.001;
  let lo = 0, hi = 0;
  for (let x = 0; x >= t.xMin; x -= step) {
    const e = Math.abs(t.f(x) - taylor(c, n, x));
    if (!(e < tol)) break;
    lo = x;
  }
  for (let x = 0; x <= t.xMax; x += step) {
    const e = Math.abs(t.f(x) - taylor(c, n, x));
    if (!(e < tol)) break;
    hi = x;
  }
  return [lo, hi];
}

/* ───────── Figure 4: how a library computes sin ───────── */

export interface SinTrace {
  x: number;
  /** Nearest multiple of π/2. */
  k: number;
  /** Reduced argument, |r| ≤ π/4. */
  r: number;
  /** Which of sin r, cos r, −sin r, −cos r. */
  quadrant: 0 | 1 | 2 | 3;
  value: number;
  exact: number;
  error: number;
}

/** Odd Taylor polynomial of sin up to degree d, and the even one of cos up to degree d − 1. */
export function sinPoly(r: number, d: number): number {
  let s = 0, term = r;
  for (let k = 1; k <= d; k += 2) {
    s += term;
    term *= (-r * r) / ((k + 1) * (k + 2));
  }
  return s;
}
export function cosPoly(r: number, d: number): number {
  let s = 0, term = 1;
  for (let k = 0; k <= d - 1; k += 2) {
    s += term;
    term *= (-r * r) / ((k + 1) * (k + 2));
  }
  return s;
}

/** Range reduction to [−π/4, π/4], then a short polynomial. */
export function librarySin(x: number, d: number): SinTrace {
  const k = Math.round(x / (Math.PI / 2));
  const r = x - k * (Math.PI / 2);
  const quadrant = (((k % 4) + 4) % 4) as 0 | 1 | 2 | 3;
  const value = quadrant === 0 ? sinPoly(r, d) : quadrant === 1 ? cosPoly(r, d) : quadrant === 2 ? -sinPoly(r, d) : -cosPoly(r, d);
  const exact = Math.sin(x);
  return { x, k, r, quadrant, value, exact, error: Math.abs(value - exact) };
}

/** Largest |sin x − T_d(x)| on [−a, a] (plain Taylor, no range reduction). */
export function maxTaylorError(d: number, a: number, samples = 4000): number {
  let m = 0;
  for (let i = 0; i <= samples; i++) {
    const x = -a + (2 * a * i) / samples;
    m = Math.max(m, Math.abs(Math.sin(x) - sinPoly(x, d)));
  }
  return m;
}

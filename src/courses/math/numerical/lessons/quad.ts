/*
 * 수치해석 · 수치 적분: pure logic (no imports, so node can run it directly).
 * Composite trapezoid and Simpson, Romberg extrapolation, Gauss–Legendre nodes, adaptive Simpson,
 * and grid vs Monte Carlo integration in many dimensions.
 */

export type F = (x: number) => number;

export interface Integrand {
  id: string;
  label: string;
  tex: string;
  f: F;
  a: number;
  b: number;
  exact: number;
  yMax: number;
}

export const EXP: Integrand = { id: 'exp', label: 'eˣ', tex: 'e^{x}', f: Math.exp, a: 0, b: 1, exact: Math.E - 1, yMax: 3 };
export const SQRT: Integrand = { id: 'sqrt', label: '√x', tex: '\\sqrt{x}', f: Math.sqrt, a: 0, b: 1, exact: 2 / 3, yMax: 1.15 };
export const BUMP: Integrand = {
  id: 'bump',
  label: '1/(1 + 25x²)',
  tex: '\\frac{1}{1+25x^2}',
  f: (x) => 1 / (1 + 25 * x * x),
  a: -1,
  b: 1,
  exact: (2 / 5) * Math.atan(5),
  yMax: 1.1,
};
/** A narrow peak at x = 0.3 on [0, 1]: almost all of the area sits in a sliver. */
export const PEAK: Integrand = {
  id: 'peak',
  label: '뾰족한 봉우리',
  tex: '\\frac{1}{1+10^4(x-0.3)^2}+\\tfrac{x}{2}',
  f: (x) => 1 / (1 + 1e4 * (x - 0.3) ** 2) + x / 2,
  a: 0,
  b: 1,
  exact: (Math.atan(70) + Math.atan(30)) / 100 + 0.25,
  yMax: 1.4,
};

/* ───────── composite rules ───────── */

export function trapezoid(f: F, a: number, b: number, n: number): number {
  const h = (b - a) / n;
  let s = (f(a) + f(b)) / 2;
  for (let i = 1; i < n; i++) s += f(a + i * h);
  return s * h;
}

/** Composite Simpson with n subintervals (n even): n + 1 function evaluations. */
export function simpson(f: F, a: number, b: number, n: number): number {
  const m = n % 2 ? n + 1 : n;
  const h = (b - a) / m;
  let s = f(a) + f(b);
  for (let i = 1; i < m; i++) s += (i % 2 ? 4 : 2) * f(a + i * h);
  return (s * h) / 3;
}

/** One parabola per pair of subintervals, for drawing Simpson's rule: coefficients of y = c0 + c1 t + c2 t², t = x − xm. */
export function simpsonParabolas(f: F, a: number, b: number, n: number): { x0: number; x1: number; xm: number; c: [number, number, number] }[] {
  const m = n % 2 ? n + 1 : n;
  const h = (b - a) / m;
  const out: { x0: number; x1: number; xm: number; c: [number, number, number] }[] = [];
  for (let k = 0; k < m; k += 2) {
    const x0 = a + k * h, xm = x0 + h, x1 = x0 + 2 * h;
    const y0 = f(x0), ym = f(xm), y1 = f(x1);
    out.push({ x0, x1, xm, c: [ym, (y1 - y0) / (2 * h), (y1 - 2 * ym + y0) / (2 * h * h)] });
  }
  return out;
}

/** |error| of each rule for n = 2, 4, …, 2^kMax, and the slope of log(error) vs log(n) over the last doubling. */
export function errorTable(fn: Integrand, kMax = 10): { n: number; trap: number; simp: number }[] {
  const rows: { n: number; trap: number; simp: number }[] = [];
  for (let k = 1; k <= kMax; k++) {
    const n = 2 ** k;
    rows.push({ n, trap: Math.abs(trapezoid(fn.f, fn.a, fn.b, n) - fn.exact), simp: Math.abs(simpson(fn.f, fn.a, fn.b, n) - fn.exact) });
  }
  return rows;
}

/** Observed order between n and 2n: log₂(e(n) / e(2n)). */
export const order = (e1: number, e2: number) => Math.log2(e1 / e2);

/* ───────── Romberg ───────── */

/**
 * Romberg table: R[i][0] is the trapezoid rule with 2^i panels, and each later column cancels the next
 * error term: R[i][j] = R[i][j−1] + (R[i][j−1] − R[i−1][j−1]) / (4^j − 1).
 */
export function romberg(f: F, a: number, b: number, levels: number): number[][] {
  const R: number[][] = [];
  for (let i = 0; i < levels; i++) {
    R[i] = [trapezoid(f, a, b, 2 ** i)];
    for (let j = 1; j <= i; j++) R[i][j] = R[i][j - 1] + (R[i][j - 1] - R[i - 1][j - 1]) / (4 ** j - 1);
  }
  return R;
}

/** Function evaluations needed for Romberg with `levels` rows (the finest trapezoid). */
export const rombergEvals = (levels: number) => 2 ** (levels - 1) + 1;

/** Correct decimal digits of an estimate: −log₁₀|error|, capped at 16. */
export const digits = (est: number, exact: number) => {
  const e = Math.abs(est - exact);
  return e === 0 ? 16 : Math.min(16, Math.max(0, -Math.log10(e)));
};

/* ───────── Gauss–Legendre ───────── */

/** Nodes and weights of the n-point Gauss–Legendre rule on [−1, 1], by Newton's method on Pₙ. */
export function gaussLegendre(n: number): { x: number[]; w: number[] } {
  const x: number[] = [], w: number[] = [];
  for (let i = 1; i <= n; i++) {
    let z = Math.cos((Math.PI * (i - 0.25)) / (n + 0.5));
    let dp = 0;
    for (let it = 0; it < 100; it++) {
      let p0 = 1, p1 = z;
      for (let k = 2; k <= n; k++) {
        const p2 = ((2 * k - 1) * z * p1 - (k - 1) * p0) / k;
        p0 = p1;
        p1 = p2;
      }
      const pn = n === 1 ? z : p1, pn1 = n === 1 ? 1 : p0;
      dp = (n * (z * pn - pn1)) / (z * z - 1);
      const dz = pn / dp;
      z -= dz;
      if (Math.abs(dz) < 1e-15) break;
    }
    x.push(z);
    w.push(2 / ((1 - z * z) * dp * dp));
  }
  const order = x.map((_, i) => i).sort((p, q) => x[p] - x[q]);
  return { x: order.map((i) => x[i]), w: order.map((i) => w[i]) };
}

/** Apply the n-point Gauss rule on [a, b] (n evaluations). */
export function gauss(f: F, a: number, b: number, n: number): number {
  const { x, w } = gaussLegendre(n);
  const m = (a + b) / 2, r = (b - a) / 2;
  let s = 0;
  for (let i = 0; i < n; i++) s += w[i] * f(m + r * x[i]);
  return s * r;
}

/** Simpson with (close to) the same number of evaluations as an n-point Gauss rule: the largest even panel count with evals ≤ n. */
export const simpsonWithEvals = (f: F, a: number, b: number, evals: number) => {
  let panels = evals - 1;
  if (panels % 2) panels--;
  return panels >= 2 ? { value: simpson(f, a, b, panels), evals: panels + 1 } : null;
};

/* ───────── adaptive Simpson ───────── */

export interface Adaptive {
  value: number;
  evals: number;
  /** The accepted intervals, left to right. */
  intervals: [number, number][];
}

/**
 * Adaptive Simpson: accept an interval when the two-half estimate differs from the whole-interval estimate by
 * less than 15·tol (the classic test, with Richardson's correction added); otherwise split and halve tol.
 */
export function adaptiveSimpson(f: F, a: number, b: number, tol: number, maxDepth = 40): Adaptive {
  let evals = 0;
  const g = (x: number) => {
    evals++;
    return f(x);
  };
  const intervals: [number, number][] = [];
  const simp = (fa: number, fm: number, fb: number, h: number) => (h / 6) * (fa + 4 * fm + fb);
  const rec = (a: number, b: number, fa: number, fm: number, fb: number, whole: number, tol: number, depth: number): number => {
    const m = (a + b) / 2;
    const lm = (a + m) / 2, rm = (m + b) / 2;
    const flm = g(lm), frm = g(rm);
    const left = simp(fa, flm, fm, m - a), right = simp(fm, frm, fb, b - m);
    const diff = left + right - whole;
    if (depth >= maxDepth || Math.abs(diff) <= 15 * tol) {
      intervals.push([a, m], [m, b]);
      return left + right + diff / 15;
    }
    return rec(a, m, fa, flm, fm, left, tol / 2, depth + 1) + rec(m, b, fm, frm, fb, right, tol / 2, depth + 1);
  };
  const fa = g(a), fb = g(b), fm = g((a + b) / 2);
  const value = rec(a, b, fa, fm, fb, simp(fa, fm, fb, b - a), tol, 0);
  return { value, evals, intervals };
}

/**
 * The fewest evaluations uniform Simpson needs to reach an error target: double the panel count until the
 * target is met, then binary-search the even panel counts in between (the error shrinks steadily once the
 * panels resolve the peak, so the search is reliable there).
 */
export function uniformSimpsonFor(fn: Integrand, target: number): { panels: number; evals: number; error: number } {
  const err = (p: number) => Math.abs(simpson(fn.f, fn.a, fn.b, p) - fn.exact);
  let hi = 2;
  while (hi <= 1 << 20 && err(hi) > target) hi *= 2;
  if (hi > 1 << 20) return { panels: NaN, evals: NaN, error: NaN };
  let lo = hi / 2; // err(lo) > target (or lo = 1)
  while (hi - lo > 2) {
    let mid = Math.floor((lo + hi) / 2);
    if (mid % 2) mid++;
    if (mid >= hi) break;
    if (err(mid) <= target) hi = mid;
    else lo = mid;
  }
  return { panels: hi, evals: hi + 1, error: err(hi) };
}

/* ───────── many dimensions: grid vs Monte Carlo ───────── */

/** f(x₁…x_d) = Π (π/2) sin(π xᵢ) on the unit cube; its integral is exactly 1 in every dimension. */
const factor = (t: number) => (Math.PI / 2) * Math.sin(Math.PI * t);

/** Midpoint grid with k points per axis (k^d evaluations): the product of one-dimensional midpoint sums. */
export function gridEstimate(d: number, k: number): number {
  let s = 0;
  for (let i = 0; i < k; i++) s += factor((i + 0.5) / k);
  return (s / k) ** d;
}

/** Monte Carlo with N random points; `rand` is a seeded uniform generator. */
export function monteCarlo(d: number, N: number, rand: () => number): number {
  let s = 0;
  for (let n = 0; n < N; n++) {
    let p = 1;
    for (let i = 0; i < d; i++) p *= factor(rand());
    s += p;
  }
  return s / N;
}

export const DIMS = [1, 2, 3, 4, 6, 12];
/** With a budget of 4,096 = 2¹² evaluations, the grid gets k = 4096^(1/d) points per axis. */
export const BUDGET = 4096;
export const gridK = (d: number) => Math.round(BUDGET ** (1 / d));

/* 해석학 · 함수열과 균등 수렴: pure numerics for the figures (no imports, so node can run it). */

export interface Family {
  id: 'pow' | 'spike' | 'shrink';
  label: string;
  tex: string;
  /** f_n(x) on [0, 1]. */
  fn: (n: number, x: number) => number;
  /** The pointwise limit f(x). */
  lim: (x: number) => number;
  /** Exact ∫_0^1 f_n and ∫_0^1 f. */
  intN: (n: number) => number;
  intLim: number;
  /** y-range for drawing f_n with n up to 30. */
  yMax: (n: number) => number;
}

export const FAMILIES: Family[] = [
  {
    id: 'pow',
    label: 'xⁿ',
    tex: 'f_n(x) = x^n',
    fn: (n, x) => Math.pow(x, n),
    lim: (x) => (x < 1 ? 0 : 1),
    intN: (n) => 1 / (n + 1),
    intLim: 0,
    yMax: () => 1.1,
  },
  {
    id: 'spike',
    label: '솟는 봉우리',
    tex: 'f_n(x) = 2n^2 x\\,e^{-n^2x^2}',
    fn: (n, x) => 2 * n * n * x * Math.exp(-n * n * x * x),
    lim: () => 0,
    intN: (n) => 1 - Math.exp(-n * n),
    intLim: 0,
    yMax: (n) => Math.max(1.1, Math.SQRT2 * n * Math.exp(-0.5) * 1.12),
  },
  {
    id: 'shrink',
    label: 'x / n',
    tex: 'f_n(x) = x / n',
    fn: (n, x) => x / n,
    lim: () => 0,
    intN: (n) => 1 / (2 * n),
    intLim: 0,
    yMax: () => 1.1,
  },
];

/**
 * sup_{x ∈ [0, r]} |f_n(x) − f(x)|, computed on a fine grid. For xⁿ on [0, 1] the supremum over
 * [0, 1) is 1 but never reached, so the grid value creeps toward 1; we report the exact value instead.
 */
export function supNorm(fam: Family, n: number, r = 1): number {
  if (fam.id === 'pow') return r >= 1 ? 1 : Math.pow(r, n);
  if (fam.id === 'spike') {
    // the peak is at x = 1/(n√2); past r the function is cut off
    const xp = 1 / (n * Math.SQRT2);
    return fam.fn(n, Math.min(xp, r));
  }
  return r / n;
}

/** For xⁿ: the smallest N with x^m < ε for every m ≥ N (pointwise, so N depends on x). */
export function powN(x: number, eps: number): number {
  if (x <= 0) return 1;
  if (x >= 1) return Infinity;
  return Math.max(1, Math.ceil(Math.log(eps) / Math.log(x) - 1e-12));
}

/** For xⁿ on [0, r]: one N that works for every x at once (uniform), or ∞ when r = 1. */
export function powUniformN(r: number, eps: number): number {
  return r >= 1 ? Infinity : powN(r, eps);
}

/* ───────── Weierstrass M-test on the geometric series ───────── */

export const geomPartial = (x: number, N: number) => {
  let s = 0, t = 1;
  for (let k = 0; k <= N; k++) {
    s += t;
    t *= x;
  }
  return s;
};

/** sup over [−r, r] of |1/(1−x) − S_N(x)| = r^{N+1}/(1−r), reached at x = r; equal to the M-test tail Σ_{k>N} r^k. */
export const geomSupError = (r: number, N: number) => Math.pow(r, N + 1) / (1 - r);

/* ───────── Gibbs: partial Fourier sums of the square wave ───────── */

/** Square wave: −1 on (−π, 0), +1 on (0, π). Partial sum up to harmonic N (odd terms only). */
export function squareSum(x: number, N: number): number {
  let s = 0;
  for (let k = 1; k <= N; k += 2) s += Math.sin(k * x) / k;
  return (4 / Math.PI) * s;
}

/** The first and highest peak of S_N to the right of 0, by a fine search on (0, π/2). */
export function gibbsPeak(N: number): { x: number; y: number } {
  let bx = 0, by = -Infinity;
  const M = 6000;
  const end = Math.min(Math.PI / 2, (4 * Math.PI) / (N + 1));
  for (let i = 1; i <= M; i++) {
    const x = (end * i) / M;
    const y = squareSum(x, N);
    if (y > by) {
      by = y;
      bx = x;
    }
  }
  return { x: bx, y: by };
}

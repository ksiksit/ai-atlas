/*
 * 수치해석 · 부동소수점과 오차: pure helpers for the floating-point lesson.
 * No imports, so node can run this file directly.
 */

/* ───────── machine epsilon by halving ───────── */

export interface HalvingStep {
  k: number;
  /** the candidate ε = 2^−k */
  eps: number;
  /** does 1 + ε still differ from 1 in this format? */
  differs: boolean;
}

/** Halve ε from 1 until 1 + ε rounds to 1. `round` is the identity for doubles, Math.fround for float32. */
export function halving(round: (v: number) => number): HalvingStep[] {
  const out: HalvingStep[] = [];
  let eps = 1;
  for (let k = 0; k <= 60; k++) {
    const differs = round(1 + eps) !== 1;
    out.push({ k, eps, differs });
    if (!differs) break;
    eps = round(eps / 2);
  }
  return out;
}

/** The last ε for which 1 + ε ≠ 1: the machine epsilon of the format. */
export const machineEps = (round: (v: number) => number) => {
  const s = halving(round);
  return s[s.length - 2].eps;
};

/* ───────── spacing between neighbouring doubles ───────── */

/** Gap from x to the next larger double (for x > 0, normal range). */
export function ulp(x: number): number {
  const ax = Math.abs(x);
  if (ax === 0) return Number.MIN_VALUE;
  const e = Math.floor(Math.log2(ax));
  // Math.log2 can be off by one right at powers of two; correct it
  const p = 2 ** e > ax ? e - 1 : 2 ** (e + 1) <= ax ? e + 1 : e;
  return 2 ** (p - 52);
}

/** Gap to the next float32. */
export function ulp32(x: number): number {
  const ax = Math.abs(x);
  const e = Math.floor(Math.log2(ax));
  const p = 2 ** e > ax ? e - 1 : 2 ** (e + 1) <= ax ? e + 1 : e;
  return 2 ** (p - 23);
}

/* ───────── cancellation ───────── */

export type CancelCase = 'cos' | 'quad';

/** (1 − cos x)/x²: the naive form, the rewritten one, and the true value from its series. */
export function cosCase(x: number) {
  const naive = (1 - Math.cos(x)) / (x * x);
  const s = Math.sin(x / 2);
  const stable = (2 * s * s) / (x * x);
  // 1/2 − x²/24 + x⁴/720 − x⁶/40320, accurate to double precision for x ≤ 1e-1
  const x2 = x * x;
  const exact = x < 0.1 ? 0.5 - x2 / 24 + (x2 * x2) / 720 - (x2 * x2 * x2) / 40320 : stable;
  return { naive, stable, exact };
}

/**
 * The small root of x² + b x + 1 = 0 (b > 2). Naive: (−b + √(b²−4))/2.
 * Rewritten: 2/(−b − √(b²−4)), which avoids subtracting two nearly equal numbers.
 */
export function quadCase(b: number) {
  const d = Math.sqrt(b * b - 4);
  const naive = (-b + d) / 2;
  const stable = 2 / (-b - d);
  // the rewritten form is accurate to a few ulps; use it as the reference
  return { naive, stable, exact: stable };
}

export const relErr = (v: number, exact: number) => (exact === 0 ? Math.abs(v) : Math.abs((v - exact) / exact));

/** Number of correct significant decimal digits, between 0 and 16. */
export function digits(v: number, exact: number): number {
  const e = relErr(v, exact);
  if (e === 0) return 16;
  return Math.max(0, Math.min(16, -Math.log10(e)));
}

/* ───────── summation order in float32 ───────── */

const f = Math.fround;

/** Σ 1/k² for k = 1..n in float32, three ways, and the double-precision reference (summed small to large). */
export function sums(n: number) {
  let fwd = 0;
  for (let k = 1; k <= n; k++) fwd = f(fwd + f(1 / (k * k)));
  let bwd = 0;
  for (let k = n; k >= 1; k--) bwd = f(bwd + f(1 / (k * k)));
  // Kahan: carry the lost low part in c and feed it back in
  let s = 0, c = 0;
  for (let k = 1; k <= n; k++) {
    const y = f(f(1 / (k * k)) - c);
    const t = f(s + y);
    c = f(f(t - s) - y);
    s = t;
  }
  // reference: the exact float32 terms summed in double, smallest first
  let ref = 0;
  for (let k = n; k >= 1; k--) ref += f(1 / (k * k));
  return { forward: fwd, backward: bwd, kahan: s, ref };
}

/** The first k at which adding 1/k² no longer changes a running float32 sum (forward order). */
export function stallIndex(n: number): number {
  let s = 0;
  for (let k = 1; k <= n; k++) {
    const t = f(s + f(1 / (k * k)));
    if (t === s) return k;
    s = t;
  }
  return -1;
}

/* ───────── conditioning vs stability ───────── */

/** √(x+1) − √x: a well-conditioned problem with an unstable direct formula. */
export function sqrtDiff(x: number) {
  const naive = Math.sqrt(x + 1) - Math.sqrt(x);
  const stable = 1 / (Math.sqrt(x + 1) + Math.sqrt(x));
  // condition number |x f′(x) / f(x)| of the problem itself; f′ = −f / (2√x √(x+1)), so κ = √x / (2√(x+1))
  const kappa = Math.sqrt(x) / (2 * Math.sqrt(x + 1));
  return { naive, stable, kappa };
}

/** 1 − x near x = 1: an ill-conditioned problem, κ = |x/(1 − x)|. */
export const oneMinusKappa = (x: number) => Math.abs(x / (1 - x));

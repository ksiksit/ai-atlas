/* 미적분학 · 미분의 응용: pure helpers (no imports, so node can run this file directly). */

/** Polynomial with coefficients c[0] + c[1] x + c[2] x² + … */
export type Poly = number[];

export function pEval(c: Poly, x: number): number {
  let y = 0;
  for (let k = c.length - 1; k >= 0; k--) y = y * x + c[k];
  return y;
}

export function pDeriv(c: Poly): Poly {
  const d = c.slice(1).map((a, k) => a * (k + 1));
  return d.length ? d : [0];
}

/** Roots of g on [lo, hi]: sign changes on a fine grid refined by bisection, plus touching zeros. */
export function roots(g: (x: number) => number, lo: number, hi: number, steps = 2000): number[] {
  const out: number[] = [];
  const h = (hi - lo) / steps;
  let x0 = lo;
  let y0 = g(x0);
  for (let i = 1; i <= steps; i++) {
    const x1 = lo + i * h;
    const y1 = g(x1);
    if (y0 === 0) out.push(x0);
    else if (y0 * y1 < 0) {
      let a = x0, b = x1, ya = y0;
      for (let k = 0; k < 60; k++) {
        const m = (a + b) / 2;
        const ym = g(m);
        if (ya * ym <= 0) b = m;
        else {
          a = m;
          ya = ym;
        }
      }
      out.push((a + b) / 2);
    }
    x0 = x1;
    y0 = y1;
  }
  // merge near-duplicates
  return out.filter((r, i) => i === 0 || Math.abs(r - out[i - 1]) > 1e-6);
}

export type PointKind = 'max' | 'min' | 'flat' | 'inflection';
export interface Special {
  x: number;
  y: number;
  kind: PointKind;
  /** f'' at x, for the second-derivative test. */
  f2: number;
}

/**
 * Critical points of f (f′ = 0) classified by the sign change of f′ (first-derivative test),
 * and inflection points (f″ changes sign).
 */
export function specialPoints(c: Poly, lo: number, hi: number): Special[] {
  const d1 = pDeriv(c);
  const d2 = pDeriv(d1);
  const f1 = (x: number) => pEval(d1, x);
  const f2 = (x: number) => pEval(d2, x);
  const pts: Special[] = [];
  // a polynomial derivative that is identically zero has no isolated critical points
  if (d1.every((a) => a === 0)) return pts;
  const eps = 1e-4;
  for (const r of roots(f1, lo, hi)) {
    const l = f1(r - eps), rt = f1(r + eps);
    const kind: PointKind = l > 0 && rt < 0 ? 'max' : l < 0 && rt > 0 ? 'min' : 'flat';
    pts.push({ x: r, y: pEval(c, r), kind, f2: f2(r) });
  }
  if (!d2.every((a) => a === 0))
    for (const r of roots(f2, lo, hi)) {
      if (f2(r - eps) * f2(r + eps) < 0) pts.push({ x: r, y: pEval(c, r), kind: 'inflection', f2: 0 });
    }
  return pts.sort((a, b) => a.x - b.x);
}

/* ───────── the open box ───────── */

/** Volume of the open box folded from a W × H sheet after cutting x × x squares from the corners. */
export const boxVolume = (W: number, H: number, x: number) => x * (W - 2 * x) * (H - 2 * x);

/** dV/dx = 12x² − 4(W+H)x + WH = 0, smaller root (the larger one makes a side negative). */
export function boxOptimum(W: number, H: number): number {
  return (W + H - Math.sqrt(W * W - W * H + H * H)) / 6;
}

/* ───────── mean value theorem ───────── */

/** Every c in (a, b) where f′(c) equals the secant slope. */
export function mvtPoints(c: Poly, a: number, b: number): { slope: number; cs: number[] } {
  const slope = (pEval(c, b) - pEval(c, a)) / (b - a);
  const d1 = pDeriv(c);
  const cs = roots((x) => pEval(d1, x) - slope, a, b).filter((x) => x > a + 1e-9 && x < b - 1e-9);
  return { slope, cs };
}

/* ───────── Newton's method ───────── */

export interface NewtonFn {
  id: string;
  label: string;
  tex: string;
  f: (x: number) => number;
  df: (x: number) => number;
  x0: number;
  /** The root the method should find, when there is one. */
  root?: number;
  view: { xMin: number; xMax: number; yMin: number; yMax: number };
}

export const NEWTON: NewtonFn[] = [
  {
    id: 'sqrt2',
    label: '√2 찾기',
    tex: 'f(x) = x^2 - 2',
    f: (x) => x * x - 2,
    df: (x) => 2 * x,
    x0: 1,
    root: Math.SQRT2,
    view: { xMin: 0.6, xMax: 2.2, yMin: -1.6, yMax: 2.8 },
  },
  {
    id: 'cycle',
    label: '제자리를 도는 경우',
    tex: 'f(x) = x^3 - 2x + 2',
    f: (x) => x ** 3 - 2 * x + 2,
    df: (x) => 3 * x * x - 2,
    x0: 0,
    root: -1.7692923542386314,
    view: { xMin: -2.4, xMax: 1.8, yMin: -2.5, yMax: 4.5 },
  },
  {
    id: 'atan',
    label: '멀어지는 경우',
    tex: 'f(x) = \\arctan x',
    f: (x) => Math.atan(x),
    df: (x) => 1 / (1 + x * x),
    x0: 1.5,
    root: 0,
    view: { xMin: -12, xMax: 12, yMin: -1.8, yMax: 1.8 },
  },
];

/** x₀, x₁, … for n steps (stops early if f′ = 0 or the value blows up). */
export function newton(fn: NewtonFn, x0: number, n: number): number[] {
  const xs = [x0];
  for (let k = 0; k < n; k++) {
    const x = xs[xs.length - 1];
    const d = fn.df(x);
    if (d === 0 || !isFinite(x) || Math.abs(x) > 1e12) break;
    xs.push(x - fn.f(x) / d);
  }
  return xs;
}

/** How many decimal digits of x agree with the root (−log₁₀ of the error), capped at 15. */
export function correctDigits(x: number, root: number): number {
  const e = Math.abs(x - root);
  if (e === 0) return 15;
  return Math.max(0, Math.min(15, Math.floor(-Math.log10(e))));
}

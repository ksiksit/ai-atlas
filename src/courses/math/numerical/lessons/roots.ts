/*
 * 수치해석 · 방정식의 근: four root-finding methods, convergence orders, Newton basins.
 * No imports, so node can run this file directly.
 */

export type MethodId = 'bisection' | 'newton' | 'secant' | 'fixed';

export interface RootPreset {
  id: string;
  label: string;
  tex: string;
  f: (x: number) => number;
  df: (x: number) => number;
  /** the root, to full double precision */
  root: number;
  /** starting data for each method */
  bracket: [number, number] | null;
  x0: number;
  secant: [number, number];
  /** fixed-point map g with g(root) = root, and its TeX */
  g: (x: number) => number;
  gTex: string;
  fixed0: number;
}

export const PRESETS: RootPreset[] = [
  {
    id: 'cubic',
    label: 'x³ − 2x − 5',
    tex: 'x^3 - 2x - 5',
    f: (x) => x * x * x - 2 * x - 5,
    df: (x) => 3 * x * x - 2,
    root: 2.0945514815423265,
    bracket: [2, 3],
    x0: 3,
    secant: [2, 3],
    g: (x) => Math.cbrt(2 * x + 5),
    gTex: '\\sqrt[3]{2x+5}',
    fixed0: 3,
  },
  {
    id: 'cos',
    label: 'cos x − x',
    tex: '\\cos x - x',
    f: (x) => Math.cos(x) - x,
    df: (x) => -Math.sin(x) - 1,
    root: 0.7390851332151607,
    bracket: [0, 1],
    x0: 1,
    secant: [0, 1],
    g: (x) => Math.cos(x),
    gTex: '\\cos x',
    fixed0: 1,
  },
  {
    id: 'exp',
    label: 'eˣ − 3',
    tex: 'e^x - 3',
    f: (x) => Math.exp(x) - 3,
    df: (x) => Math.exp(x),
    root: Math.log(3),
    bracket: [0, 2],
    x0: 2,
    secant: [0, 2],
    g: (x) => x - 0.2 * (Math.exp(x) - 3),
    gTex: 'x - 0.2\\,(e^x - 3)',
    fixed0: 2,
  },
  {
    id: 'double',
    label: '(x − 1)²',
    tex: '(x-1)^2',
    f: (x) => (x - 1) * (x - 1),
    df: (x) => 2 * (x - 1),
    root: 1,
    bracket: null,
    x0: 2,
    secant: [2, 1.8],
    g: (x) => x - 0.5 * (x - 1) * (x - 1),
    gTex: 'x - \\tfrac12 (x-1)^2',
    fixed0: 2,
  },
];

export const STEPS = 14;

/** The sequence of approximations x₀, x₁, … each method produces (up to `n` new iterates). */
export function iterate(p: RootPreset, m: MethodId, n = STEPS): number[] {
  const xs: number[] = [];
  if (m === 'bisection') {
    if (!p.bracket) return [];
    let [a, b] = p.bracket;
    let fa = p.f(a);
    for (let k = 0; k <= n; k++) {
      const c = (a + b) / 2;
      xs.push(c);
      const fc = p.f(c);
      if (fc === 0) break;
      if (Math.sign(fc) === Math.sign(fa)) {
        a = c;
        fa = fc;
      } else b = c;
    }
    return xs;
  }
  if (m === 'newton') {
    let x = p.x0;
    xs.push(x);
    for (let k = 0; k < n; k++) {
      const d = p.df(x);
      if (d === 0) break;
      const nx = x - p.f(x) / d;
      if (!isFinite(nx)) break;
      xs.push(nx);
      if (nx === x) break;
      x = nx;
    }
    return xs;
  }
  if (m === 'secant') {
    let [a, b] = p.secant;
    xs.push(a, b);
    for (let k = 0; k < n - 1; k++) {
      const fa = p.f(a), fb = p.f(b);
      if (fb === fa) break;
      const c = b - (fb * (b - a)) / (fb - fa);
      if (!isFinite(c)) break;
      xs.push(c);
      if (c === b) break;
      a = b;
      b = c;
    }
    return xs;
  }
  let x = p.fixed0;
  xs.push(x);
  for (let k = 0; k < n; k++) {
    const nx = p.g(x);
    xs.push(nx);
    if (nx === x) break;
    x = nx;
  }
  return xs;
}

export const absErr = (x: number, r: number) => Math.abs(x - r);

/** Correct significant digits of x as an approximation of r, 0..16. */
export function correct(x: number, r: number): number {
  const e = Math.abs(x - r) / Math.max(Math.abs(r), 1e-300);
  if (e === 0) return 16;
  return Math.max(0, Math.min(16, -Math.log10(e)));
}

/**
 * Estimate the order of convergence from consecutive errors: p ≈ log(eₖ₊₁/eₖ) / log(eₖ/eₖ₋₁),
 * using the last triple whose errors are all clearly above rounding noise.
 */
export function orderEstimate(errs: number[]): number | null {
  let best: number | null = null;
  for (let k = 1; k + 1 < errs.length; k++) {
    const [a, b, c] = [errs[k - 1], errs[k], errs[k + 1]];
    if (!(a > 1e-13 && b > 1e-13 && c > 1e-13)) continue;
    if (a === b || b === c) continue;
    best = Math.log(c / b) / Math.log(b / a);
  }
  return best;
}

/** Ratio of the last two errors above noise: the rate for linearly converging methods. */
export function rateEstimate(errs: number[]): number | null {
  let best: number | null = null;
  for (let k = 0; k + 1 < errs.length; k++) {
    if (errs[k] > 1e-13 && errs[k + 1] > 1e-13) best = errs[k + 1] / errs[k];
  }
  return best;
}

/* ───────── Newton on z³ − 1 ───────── */

export const ROOTS3: [number, number][] = [
  [1, 0],
  [-0.5, Math.sqrt(3) / 2],
  [-0.5, -Math.sqrt(3) / 2],
];

/** One Newton step for z³ − 1: z ← z − (z³ − 1) / (3z²) = (2z³ + 1) / (3z²). */
export function newtonStep3(x: number, y: number): [number, number] {
  // z² and z³
  const x2 = x * x - y * y, y2 = 2 * x * y;
  const x3 = x2 * x - y2 * y, y3 = x2 * y + y2 * x;
  // numerator 2z³ + 1, denominator 3z²
  const nx = 2 * x3 + 1, ny = 2 * y3;
  const dx = 3 * x2, dy = 3 * y2;
  const d = dx * dx + dy * dy;
  if (d === 0) return [NaN, NaN];
  return [(nx * dx + ny * dy) / d, (ny * dx - nx * dy) / d];
}

/** Which root (0, 1, 2) Newton reaches from (x, y), and in how many steps; −1 if it does not settle. */
export function basin(x: number, y: number, maxIter = 40, tol = 1e-6): { root: number; iters: number } {
  for (let k = 0; k < maxIter; k++) {
    for (let r = 0; r < 3; r++) {
      const dx = x - ROOTS3[r][0], dy = y - ROOTS3[r][1];
      if (dx * dx + dy * dy < tol * tol) return { root: r, iters: k };
    }
    [x, y] = newtonStep3(x, y);
    if (!isFinite(x)) return { root: -1, iters: k };
  }
  return { root: -1, iters: maxIter };
}

/** The Newton path from (x, y): at most `n` points. */
export function path3(x: number, y: number, n = 30): [number, number][] {
  const out: [number, number][] = [[x, y]];
  for (let k = 0; k < n; k++) {
    [x, y] = newtonStep3(x, y);
    if (!isFinite(x)) break;
    out.push([x, y]);
    const r = ROOTS3.some(([a, b]) => (x - a) ** 2 + (y - b) ** 2 < 1e-14);
    if (r) break;
  }
  return out;
}

/* ───────── fixed-point cobwebs ───────── */

export interface CobwebPreset {
  id: string;
  label: string;
  tex: string;
  g: (x: number) => number;
  dg: (x: number) => number;
  fixed: number;
  x0: number;
  lo: number;
  hi: number;
}

export const COBWEBS: CobwebPreset[] = [
  { id: 'cos', label: 'cos x', tex: 'g(x) = \\cos x', g: Math.cos, dg: (x) => -Math.sin(x), fixed: 0.7390851332151607, x0: 0.1, lo: 0, hi: 1.2 },
  { id: 'babylon', label: '(x + 2/x)/2', tex: 'g(x) = \\tfrac12\\left(x + \\tfrac{2}{x}\\right)', g: (x) => (x + 2 / x) / 2, dg: (x) => 0.5 - 1 / (x * x), fixed: Math.SQRT2, x0: 0.6, lo: 0.4, hi: 2.4 },
  { id: 'flip', label: '2/x', tex: 'g(x) = \\tfrac{2}{x}', g: (x) => 2 / x, dg: (x) => -2 / (x * x), fixed: Math.SQRT2, x0: 1, lo: 0.4, hi: 2.4 },
];

export function cobweb(p: CobwebPreset, n: number): number[] {
  const xs = [p.x0];
  let x = p.x0;
  for (let k = 0; k < n; k++) {
    x = p.g(x);
    xs.push(x);
  }
  return xs;
}

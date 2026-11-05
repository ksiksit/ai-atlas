/*
 * 다변수 미적분 · 다중 적분: pure logic.
 * Riemann sums over rectangles, iterated integrals over a triangle in both orders, the polar area
 * element, the Gaussian integral over disks and squares, and Monte Carlo estimates of a ball's volume.
 * No imports (the PRNG and erf are inlined), so node can run it directly.
 */

/* ───────── volume over a rectangle ───────── */

export const VOL_F = (x: number, y: number) => x * x + y + 1;
export const VOL_BOX = { x0: 0, x1: 2, y0: 0, y1: 1 };
/** ∫₀² ∫₀¹ (x² + y + 1) dy dx = 8/3 + 1/2·2 + 2 = 17/3. */
export const VOL_EXACT = 17 / 3;
export const VOL_TEX = 'f(x, y) = x^2 + y + 1';

export type Rule = 'corner' | 'mid' | 'max';

/** The height used for column (i, j) under each rule. */
export function columnHeight(f: (x: number, y: number) => number, x0: number, y0: number, dx: number, dy: number, rule: Rule): number {
  if (rule === 'corner') return f(x0, y0);
  if (rule === 'mid') return f(x0 + dx / 2, y0 + dy / 2);
  // the largest corner value: f here grows with x and y, so this is an upper sum
  return Math.max(f(x0, y0), f(x0 + dx, y0), f(x0, y0 + dy), f(x0 + dx, y0 + dy));
}

export function riemann2(f: (x: number, y: number) => number, n: number, rule: Rule, box = VOL_BOX): number {
  const dx = (box.x1 - box.x0) / n;
  const dy = (box.y1 - box.y0) / n;
  let s = 0;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) s += columnHeight(f, box.x0 + i * dx, box.y0 + j * dy, dx, dy, rule) * dx * dy;
  return s;
}

/* ───────── switching the order over a triangle ───────── */

/**
 * The region T = { 0 ≤ y ≤ x ≤ 1 } and the integrand e^{x²}, which has no elementary antiderivative in x.
 * dx dy (horizontal strips): ∫₀¹ ∫_y¹ e^{x²} dx dy — the inside cannot be done by hand.
 * dy dx (vertical strips):   ∫₀¹ ∫₀^x e^{x²} dy dx = ∫₀¹ x e^{x²} dx = (e − 1)/2.
 */
export const TRI_F = (x: number) => Math.exp(x * x);
export const TRI_EXACT = (Math.E - 1) / 2;

/** Sum of n vertical strips: strip at x has height x (from y = 0 to y = x), each worth x e^{x²} Δx. */
export function stripsVertical(n: number): number {
  let s = 0;
  for (let i = 0; i < n; i++) {
    const x = (i + 0.5) / n;
    s += x * TRI_F(x) / n;
  }
  return s;
}

/** Sum of n horizontal strips: strip at y runs x from y to 1, each worth (∫_y¹ e^{x²} dx) Δy, done numerically. */
export function stripsHorizontal(n: number, inner = 400): number {
  let s = 0;
  for (let j = 0; j < n; j++) {
    const y = (j + 0.5) / n;
    s += simpson(TRI_F, y, 1, inner) / n;
  }
  return s;
}

export function simpson(f: (x: number) => number, a: number, b: number, n = 200): number {
  if (n % 2) n++;
  const h = (b - a) / n;
  let s = f(a) + f(b);
  for (let k = 1; k < n; k++) s += (k % 2 ? 4 : 2) * f(a + k * h);
  return (s * h) / 3;
}

/* ───────── the polar area element ───────── */

/** Exact area of the polar cell r ∈ [r, r + dr], θ ∈ [θ, θ + dθ], and its approximation r dr dθ. */
export function polarCell(r: number, dr: number, dth: number): { exact: number; approx: number } {
  return { exact: (((r + dr) ** 2 - r * r) / 2) * dth, approx: r * dr * dth };
}

/* ───────── the Gaussian integral ───────── */

/** ∬ over the disk of radius R of e^{−(x²+y²)} = π (1 − e^{−R²}). */
export const gaussDisk = (R: number) => Math.PI * (1 - Math.exp(-R * R));

/** Abramowitz–Stegun 7.1.26 (|error| < 1.5e-7), enough for four-digit readouts. */
export function erf(x: number): number {
  const s = Math.sign(x);
  x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return s * y;
}

/** ∫_{−R}^{R} e^{−x²} dx = √π erf(R), and the square [−R, R]² is that squared. */
export const gauss1 = (R: number) => Math.sqrt(Math.PI) * erf(R);
export const gaussSquare = (R: number) => gauss1(R) ** 2;

/* ───────── volume of a ball ───────── */

/** Mulberry32, the same PRNG as lib/math's rng, inlined so this file needs no imports. */
export function prng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const BALL = (4 / 3) * Math.PI;

export interface McPoint {
  x: number;
  y: number;
  z: number;
  inside: boolean;
}

/** N points uniform in the cube [−1, 1]³; the fraction inside the unit ball times 8 estimates 4π/3. */
export function monteCarloBall(seed: number, N: number): { points: McPoint[]; inside: number; estimate: number } {
  const r = prng(seed);
  const points: McPoint[] = [];
  let inside = 0;
  for (let k = 0; k < N; k++) {
    const x = 2 * r() - 1, y = 2 * r() - 1, z = 2 * r() - 1;
    const ins = x * x + y * y + z * z <= 1;
    if (ins) inside++;
    points.push({ x, y, z, inside: ins });
  }
  return { points, inside, estimate: (8 * inside) / N };
}

/** Running estimate after each of the N points (for the convergence plot). */
export function runningEstimate(points: McPoint[]): number[] {
  const out: number[] = [];
  let inside = 0;
  points.forEach((p, k) => {
    if (p.inside) inside++;
    out.push((8 * inside) / (k + 1));
  });
  return out;
}

/** The ball as a spherical-coordinates Riemann sum: Σ ρ² sin φ Δρ Δφ Δθ with n cells per axis (midpoints). */
export function sphericalSum(n: number): number {
  const dr = 1 / n, dp = Math.PI / n, dt = (2 * Math.PI) / n;
  let s = 0;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const rho = (i + 0.5) * dr, phi = (j + 0.5) * dp;
      s += rho * rho * Math.sin(phi) * dr * dp * dt * n; // the θ sum is n identical terms
    }
  return s;
}

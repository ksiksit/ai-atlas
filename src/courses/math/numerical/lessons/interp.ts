/*
 * 수치해석 · 보간과 근사: pure logic (no imports, so node can run it directly).
 * Lagrange and Newton interpolation, Runge's function with equispaced and Chebyshev nodes,
 * natural cubic splines, and least-squares polynomial fits by Householder QR.
 */

export interface Pt {
  x: number;
  y: number;
}

/* ───────── Lagrange and Newton ───────── */

/** The j-th Lagrange basis polynomial ℓⱼ(x): 1 at xⱼ, 0 at every other node. */
export function basis(xs: number[], j: number, x: number): number {
  let v = 1;
  for (let k = 0; k < xs.length; k++) if (k !== j) v *= (x - xs[k]) / (xs[j] - xs[k]);
  return v;
}

/** The interpolating polynomial p(x) = Σ yⱼ ℓⱼ(x). */
export function lagrange(pts: Pt[], x: number): number {
  const xs = pts.map((p) => p.x);
  let s = 0;
  for (let j = 0; j < pts.length; j++) s += pts[j].y * basis(xs, j, x);
  return s;
}

/**
 * Divided-difference table: rows[i][k] = f[x_i, …, x_{i+k}]. Column 0 holds the y values.
 * The Newton coefficients are the top entries rows[0][k].
 */
export function dividedDifferences(pts: Pt[]): number[][] {
  const n = pts.length;
  const t: number[][] = pts.map((p) => [p.y]);
  for (let k = 1; k < n; k++) for (let i = 0; i + k < n; i++) t[i][k] = (t[i + 1][k - 1] - t[i][k - 1]) / (pts[i + k].x - pts[i].x);
  return t;
}

/** Newton form p(x) = c₀ + c₁(x − x₀) + c₂(x − x₀)(x − x₁) + …, evaluated by nested multiplication. */
export function newtonEval(xs: number[], c: number[], x: number): number {
  let v = c[c.length - 1];
  for (let k = c.length - 2; k >= 0; k--) v = v * (x - xs[k]) + c[k];
  return v;
}

/** Coefficients of p in the power basis a₀ + a₁x + … (for showing the polynomial). */
export function powerCoefficients(pts: Pt[]): number[] {
  const xs = pts.map((p) => p.x);
  const c = dividedDifferences(pts)[0];
  // expand the Newton form: start from the last coefficient and multiply by (x − x_k)
  let poly = [c[c.length - 1]];
  for (let k = c.length - 2; k >= 0; k--) {
    const next = new Array(poly.length + 1).fill(0);
    for (let i = 0; i < poly.length; i++) {
      next[i + 1] += poly[i];
      next[i] -= xs[k] * poly[i];
    }
    next[0] += c[k];
    poly = next;
  }
  return poly;
}

/* ───────── Runge's function ───────── */

export const runge = (x: number) => 1 / (1 + 25 * x * x);

/** n equally spaced nodes on [−1, 1], ends included. */
export const equispaced = (n: number) => Array.from({ length: n }, (_, i) => (n === 1 ? 0 : -1 + (2 * i) / (n - 1)));

/** n Chebyshev nodes cos((2k + 1)π / 2n), crowded toward the ends of [−1, 1]. */
export const chebyshev = (n: number) => Array.from({ length: n }, (_, k) => Math.cos(((2 * k + 1) * Math.PI) / (2 * n))).reverse();

/** Interpolate f at the given nodes; returns the polynomial as a function (barycentric form, stable). */
export function interpolant(f: (x: number) => number, nodes: number[]): (x: number) => number {
  const n = nodes.length;
  const w = nodes.map((xj, j) => {
    let p = 1;
    for (let k = 0; k < n; k++) if (k !== j) p *= xj - nodes[k];
    return 1 / p;
  });
  const fy = nodes.map(f);
  return (x: number) => {
    let num = 0;
    let den = 0;
    for (let j = 0; j < n; j++) {
      const d = x - nodes[j];
      if (d === 0) return fy[j];
      const t = w[j] / d;
      num += t * fy[j];
      den += t;
    }
    return num / den;
  };
}

/** Largest |f − p| over [−1, 1], sampled at 2,001 points. */
export function maxError(f: (x: number) => number, p: (x: number) => number, samples = 2001): number {
  let m = 0;
  for (let i = 0; i < samples; i++) {
    const x = -1 + (2 * i) / (samples - 1);
    m = Math.max(m, Math.abs(f(x) - p(x)));
  }
  return m;
}

/* ───────── natural cubic spline ───────── */

/**
 * Natural cubic spline through points with increasing x: piecewise cubics that match values,
 * slopes and second derivatives at every inner point, with zero second derivative at both ends.
 * Solves the tridiagonal system for the second derivatives M_i (Thomas algorithm).
 */
export function naturalSpline(pts: Pt[]): (x: number) => number {
  const n = pts.length;
  if (n < 3) return (x) => (n === 2 ? pts[0].y + ((pts[1].y - pts[0].y) * (x - pts[0].x)) / (pts[1].x - pts[0].x) : pts[0]?.y ?? 0);
  const h = Array.from({ length: n - 1 }, (_, i) => pts[i + 1].x - pts[i].x);
  const M = new Array(n).fill(0);
  // interior equations: h_{i-1} M_{i-1} + 2(h_{i-1}+h_i) M_i + h_i M_{i+1} = 6(Δ_i − Δ_{i−1})
  const m = n - 2;
  const a = new Array(m).fill(0), b = new Array(m).fill(0), c = new Array(m).fill(0), d = new Array(m).fill(0);
  for (let i = 1; i <= m; i++) {
    a[i - 1] = h[i - 1];
    b[i - 1] = 2 * (h[i - 1] + h[i]);
    c[i - 1] = h[i];
    d[i - 1] = 6 * ((pts[i + 1].y - pts[i].y) / h[i] - (pts[i].y - pts[i - 1].y) / h[i - 1]);
  }
  for (let i = 1; i < m; i++) {
    const w = a[i] / b[i - 1];
    b[i] -= w * c[i - 1];
    d[i] -= w * d[i - 1];
  }
  for (let i = m - 1; i >= 0; i--) M[i + 1] = (d[i] - (i < m - 1 ? c[i] * M[i + 2] : 0)) / b[i];
  return (x: number) => {
    let i = 0;
    while (i < n - 2 && x > pts[i + 1].x) i++;
    const x0 = pts[i].x, x1 = pts[i + 1].x, hi = h[i];
    const A = (x1 - x) / hi, B = (x - x0) / hi;
    return A * pts[i].y + B * pts[i + 1].y + (((A * A * A - A) * M[i] + (B * B * B - B) * M[i + 1]) * hi * hi) / 6;
  };
}

/* ───────── least squares ───────── */

/** Least-squares polynomial of degree d by Householder QR on the Vandermonde matrix (stable). */
export function lsqPoly(pts: Pt[], d: number): number[] {
  const m = pts.length, n = d + 1;
  const A = pts.map((p) => Array.from({ length: n }, (_, k) => p.x ** k));
  const y = pts.map((p) => p.y);
  for (let k = 0; k < n; k++) {
    let norm = 0;
    for (let i = k; i < m; i++) norm += A[i][k] * A[i][k];
    norm = Math.sqrt(norm);
    if (norm === 0) continue;
    const alpha = A[k][k] > 0 ? -norm : norm;
    const v = new Array(m).fill(0);
    for (let i = k; i < m; i++) v[i] = A[i][k];
    v[k] -= alpha;
    let vv = 0;
    for (let i = k; i < m; i++) vv += v[i] * v[i];
    if (vv === 0) continue;
    for (let j = k; j < n; j++) {
      let s = 0;
      for (let i = k; i < m; i++) s += v[i] * A[i][j];
      s = (2 * s) / vv;
      for (let i = k; i < m; i++) A[i][j] -= s * v[i];
    }
    let s = 0;
    for (let i = k; i < m; i++) s += v[i] * y[i];
    s = (2 * s) / vv;
    for (let i = k; i < m; i++) y[i] -= s * v[i];
  }
  const c = new Array(n).fill(0);
  for (let k = n - 1; k >= 0; k--) {
    let s = y[k];
    for (let j = k + 1; j < n; j++) s -= A[k][j] * c[j];
    c[k] = Math.abs(A[k][k]) < 1e-14 ? 0 : s / A[k][k];
  }
  return c;
}

export const polyAt = (c: number[], x: number) => c.reduceRight((acc, ck) => acc * x + ck, 0);

/** The curve the noisy data come from. */
export const truth = (x: number) => Math.sin(2.2 * x) + 0.4 * x;

/** n noisy samples of `truth` at equally spaced x in [−1, 1]; `rand` is a seeded uniform generator. */
export function noisyData(n: number, sigma: number, rand: () => number): Pt[] {
  return Array.from({ length: n }, (_, i) => {
    const x = -1 + (2 * i) / (n - 1);
    // Box–Muller for a normal sample
    const u = Math.max(1e-12, rand()), v = rand();
    const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    return { x, y: truth(x) + sigma * z };
  });
}

/** Root-mean-square distance between the fit and the data, and between the fit and the true curve. */
export function fitErrors(pts: Pt[], c: number[]): { train: number; truth: number } {
  let tr = 0;
  for (const p of pts) tr += (polyAt(c, p.x) - p.y) ** 2;
  let te = 0;
  const S = 801;
  for (let i = 0; i < S; i++) {
    const x = -1 + (2 * i) / (S - 1);
    te += (polyAt(c, x) - truth(x)) ** 2;
  }
  return { train: Math.sqrt(tr / pts.length), truth: Math.sqrt(te / S) };
}

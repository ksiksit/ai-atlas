/*
 * 다변수 미적분 · 극값과 라그랑주 승수: pure logic.
 * Surfaces with analytic gradients and Hessians, critical-point search, classification by the
 * Hessian, slices, gradient descent, Lagrange problems, and contour segments (marching squares).
 * No imports, so node can run it directly.
 */

export type V2 = [number, number];
/** Symmetric 2×2 matrix [[a, b], [b, c]] stored as [a, b, c]. */
export type Sym2 = [number, number, number];

export interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export interface Surface {
  id: string;
  name: string;
  /** KaTeX for f(x, y). */
  tex: string;
  f: (x: number, y: number) => number;
  grad: (x: number, y: number) => V2;
  hess: (x: number, y: number) => Sym2;
  box: Box;
}

export const SURFACES: Record<'cubic' | 'wave' | 'saddle' | 'flat', Surface> = {
  cubic: {
    id: 'cubic',
    name: '바닥과 말안장',
    tex: 'f(x, y) = x^3 - 3x + y^2',
    f: (x, y) => x * x * x - 3 * x + y * y,
    grad: (x, y) => [3 * x * x - 3, 2 * y],
    hess: (x) => [6 * x, 0, 2],
    box: { x0: -2.2, x1: 2.2, y0: -1.8, y1: 1.8 },
  },
  wave: {
    id: 'wave',
    name: '물결',
    tex: 'f(x, y) = \\sin x \\cos y',
    f: (x, y) => Math.sin(x) * Math.cos(y),
    grad: (x, y) => [Math.cos(x) * Math.cos(y), -Math.sin(x) * Math.sin(y)],
    hess: (x, y) => [-Math.sin(x) * Math.cos(y), -Math.cos(x) * Math.sin(y), -Math.sin(x) * Math.cos(y)],
    box: { x0: -3.6, x1: 3.6, y0: -2.6, y1: 2.6 },
  },
  saddle: {
    id: 'saddle',
    name: '말안장',
    tex: 'f(x, y) = x^2 - y^2',
    f: (x, y) => x * x - y * y,
    grad: (x, y) => [2 * x, -2 * y],
    hess: () => [2, 0, -2],
    box: { x0: -2, x1: 2, y0: -2, y1: 2 },
  },
  flat: {
    id: 'flat',
    name: '판정 불가',
    tex: 'f(x, y) = x^4 + y^2',
    f: (x, y) => x ** 4 + y * y,
    grad: (x, y) => [4 * x ** 3, 2 * y],
    hess: (x) => [12 * x * x, 0, 2],
    box: { x0: -1.6, x1: 1.6, y0: -1.6, y1: 1.6 },
  },
};

/* ───────── Hessian test ───────── */

export const det2 = (h: Sym2) => h[0] * h[2] - h[1] * h[1];

/** Eigenvalues of a symmetric 2×2 matrix, smaller first. */
export function eig2(h: Sym2): [number, number] {
  const m = (h[0] + h[2]) / 2;
  const d = Math.sqrt(((h[0] - h[2]) / 2) ** 2 + h[1] * h[1]);
  return [m - d, m + d];
}

/** Unit eigenvector for eigenvalue lam of a symmetric 2×2 matrix. */
export function eigvec2(h: Sym2, lam: number): V2 {
  // (a − λ) x + b y = 0  →  (b, λ − a) unless that is zero, then (λ − c, b)
  let v: V2 = [h[1], lam - h[0]];
  if (Math.hypot(v[0], v[1]) < 1e-9) v = [lam - h[2], h[1]];
  if (Math.hypot(v[0], v[1]) < 1e-9) v = [1, 0];
  const n = Math.hypot(v[0], v[1]);
  return [v[0] / n, v[1] / n];
}

export type Kind = 'min' | 'max' | 'saddle' | 'unknown';
export const KIND_KO: Record<Kind, string> = { min: '극소', max: '극대', saddle: '안장점', unknown: '판정 불가' };

export function classify(h: Sym2, eps = 1e-6): Kind {
  const D = det2(h);
  if (Math.abs(D) < eps) return 'unknown';
  if (D < 0) return 'saddle';
  return h[0] > 0 ? 'min' : 'max';
}

export interface Critical {
  p: V2;
  value: number;
  h: Sym2;
  kind: Kind;
}

/** Critical points inside the box: Newton's method on ∇f = 0 from a grid of starting points. */
export function criticalPoints(s: Surface, seeds = 13): Critical[] {
  const out: Critical[] = [];
  const { x0, x1, y0, y1 } = s.box;
  for (let i = 0; i < seeds; i++)
    for (let j = 0; j < seeds; j++) {
      let x = x0 + ((i + 0.5) / seeds) * (x1 - x0);
      let y = y0 + ((j + 0.5) / seeds) * (y1 - y0);
      let ok = false;
      for (let it = 0; it < 60; it++) {
        const g = s.grad(x, y);
        if (Math.hypot(g[0], g[1]) < 1e-11) {
          ok = true;
          break;
        }
        const h = s.hess(x, y);
        const D = det2(h);
        if (Math.abs(D) < 1e-12) {
          // flat direction: fall back to a small gradient step
          x -= 0.1 * g[0];
          y -= 0.1 * g[1];
          continue;
        }
        // solve H δ = g
        const dx = (h[2] * g[0] - h[1] * g[1]) / D;
        const dy = (h[0] * g[1] - h[1] * g[0]) / D;
        x -= dx;
        y -= dy;
        if (!isFinite(x) || !isFinite(y)) break;
      }
      if (!ok) {
        const g = s.grad(x, y);
        ok = Math.hypot(g[0], g[1]) < 1e-6;
      }
      if (!ok || x < x0 || x > x1 || y < y0 || y > y1) continue;
      // Newton crawls along flat directions (x⁴ at 0), so snap tiny coordinates and merge near neighbours
      if (Math.abs(x) < 1e-4) x = 0;
      if (Math.abs(y) < 1e-4) y = 0;
      if (out.some((c) => Math.hypot(c.p[0] - x, c.p[1] - y) < 1e-3)) continue;
      const h = s.hess(x, y);
      out.push({ p: [x, y], value: s.f(x, y), h, kind: classify(h) });
    }
  return out.sort((a, b) => a.p[0] - b.p[0] || a.p[1] - b.p[1]);
}

/* ───────── slices ───────── */

/** Second derivative of t ↦ f(p + t u) at t = 0 for a unit u: uᵀ H u. */
export const curvatureAlong = (h: Sym2, u: V2) => h[0] * u[0] * u[0] + 2 * h[1] * u[0] * u[1] + h[2] * u[1] * u[1];

/* ───────── gradient descent ───────── */

export interface Descent {
  path: V2[];
  values: number[];
  /** Step at which |∇f| first fell below tol, or null. */
  converged: number | null;
  diverged: boolean;
}

export function descend(s: Surface, start: V2, eta: number, steps: number, tol = 1e-3): Descent {
  const path: V2[] = [start];
  const values = [s.f(start[0], start[1])];
  let p = start;
  let converged: number | null = null;
  let diverged = false;
  for (let k = 1; k <= steps; k++) {
    const g = s.grad(p[0], p[1]);
    if (converged === null && Math.hypot(g[0], g[1]) < tol) converged = k - 1;
    p = [p[0] - eta * g[0], p[1] - eta * g[1]];
    if (!isFinite(p[0]) || Math.abs(p[0]) > 1e6 || Math.abs(p[1]) > 1e6) {
      diverged = true;
      break;
    }
    path.push(p);
    values.push(s.f(p[0], p[1]));
  }
  if (converged === null) {
    const g = s.grad(p[0], p[1]);
    if (Math.hypot(g[0], g[1]) < tol) converged = path.length - 1;
  }
  return { path, values, converged, diverged };
}

/** A long, narrow bowl: f = (x² + 10 y²) / 2. Curvatures 1 and 10, so steps above 2/10 blow up. */
export const VALLEY: Surface = {
  id: 'valley',
  name: '좁은 골짜기',
  tex: 'f(x, y) = \\tfrac12 (x^2 + 10y^2)',
  f: (x, y) => 0.5 * (x * x + 10 * y * y),
  grad: (x, y) => [x, 10 * y],
  hess: () => [1, 0, 10],
  box: { x0: -4, x1: 4, y0: -2.4, y1: 2.4 },
};

/* ───────── Lagrange multipliers ───────── */

export interface LagrangeProblem {
  id: 'circle' | 'fence';
  name: string;
  fTex: string;
  gTex: string;
  f: (x: number, y: number) => number;
  grad: (x: number, y: number) => V2;
  /** Constraint g(x, y) = c, its gradient, and a parametrisation t ∈ [t0, t1] of the curve. */
  g: (x: number, y: number) => number;
  gradG: (x: number, y: number) => V2;
  curve: (t: number) => V2;
  t0: number;
  t1: number;
  tStart: number;
  box: Box;
  /** The constrained maximum, for the readouts. */
  best: V2;
  tBest: number;
}

export const LAGRANGE: Record<'circle' | 'fence', LagrangeProblem> = {
  circle: {
    id: 'circle',
    name: '원 위에서 xy 최대',
    fTex: 'f(x, y) = xy',
    gTex: 'x^2 + y^2 = 8',
    f: (x, y) => x * y,
    grad: (x, y) => [y, x],
    g: (x, y) => x * x + y * y,
    gradG: (x, y) => [2 * x, 2 * y],
    curve: (t) => [Math.sqrt(8) * Math.cos(t), Math.sqrt(8) * Math.sin(t)],
    t0: 0,
    t1: Math.PI / 2,
    tStart: 0.25,
    box: { x0: -0.6, x1: 3.6, y0: -0.6, y1: 3.6 },
    best: [2, 2],
    tBest: Math.PI / 4,
  },
  fence: {
    id: 'fence',
    name: '울타리 20m로 가장 넓은 직사각형',
    fTex: 'A(x, y) = xy',
    gTex: '2x + 2y = 20',
    f: (x, y) => x * y,
    grad: (x, y) => [y, x],
    g: (x, y) => 2 * x + 2 * y,
    gradG: () => [2, 2],
    curve: (t) => [t, 10 - t],
    t0: 0.5,
    t1: 9.5,
    tStart: 2,
    box: { x0: -0.5, x1: 10.5, y0: -0.5, y1: 10.5 },
    best: [5, 5],
    tBest: 5,
  },
};

/** Angle in degrees between ∇f and ∇g (0 or 180 when they are parallel). */
export function gradAngle(pr: LagrangeProblem, p: V2): number {
  const a = pr.grad(p[0], p[1]);
  const b = pr.gradG(p[0], p[1]);
  const c = (a[0] * b[0] + a[1] * b[1]) / (Math.hypot(a[0], a[1]) * Math.hypot(b[0], b[1]) || 1);
  return (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI;
}

/** λ with ∇f = λ ∇g, as the least-squares ratio (exact at the optimum). */
export function lambdaAt(pr: LagrangeProblem, p: V2): number {
  const a = pr.grad(p[0], p[1]);
  const b = pr.gradG(p[0], p[1]);
  return (a[0] * b[0] + a[1] * b[1]) / (b[0] * b[0] + b[1] * b[1] || 1);
}

/* ───────── contours (marching squares) ───────── */

/** Line segments of the level set f = level over the box, on an nx × ny grid. */
export function contour(f: (x: number, y: number) => number, box: Box, level: number, nx = 60, ny = 60): [V2, V2][] {
  const segs: [V2, V2][] = [];
  const dx = (box.x1 - box.x0) / nx;
  const dy = (box.y1 - box.y0) / ny;
  const val: number[] = new Array((nx + 1) * (ny + 1));
  for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) val[j * (nx + 1) + i] = f(box.x0 + i * dx, box.y0 + j * dy) - level;
  const lerp = (a: V2, b: V2, va: number, vb: number): V2 => {
    const t = va / (va - vb);
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  };
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      const x = box.x0 + i * dx, y = box.y0 + j * dy;
      const c: V2[] = [[x, y], [x + dx, y], [x + dx, y + dy], [x, y + dy]];
      const v = [val[j * (nx + 1) + i], val[j * (nx + 1) + i + 1], val[(j + 1) * (nx + 1) + i + 1], val[(j + 1) * (nx + 1) + i]];
      const pts: V2[] = [];
      for (let k = 0; k < 4; k++) {
        const a = v[k], b = v[(k + 1) % 4];
        if ((a < 0) !== (b < 0)) pts.push(lerp(c[k], c[(k + 1) % 4], a, b));
      }
      if (pts.length === 2) segs.push([pts[0], pts[1]]);
      else if (pts.length === 4) {
        segs.push([pts[0], pts[1]], [pts[2], pts[3]]);
      }
    }
  return segs;
}

/** Evenly spaced contour levels between the surface's min and max over the box, sampled on a grid. */
export function levels(f: (x: number, y: number) => number, box: Box, n: number): number[] {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i <= 40; i++)
    for (let j = 0; j <= 40; j++) {
      const v = f(box.x0 + ((box.x1 - box.x0) * i) / 40, box.y0 + ((box.y1 - box.y0) * j) / 40);
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
  return Array.from({ length: n }, (_, k) => lo + ((k + 0.5) / n) * (hi - lo));
}

/*
 * 수치해석 · 최적화: pure helpers (no imports, so node can run them).
 * Points are [x, y]. Every method returns its whole path so the figures can step through it.
 */

export type P2 = [number, number];
export interface Fn2 {
  f: (p: P2) => number;
  g: (p: P2) => P2;
  /** Hessian [[fxx, fxy], [fxy, fyy]]. */
  h: (p: P2) => [[number, number], [number, number]];
}

/** f = ½(x² + κ y²): eigenvalues 1 and κ, condition number κ, minimum at the origin. */
export function quad(kappa: number): Fn2 {
  return {
    f: ([x, y]) => 0.5 * (x * x + kappa * y * y),
    g: ([x, y]) => [x, kappa * y],
    h: () => [
      [1, 0],
      [0, kappa],
    ],
  };
}

/** Rosenbrock's banana valley, minimum at (1, 1). */
export const rosen: Fn2 = {
  f: ([x, y]) => (1 - x) ** 2 + 100 * (y - x * x) ** 2,
  g: ([x, y]) => [-2 * (1 - x) - 400 * x * (y - x * x), 200 * (y - x * x)],
  h: ([x, y]) => [
    [2 - 400 * (y - x * x) + 800 * x * x, -400 * x],
    [-400 * x, 200],
  ],
};

const norm = (v: P2) => Math.hypot(v[0], v[1]);
const sub = (a: P2, b: P2): P2 => [a[0] - b[0], a[1] - b[1]];

/* ───────── first-order methods on a quadratic ───────── */

export type Method = 'gd' | 'momentum' | 'nesterov';

/**
 * Tuned constant steps for a quadratic with eigenvalues 1 and κ (the textbook optimal choices):
 * gradient descent η = 2/(1+κ); heavy ball η = 4/(1+√κ)², β = ((√κ−1)/(√κ+1))²; Nesterov η = 1/κ, β = (√κ−1)/(√κ+1).
 */
export function runQuad(kappa: number, method: Method, start: P2, tol = 1e-6, maxIt = 20000): P2[] {
  const F = quad(kappa);
  const s = Math.sqrt(kappa);
  const path: P2[] = [start];
  let x: P2 = start;
  let prev: P2 = start;
  for (let k = 0; k < maxIt; k++) {
    let next: P2;
    if (method === 'gd') {
      const eta = 2 / (1 + kappa);
      const g = F.g(x);
      next = [x[0] - eta * g[0], x[1] - eta * g[1]];
    } else if (method === 'momentum') {
      const eta = 4 / (1 + s) ** 2;
      const beta = ((s - 1) / (s + 1)) ** 2;
      const g = F.g(x);
      next = [x[0] - eta * g[0] + beta * (x[0] - prev[0]), x[1] - eta * g[1] + beta * (x[1] - prev[1])];
    } else {
      const eta = 1 / kappa;
      const beta = (s - 1) / (s + 1);
      const look: P2 = [x[0] + beta * (x[0] - prev[0]), x[1] + beta * (x[1] - prev[1])];
      const g = F.g(look);
      next = [look[0] - eta * g[0], look[1] - eta * g[1]];
    }
    prev = x;
    x = next;
    path.push(x);
    if (norm(x) < tol) break;
  }
  return path;
}

/** Iterations to bring ‖x‖ below tol from start. */
export const itersQuad = (kappa: number, method: Method, start: P2, tol = 1e-6) => runQuad(kappa, method, start, tol).length - 1;

/* ───────── line search, Newton, BFGS on Rosenbrock ───────── */

export interface LineSearch {
  /** Step lengths tried, in order; the last one was accepted. */
  tried: number[];
  /** f along the search direction at each tried step. */
  values: number[];
  f0: number;
  /** Directional derivative at t = 0 (negative for a descent direction). */
  slope: number;
}

export const ARMIJO_C = 1e-4;

/** Backtracking (Armijo): start at t0, halve until f(x + t d) ≤ f(x) + c t ∇f·d. */
export function backtrack(F: Fn2, x: P2, d: P2, t0 = 1, c = ARMIJO_C): LineSearch {
  const f0 = F.f(x);
  const g = F.g(x);
  const slope = g[0] * d[0] + g[1] * d[1];
  const tried: number[] = [];
  const values: number[] = [];
  let t = t0;
  for (let k = 0; k < 60; k++) {
    const v = F.f([x[0] + t * d[0], x[1] + t * d[1]]);
    tried.push(t);
    values.push(v);
    if (v <= f0 + c * t * slope) break;
    t /= 2;
  }
  return { tried, values, f0, slope };
}

export interface Run {
  path: P2[];
  searches: LineSearch[];
  /** Function evaluations (including line-search trials) and gradient evaluations. */
  fEvals: number;
  converged: boolean;
}

export type RosenMethod = 'gd' | 'newton' | 'bfgs';

/** Run a method on F from start until ‖∇f‖ < tol. GD and BFGS use backtracking; Newton takes full steps. */
export function runRosen(F: Fn2, method: RosenMethod, start: P2, tol = 1e-6, maxIt = 50000): Run {
  const path: P2[] = [start];
  const searches: LineSearch[] = [];
  let x: P2 = start;
  let fEvals = 0;
  // BFGS inverse-Hessian approximation, starting from the identity
  let Hi = [
    [1, 0],
    [0, 1],
  ];
  for (let k = 0; k < maxIt; k++) {
    const g = F.g(x);
    if (norm(g) < tol) return { path, searches, fEvals, converged: true };
    let d: P2;
    if (method === 'newton') {
      const [[a, b], [, c]] = F.h(x);
      const det = a * c - b * b;
      d = [-(c * g[0] - b * g[1]) / det, -(-b * g[0] + a * g[1]) / det];
      x = [x[0] + d[0], x[1] + d[1]];
      fEvals++;
      path.push(x);
      continue;
    }
    d = method === 'gd' ? [-g[0], -g[1]] : [-(Hi[0][0] * g[0] + Hi[0][1] * g[1]), -(Hi[1][0] * g[0] + Hi[1][1] * g[1])];
    const ls = backtrack(F, x, d, 1);
    searches.push(ls);
    fEvals += ls.tried.length;
    const t = ls.tried[ls.tried.length - 1];
    const nx: P2 = [x[0] + t * d[0], x[1] + t * d[1]];
    if (method === 'bfgs') {
      const s = sub(nx, x);
      const y = sub(F.g(nx), g);
      const sy = s[0] * y[0] + s[1] * y[1];
      if (sy > 1e-12) {
        const rho = 1 / sy;
        // H ← (I − ρ s yᵀ) H (I − ρ y sᵀ) + ρ s sᵀ
        const I = (i: number, j: number) => (i === j ? 1 : 0);
        const A = [0, 1].map((i) => [0, 1].map((j) => I(i, j) - rho * s[i] * y[j]));
        const AH = [0, 1].map((i) => [0, 1].map((j) => A[i][0] * Hi[0][j] + A[i][1] * Hi[1][j]));
        Hi = [0, 1].map((i) => [0, 1].map((j) => AH[i][0] * A[j][0] + AH[i][1] * A[j][1] + rho * s[i] * s[j]));
      }
    }
    x = nx;
    path.push(x);
  }
  return { path, searches, fEvals, converged: false };
}

/* ───────── Newton going the wrong way ───────── */

/** f(x) = x⁴/4 − x²/2 has minima at ±1 and a maximum at 0. Newton on f′ = 0 from x0. */
export function newton1d(x0: number, steps = 8): number[] {
  const out = [x0];
  let x = x0;
  for (let k = 0; k < steps; k++) {
    x = x - (x ** 3 - x) / (3 * x * x - 1);
    out.push(x);
  }
  return out;
}

/* ───────── stochastic gradient descent on a line fit ───────── */

export interface Data {
  xs: number[];
  ys: number[];
  /** The least-squares answer, for comparison. */
  best: P2;
}

/** n points on y = 2x + 1 plus noise of standard deviation sd, x uniform in [0, 1]. */
export function lineData(n: number, sd: number, rand: () => number): Data {
  const gauss = () => {
    let u = 0, v = 0;
    while (u === 0) u = rand();
    while (v === 0) v = rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const xs = Array.from({ length: n }, () => rand());
  const ys = xs.map((x) => 2 * x + 1 + sd * gauss());
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0;
  xs.forEach((x, i) => {
    sxy += (x - mx) * (ys[i] - my);
    sxx += (x - mx) ** 2;
  });
  const a = sxy / sxx;
  return { xs, ys, best: [a, my - a * mx] };
}

/** Mean squared error of y ≈ a x + b. */
export const mse = (d: Data, [a, b]: P2) => d.xs.reduce((s, x, i) => s + (a * x + b - d.ys[i]) ** 2, 0) / d.xs.length;

export type Schedule = 'const' | 'decay';

/** SGD with one random point per step from (0, 0). decay: η_k = η₀ / (1 + k/τ). Returns the parameters after every step. */
export function sgd(d: Data, steps: number, eta0: number, schedule: Schedule, rand: () => number, tau = 100): P2[] {
  let p: P2 = [0, 0];
  const out: P2[] = [p];
  for (let k = 0; k < steps; k++) {
    const i = Math.floor(rand() * d.xs.length);
    const r = p[0] * d.xs[i] + p[1] - d.ys[i];
    const eta = schedule === 'const' ? eta0 : eta0 / (1 + k / tau);
    p = [p[0] - eta * 2 * r * d.xs[i], p[1] - eta * 2 * r];
    out.push(p);
  }
  return out;
}

/* ───────── penalty method ───────── */

/**
 * Minimize (x−2)² + (y−1)² subject to x + y = 1 by minimizing (x−2)² + (y−1)² + μ(x + y − 1)².
 * Closed form: the penalized minimum is (2, 1) − (2μ/(1+2μ))·(1, 1); the constrained answer is (1, 0).
 */
export function penalty(mu: number): { p: P2; violation: number } {
  const t = (2 * mu) / (1 + 2 * mu);
  const p: P2 = [2 - t, 1 - t];
  return { p, violation: p[0] + p[1] - 1 };
}

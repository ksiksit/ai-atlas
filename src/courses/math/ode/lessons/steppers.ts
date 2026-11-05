/*
 * 미분방정식 · 수치적으로 풀기: instrumented one-step methods.
 * No imports, so node can run it directly for checking the prose.
 */

export type Vec = number[];
export type F = (t: number, y: Vec) => Vec;

const axpy = (y: Vec, a: number, k: Vec): Vec => y.map((v, i) => v + a * k[i]);

/* ───────── fixed-step methods ───────── */

export type Method = 'euler' | 'heun' | 'rk4';
export const METHOD_KO: Record<Method, string> = { euler: '오일러', heun: '호인(개량 오일러)', rk4: '룽게-쿠타(RK4)' };
export const ORDER: Record<Method, number> = { euler: 1, heun: 2, rk4: 4 };
/** Evaluations of f per step. */
export const COST: Record<Method, number> = { euler: 1, heun: 2, rk4: 4 };

export function step(m: Method, f: F, t: number, y: Vec, h: number): Vec {
  if (m === 'euler') return axpy(y, h, f(t, y));
  if (m === 'heun') {
    const k1 = f(t, y);
    const k2 = f(t + h, axpy(y, h, k1));
    return y.map((v, i) => v + (h / 2) * (k1[i] + k2[i]));
  }
  const k1 = f(t, y);
  const k2 = f(t + h / 2, axpy(y, h / 2, k1));
  const k3 = f(t + h / 2, axpy(y, h / 2, k2));
  const k4 = f(t + h, axpy(y, h, k3));
  return y.map((v, i) => v + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
}

export function solve(m: Method, f: F, y0: Vec, T: number, h: number): { t: number[]; y: Vec[] } {
  const n = Math.round(T / h);
  const ts = [0], ys = [y0];
  let y = y0;
  for (let i = 0; i < n; i++) {
    y = step(m, f, i * h, y, h);
    ts.push((i + 1) * h);
    ys.push(y);
  }
  return { t: ts, y: ys };
}

/* ───────── RK4 in slow motion ───────── */

export interface Stage {
  /** Where the slope is sampled and the slope found there. */
  t: number;
  y: number;
  k: number;
}

/** The four stages of one RK4 step on a scalar equation, plus the result. */
export function rk4Stages(f: (t: number, y: number) => number, t: number, y: number, h: number): { stages: Stage[]; next: number; euler: number } {
  const k1 = f(t, y);
  const y2 = y + (h / 2) * k1, k2 = f(t + h / 2, y2);
  const y3 = y + (h / 2) * k2, k3 = f(t + h / 2, y3);
  const y4 = y + h * k3, k4 = f(t + h, y4);
  return {
    stages: [
      { t, y, k: k1 },
      { t: t + h / 2, y: y2, k: k2 },
      { t: t + h / 2, y: y3, k: k3 },
      { t: t + h, y: y4, k: k4 },
    ],
    next: y + (h / 6) * (k1 + 2 * k2 + 2 * k3 + k4),
    euler: y + h * k1,
  };
}

/* ───────── the test problem for orders: y′ = t − y, y(0) = 1 ───────── */

export const testF: F = (t, y) => [t - y[0]];
export const testExact = (t: number) => t - 1 + 2 * Math.exp(-t);

/** Global error at T = 2 for each step size. */
export function errorTable(hs: number[], T = 2): { h: number; err: Record<Method, number> }[] {
  return hs.map((h) => {
    const err = {} as Record<Method, number>;
    for (const m of ['euler', 'heun', 'rk4'] as Method[]) {
      const r = solve(m, testF, [1], T, h);
      err[m] = Math.abs(r.y[r.y.length - 1][0] - testExact(T));
    }
    return { h, err };
  });
}

/** Least-squares slope of log(err) against log(h): the observed order. */
export function observedOrder(rows: { h: number; e: number }[]): number {
  const xs = rows.map((r) => Math.log(r.h)), ys = rows.map((r) => Math.log(r.e));
  const n = xs.length, mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my);
    sxx += (xs[i] - mx) ** 2;
  }
  return sxy / sxx;
}

/* ───────── the harmonic oscillator x″ = −x as an orbit ───────── */

export type OrbitMethod = 'euler' | 'rk4' | 'leapfrog';
export const ORBIT_KO: Record<OrbitMethod, string> = { euler: '오일러', rk4: 'RK4', leapfrog: '립프로그' };

const osc: F = (_t, y) => [y[1], -y[0]];
export const energy = (x: number, v: number) => (x * x + v * v) / 2;

/** Orbit of (x, v) from (1, 0) for `periods` periods of 2π with step h. */
export function orbit(m: OrbitMethod, h: number, periods: number): { x: number[]; v: number[] } {
  const n = Math.round((2 * Math.PI * periods) / h);
  let x = 1, v = 0;
  const xs = [x], vs = [v];
  for (let i = 0; i < n; i++) {
    if (m === 'leapfrog') {
      // kick–drift–kick (velocity Verlet)
      const vh = v - (h / 2) * x;
      x = x + h * vh;
      v = vh - (h / 2) * x;
    } else {
      const y = step(m, osc, i * h, [x, v], h);
      x = y[0];
      v = y[1];
    }
    xs.push(x);
    vs.push(v);
  }
  return { x: xs, v: vs };
}

/* ───────── adaptive RK45 (Dormand–Prince) ───────── */

/** A problem with a narrow kick: y′ = −y + 20·exp(−((t − 4)/0.2)²), y(0) = 1. */
export const pulseF = (t: number, y: number) => -y + 20 * Math.exp(-(((t - 4) / 0.2) ** 2));

const A = [
  [],
  [1 / 5],
  [3 / 40, 9 / 40],
  [44 / 45, -56 / 15, 32 / 9],
  [19372 / 6561, -25360 / 2187, 64448 / 6561, -212 / 729],
  [9017 / 3168, -355 / 33, 46732 / 5247, 49 / 176, -5103 / 18656],
  [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84],
];
const C = [0, 1 / 5, 3 / 10, 4 / 5, 8 / 9, 1, 1];
const B5 = [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84, 0];
const B4 = [5179 / 57600, 0, 7571 / 16695, 393 / 640, -92097 / 339200, 187 / 2100, 1 / 40];

export interface AdaptiveRun {
  t: number[];
  y: number[];
  /** Step sizes of the accepted steps, aligned with t[1..]. */
  hs: number[];
  /** Times where a step was tried and rejected. */
  rejected: number[];
  evals: number;
}

export function rk45(f: (t: number, y: number) => number, y0: number, T: number, tol: number, h0 = 0.5): AdaptiveRun {
  let t = 0, y = y0, h = h0, evals = 0;
  const ts = [0], ys = [y0], hs: number[] = [], rejected: number[] = [];
  while (t < T - 1e-12) {
    if (t + h > T) h = T - t;
    const k: number[] = [];
    for (let i = 0; i < 7; i++) {
      let yi = y;
      for (let j = 0; j < i; j++) yi += h * A[i][j] * k[j];
      k.push(f(t + C[i] * h, yi));
    }
    evals += 7;
    let y5 = y, y4 = y;
    for (let i = 0; i < 7; i++) {
      y5 += h * B5[i] * k[i];
      y4 += h * B4[i] * k[i];
    }
    const err = Math.abs(y5 - y4);
    if (err <= tol) {
      t += h;
      y = y5;
      ts.push(t);
      ys.push(y);
      hs.push(h);
    } else {
      rejected.push(t);
    }
    // the usual controller: aim for err ≈ tol, with a safety factor and limits
    const fac = err === 0 ? 4 : Math.min(4, Math.max(0.2, 0.9 * Math.pow(tol / err, 1 / 5)));
    h *= fac;
  }
  return { t: ts, y: ys, hs, rejected, evals };
}

/** Fixed-step RK4 on the pulse problem; returns the error at T against a very fine reference. */
export function fixedPulseError(h: number, T: number, reference: number): number {
  const r = solve('rk4', (t, y) => [pulseF(t, y[0])], [1], T, h);
  return Math.abs(r.y[r.y.length - 1][0] - reference);
}

/* ───────── stiffness: y′ = −50 (y − cos t), y(0) = 0 ───────── */

export const LAMBDA = -50;
export const stiffF = (t: number, y: number) => LAMBDA * (y - Math.cos(t));

/** Explicit and implicit Euler side by side; implicit Euler solves its linear step exactly. */
export function stiffRun(h: number, T: number): { t: number[]; explicit: number[]; implicit: number[] } {
  const n = Math.round(T / h);
  const ts = [0], ex = [0], im = [0];
  let ye = 0, yi = 0;
  for (let i = 0; i < n; i++) {
    const t = i * h;
    ye = ye + h * stiffF(t, ye);
    // y_{n+1} = y_n + h λ (y_{n+1} − cos t_{n+1})  ⇒  y_{n+1} = (y_n − hλ cos t_{n+1}) / (1 − hλ)
    yi = (yi - h * LAMBDA * Math.cos(t + h)) / (1 - h * LAMBDA);
    ts.push(t + h);
    ex.push(ye);
    im.push(yi);
  }
  return { t: ts, explicit: ex, implicit: im };
}

/** The slow solution the stiff problem follows after a quick transient (exact particular solution). */
export const stiffSlow = (t: number) => (2500 * Math.cos(t) + 50 * Math.sin(t)) / 2501;

/** |amplification factor| of each method for the test equation y′ = λy, as a function of z = hλ. */
export function amplification(m: 'euler' | 'heun' | 'rk4' | 'implicit', re: number, im: number): number {
  // complex helpers
  const mul = (a: [number, number], b: [number, number]): [number, number] => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
  const z: [number, number] = [re, im];
  if (m === 'implicit') {
    const d = Math.hypot(1 - re, -im);
    return 1 / d;
  }
  const z2 = mul(z, z), z3 = mul(z2, z), z4 = mul(z3, z);
  let r: [number, number] = [1 + z[0], z[1]];
  if (m === 'heun' || m === 'rk4') r = [r[0] + z2[0] / 2, r[1] + z2[1] / 2];
  if (m === 'rk4') r = [r[0] + z3[0] / 6 + z4[0] / 24, r[1] + z3[1] / 6 + z4[1] / 24];
  return Math.hypot(r[0], r[1]);
}

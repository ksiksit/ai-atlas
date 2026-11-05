/*
 * 미분방정식 · 비선형계와 혼돈: Lotka–Volterra with its conserved quantity, linearization,
 * the van der Pol limit cycle, the Lorenz system and the logistic map.
 * No imports, so node can run this file directly.
 */

export type Field = (x: number[]) => number[];

const axpy = (x: number[], a: number, y: number[]) => x.map((v, i) => v + a * y[i]);

export function eulerStep(f: Field, x: number[], h: number): number[] {
  return axpy(x, h, f(x));
}

export function rk4Step(f: Field, x: number[], h: number): number[] {
  const k1 = f(x);
  const k2 = f(axpy(x, h / 2, k1));
  const k3 = f(axpy(x, h / 2, k2));
  const k4 = f(axpy(x, h, k3));
  return x.map((v, i) => v + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
}

export function integrate(f: Field, x0: number[], T: number, h: number, method: 'euler' | 'rk4' = 'rk4'): number[][] {
  const n = Math.max(1, Math.round(T / h));
  const step = method === 'rk4' ? rk4Step : eulerStep;
  const out = [x0.slice()];
  let x = x0.slice();
  for (let i = 0; i < n; i++) {
    x = step(f, x, h);
    out.push(x);
    if (!x.every(Number.isFinite)) break;
  }
  return out;
}

/* ───────── Lotka–Volterra ───────── */

/** Rabbits x, foxes y: x′ = αx − βxy, y′ = δxy − γy. */
export interface LV {
  alpha: number;
  beta: number;
  delta: number;
  gamma: number;
}
export const LV_DEFAULT: LV = { alpha: 1, beta: 0.1, delta: 0.075, gamma: 1.5 };

export const lvField = (p: LV): Field => ([x, y]) => [p.alpha * x - p.beta * x * y, p.delta * x * y - p.gamma * y];
/** The coexistence equilibrium (γ/δ, α/β). */
export const lvEquilibrium = (p: LV): [number, number] => [p.gamma / p.delta, p.alpha / p.beta];
/** Conserved along every orbit: V = δx − γ ln x + βy − α ln y. */
export const lvConserved = (p: LV, x: number, y: number) => p.delta * x - p.gamma * Math.log(x) + p.beta * y - p.alpha * Math.log(y);

/** Time from one rabbit peak to the next on the orbit through (x0, y0), by RK4 with step h. */
export function lvPeriod(p: LV, x0: number, y0: number, h = 0.001, Tmax = 60): number {
  const f = lvField(p);
  let x = [x0, y0];
  let prevDx = f(x)[0];
  const peaks: number[] = [];
  for (let i = 1; i * h < Tmax && peaks.length < 3; i++) {
    x = rk4Step(f, x, h);
    const dx = f(x)[0];
    if (prevDx > 0 && dx <= 0) {
      // linear interpolation of the zero crossing of x′ inside this step
      peaks.push((i - 1 + prevDx / (prevDx - dx)) * h);
    }
    prevDx = dx;
  }
  return peaks.length >= 2 ? peaks[peaks.length - 1] - peaks[peaks.length - 2] : NaN;
}

/** Jacobian of the Lotka–Volterra field at (x, y). */
export const lvJacobian = (p: LV, x: number, y: number): [number, number, number, number] => [p.alpha - p.beta * y, -p.beta * x, p.delta * y, p.delta * x - p.gamma];

/* ───────── van der Pol ───────── */

/** x″ − μ(1 − x²)x′ + x = 0 as x′ = y, y′ = μ(1 − x²)y − x. */
export const vdpField = (mu: number): Field => ([x, y]) => [y, mu * (1 - x * x) * y - x];

/** Period and amplitude (max |x|) of the van der Pol limit cycle, measured after the transient. */
export function vdpCycle(mu: number, h = 0.002): { period: number; amp: number } {
  const f = vdpField(mu);
  let x = [2, 0];
  const T0 = 40 + 10 * mu;
  for (let t = 0; t < T0; t += h) x = rk4Step(f, x, h);
  // measure between two upward crossings of y = 0 with x < 0... use crossings of x = 0 going up
  const ups: number[] = [];
  let amp = 0;
  let t = 0;
  let prev = x[0];
  while (ups.length < 3 && t < 200) {
    x = rk4Step(f, x, h);
    t += h;
    amp = Math.max(amp, Math.abs(x[0]));
    if (prev < 0 && x[0] >= 0) ups.push(t - h + (h * -prev) / (x[0] - prev));
    prev = x[0];
  }
  return { period: ups[2] - ups[1], amp };
}

/* ───────── Lorenz ───────── */

export const LORENZ = { sigma: 10, rho: 28, beta: 8 / 3 };
export const lorenzField = (s = LORENZ.sigma, r = LORENZ.rho, b = LORENZ.beta): Field => ([x, y, z]) => [s * (y - x), x * (r - z) - y, x * y - b * z];

/** A point on the attractor: start near the origin and let the transient die out. */
export function lorenzOnAttractor(h = 0.005, warm = 30): number[] {
  const f = lorenzField();
  let x = [1, 1, 1];
  for (let t = 0; t < warm; t += h) x = rk4Step(f, x, h);
  return x;
}

/** Two trajectories started d0 apart (in x), with log₁₀ of their distance at every step. */
export function lorenzTwins(T: number, h = 0.005, d0 = 1e-8): { a: number[][]; b: number[][]; logd: number[] } {
  const f = lorenzField();
  const s = lorenzOnAttractor(h);
  let p = s.slice();
  let q = [s[0] + d0, s[1], s[2]];
  const a = [p], b = [q], logd = [Math.log10(d0)];
  const n = Math.round(T / h);
  for (let i = 0; i < n; i++) {
    p = rk4Step(f, p, h);
    q = rk4Step(f, q, h);
    a.push(p);
    b.push(q);
    logd.push(Math.log10(Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])));
  }
  return { a, b, logd };
}

/** Least-squares slope of y against t over the samples with t in [t0, t1]. */
export function slope(ts: number[], ys: number[], t0: number, t1: number): number {
  let n = 0, sx = 0, sy = 0, sxx = 0, sxy = 0;
  ts.forEach((t, i) => {
    if (t < t0 || t > t1) return;
    n++;
    sx += t;
    sy += ys[i];
    sxx += t * t;
    sxy += t * ys[i];
  });
  return (n * sxy - sx * sy) / (n * sxx - sx * sx);
}

/**
 * Largest Lyapunov exponent of the Lorenz system by repeated renormalization (Benettin's method):
 * follow a neighbour at distance d0, measure how much it grew every `every` time units, pull it back.
 */
export function lorenzLyapunov(T = 200, h = 0.005, every = 1, d0 = 1e-8): number {
  const f = lorenzField();
  let p = lorenzOnAttractor(h);
  let q = [p[0] + d0, p[1], p[2]];
  let sum = 0;
  const steps = Math.round(every / h);
  const rounds = Math.round(T / every);
  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < steps; i++) {
      p = rk4Step(f, p, h);
      q = rk4Step(f, q, h);
    }
    const d = Math.hypot(q[0] - p[0], q[1] - p[1], q[2] - p[2]);
    sum += Math.log(d / d0);
    q = p.map((v, i) => v + ((q[i] - v) * d0) / d);
  }
  return sum / (rounds * every);
}

/* ───────── logistic map ───────── */

/** Values the orbit of xₙ₊₁ = r xₙ(1 − xₙ) settles on, after `skip` iterations, rounded to detect cycles. */
export function logisticOrbit(r: number, keep = 64, skip = 1000, x0 = 0.5): number[] {
  let x = x0;
  for (let i = 0; i < skip; i++) x = r * x * (1 - x);
  const out: number[] = [];
  for (let i = 0; i < keep; i++) {
    x = r * x * (1 - x);
    out.push(x);
  }
  return out;
}

/** Period of the settled orbit (1, 2, 4, …), or 0 if no period up to `maxP` repeats within tol. */
export function logisticPeriod(r: number, maxP = 64, tol = 1e-6): number {
  const orb = logisticOrbit(r, 2 * maxP, 5000);
  for (let p = 1; p <= maxP; p++) {
    let ok = true;
    for (let i = 0; i + p < orb.length; i++)
      if (Math.abs(orb[i] - orb[i + p]) > tol) {
        ok = false;
        break;
      }
    if (ok) return p;
  }
  return 0;
}

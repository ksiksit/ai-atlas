/*
 * 미분방정식: the small ODE toolkit the course's lessons share.
 *
 * Solvers work on vector states (number[]); a scalar equation y′ = g(t, y) is just a state of
 * length 1. The drawing helpers take any view with X(x) and Y(y) mapping data to screen (the
 * Plot class in lib/plot has both), so lessons can draw into their own plot frames.
 */

import { alpha, type Palette } from '../../../../lib/theme';

export type Vec = number[];
export type F = (t: number, y: Vec) => Vec;
export interface Point {
  t: number;
  y: Vec;
}
export interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}
/** Anything that maps data coordinates to screen pixels, e.g. a Plot. */
export interface View {
  X: (x: number) => number;
  Y: (y: number) => number;
}

const axpy = (a: number, x: Vec, y: Vec): Vec => y.map((v, i) => v + a * x[i]);

/* ───────── fixed-step solvers ───────── */

/** Euler's method: y ← y + h·f(t, y). Returns steps + 1 points, starting with (t0, y0). */
export function euler(f: F, t0: number, y0: Vec, h: number, steps: number): Point[] {
  const out: Point[] = [{ t: t0, y: y0.slice() }];
  let t = t0, y = y0.slice();
  for (let k = 0; k < steps; k++) {
    y = axpy(h, f(t, y), y);
    t += h;
    out.push({ t, y });
    if (!y.every(isFinite)) break;
  }
  return out;
}

/** One classical Runge–Kutta step. */
export function rk4Step(f: F, t: number, y: Vec, h: number): Vec {
  const k1 = f(t, y);
  const k2 = f(t + h / 2, axpy(h / 2, k1, y));
  const k3 = f(t + h / 2, axpy(h / 2, k2, y));
  const k4 = f(t + h, axpy(h, k3, y));
  return y.map((v, i) => v + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
}

/** Classical fourth-order Runge–Kutta. Returns steps + 1 points, starting with (t0, y0). */
export function rk4(f: F, t0: number, y0: Vec, h: number, steps: number): Point[] {
  const out: Point[] = [{ t: t0, y: y0.slice() }];
  let t = t0, y = y0.slice();
  for (let k = 0; k < steps; k++) {
    y = rk4Step(f, t, y, h);
    t += h;
    out.push({ t, y });
    if (!y.every(isFinite)) break;
  }
  return out;
}

/* ───────── adaptive Dormand–Prince 5(4) ───────── */

const DP_C = [0, 1 / 5, 3 / 10, 4 / 5, 8 / 9, 1, 1];
const DP_A = [
  [],
  [1 / 5],
  [3 / 40, 9 / 40],
  [44 / 45, -56 / 15, 32 / 9],
  [19372 / 6561, -25360 / 2187, 64448 / 6561, -212 / 729],
  [9017 / 3168, -355 / 33, 46732 / 5247, 49 / 176, -5103 / 18656],
  [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84],
];
const DP_B5 = [35 / 384, 0, 500 / 1113, 125 / 192, -2187 / 6784, 11 / 84, 0];
const DP_B4 = [5179 / 57600, 0, 7571 / 16695, 393 / 640, -92097 / 339200, 187 / 2100, 1 / 40];

export interface AdaptiveResult {
  points: Point[];
  /** The step size taken to reach each point after the first. */
  steps: number[];
  /** Steps tried and thrown away because the error estimate was above tol. */
  rejected: number;
}

/**
 * Adaptive Dormand–Prince 5(4) from t0 to t1. The step grows where the solution is smooth and
 * shrinks where it bends, keeping the local error estimate below tol (mixed absolute/relative).
 */
export function rk45(f: F, t0: number, y0: Vec, t1: number, tol = 1e-6, h0?: number, maxSteps = 20000): AdaptiveResult {
  const dir = Math.sign(t1 - t0) || 1;
  let h = (h0 ?? Math.abs(t1 - t0) / 100) * dir;
  let t = t0, y = y0.slice();
  const points: Point[] = [{ t, y: y.slice() }];
  const steps: number[] = [];
  let rejected = 0;
  for (let n = 0; n < maxSteps && (t1 - t) * dir > 1e-12; n++) {
    if ((t + h - t1) * dir > 0) h = t1 - t;
    const k: Vec[] = [];
    for (let s = 0; s < 7; s++) {
      let ys = y.slice();
      for (let j = 0; j < s; j++) if (DP_A[s][j]) ys = axpy(h * DP_A[s][j], k[j], ys);
      k.push(f(t + DP_C[s] * h, ys));
    }
    const y5 = y.map((v, i) => v + h * DP_B5.reduce((acc, b, s) => acc + b * k[s][i], 0));
    const y4 = y.map((v, i) => v + h * DP_B4.reduce((acc, b, s) => acc + b * k[s][i], 0));
    let err = 0;
    for (let i = 0; i < y.length; i++) {
      const sc = tol * (1 + Math.max(Math.abs(y[i]), Math.abs(y5[i])));
      err = Math.max(err, Math.abs(y5[i] - y4[i]) / sc);
    }
    if (!isFinite(err)) break;
    if (err <= 1) {
      t += h;
      y = y5;
      points.push({ t, y: y.slice() });
      steps.push(Math.abs(h));
    } else rejected++;
    const fac = err === 0 ? 5 : Math.min(5, Math.max(0.2, 0.9 * Math.pow(err, -1 / 5)));
    h *= fac;
  }
  return { points, steps, rejected };
}

/* ───────── slope fields ───────── */

export interface Segment {
  t: number;
  y: number;
  slope: number;
}

/** Slopes of y′ = g(t, y) on an n × n grid of cell centres over the box. */
export function slopeField(g: (t: number, y: number) => number, box: Box, n = 18): Segment[] {
  const out: Segment[] = [];
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const t = box.x0 + ((i + 0.5) / n) * (box.x1 - box.x0);
      const y = box.y0 + ((j + 0.5) / n) * (box.y1 - box.y0);
      const s = g(t, y);
      if (isFinite(s)) out.push({ t, y, slope: s });
    }
  return out;
}

/**
 * Draw the slope field of y′ = g(t, y): short segments of equal screen length, tilted by the
 * slope as it looks on screen (so it matches solution curves drawn with the same view).
 */
export function drawSlopeField(ctx: CanvasRenderingContext2D, P: Palette, g: (t: number, y: number) => number, box: Box, view: View, opts: { n?: number; color?: string; len?: number; width?: number } = {}) {
  const { n = 18, color = alpha(P.ink3, 0.75), width = 1.25 } = opts;
  const cellW = Math.abs(view.X(box.x1) - view.X(box.x0)) / n;
  const len = opts.len ?? cellW * 0.62;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const s of slopeField(g, box, n)) {
    const sx = view.X(s.t), sy = view.Y(s.y);
    // direction in screen space: one data step in t and s.slope in y
    const dx = view.X(s.t + 1) - view.X(s.t);
    const dy = view.Y(s.y + s.slope) - view.Y(s.y);
    const m = Math.hypot(dx, dy) || 1;
    const ux = (dx / m) * (len / 2), uy = (dy / m) * (len / 2);
    ctx.moveTo(sx - ux, sy - uy);
    ctx.lineTo(sx + ux, sy + uy);
  }
  ctx.stroke();
  ctx.lineCap = 'butt';
}

/* ───────── phase portraits ───────── */

export type F2 = (x: number, y: number) => [number, number];

/** Trajectory of an autonomous 2-D system from (x, y), with RK4, stopping if it leaves a padded box. */
export function trajectory(f: F2, x: number, y: number, h: number, steps: number, box?: Box): [number, number][] {
  const g: F = (_t, v) => f(v[0], v[1]);
  const out: [number, number][] = [[x, y]];
  let v: Vec = [x, y];
  const padX = box ? (box.x1 - box.x0) * 0.5 : 0, padY = box ? (box.y1 - box.y0) * 0.5 : 0;
  for (let k = 0; k < steps; k++) {
    v = rk4Step(g, 0, v, h);
    if (!v.every(isFinite)) break;
    out.push([v[0], v[1]]);
    if (box && (v[0] < box.x0 - padX || v[0] > box.x1 + padX || v[1] < box.y0 - padY || v[1] > box.y1 + padY)) break;
  }
  return out;
}

/**
 * Phase portrait of x′ = f(x, y): a grid of direction arrows (equal length, faint) and, for each
 * start point, a trajectory forward (and optionally backward) in time.
 */
export function drawPhasePortrait(
  ctx: CanvasRenderingContext2D,
  P: Palette,
  f: F2,
  box: Box,
  view: View,
  opts: { n?: number; starts?: [number, number][]; h?: number; steps?: number; backward?: boolean; arrowColor?: string; color?: string; width?: number } = {},
) {
  const { n = 16, starts = [], h = 0.02, steps = 600, backward = true, arrowColor = alpha(P.ink3, 0.6), color = P.accent, width = 1.8 } = opts;
  const cellW = Math.abs(view.X(box.x1) - view.X(box.x0)) / n;
  const len = cellW * 0.55;
  ctx.strokeStyle = arrowColor;
  ctx.fillStyle = arrowColor;
  ctx.lineWidth = 1.1;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const x = box.x0 + ((i + 0.5) / n) * (box.x1 - box.x0);
      const y = box.y0 + ((j + 0.5) / n) * (box.y1 - box.y0);
      const [u, v] = f(x, y);
      const dx = view.X(x + u) - view.X(x), dy = view.Y(y + v) - view.Y(y);
      const m = Math.hypot(dx, dy);
      if (!(m > 1e-9)) continue;
      const ux = (dx / m) * len, uy = (dy / m) * len;
      const sx = view.X(x) - ux / 2, sy = view.Y(y) - uy / 2;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + ux, sy + uy);
      ctx.stroke();
      // a small head
      const hx = sx + ux, hy = sy + uy, a = 3.2;
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx - (ux / len) * a * 1.6 - (uy / len) * a, hy - (uy / len) * a * 1.6 + (ux / len) * a);
      ctx.lineTo(hx - (ux / len) * a * 1.6 + (uy / len) * a, hy - (uy / len) * a * 1.6 - (ux / len) * a);
      ctx.closePath();
      ctx.fill();
    }
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  for (const [x0, y0] of starts) {
    for (const sgn of backward ? [1, -1] : [1]) {
      const pts = trajectory((x, y) => {
        const [u, v] = f(x, y);
        return [sgn * u, sgn * v];
      }, x0, y0, h, steps, box);
      ctx.beginPath();
      pts.forEach(([x, y], k) => (k ? ctx.lineTo(view.X(x), view.Y(y)) : ctx.moveTo(view.X(x), view.Y(y))));
      ctx.stroke();
    }
  }
}

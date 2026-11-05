/*
 * 컴퓨터 그래픽스 · 곡선과 애니메이션: Bézier curves, Bernstein weights and CSS-style easing.
 * No DOM here, so node can run it directly.
 */

export type Pt = [number, number];

const lerp2 = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

/**
 * de Casteljau: repeatedly interpolate neighbouring points at t.
 * levels[0] is the control polygon; the last level is a single point, B(t).
 */
export function deCasteljau(pts: Pt[], t: number): Pt[][] {
  const levels: Pt[][] = [pts];
  while (levels[levels.length - 1].length > 1) {
    const prev = levels[levels.length - 1];
    levels.push(prev.slice(1).map((p, i) => lerp2(prev[i], p, t)));
  }
  return levels;
}

export const bezierPoint = (pts: Pt[], t: number): Pt => {
  const L = deCasteljau(pts, t);
  return L[L.length - 1][0];
};

/** Polyline of the curve with `n` segments. */
export const sampleCurve = (pts: Pt[], n = 64): Pt[] => Array.from({ length: n + 1 }, (_, i) => bezierPoint(pts, i / n));

const binom = (n: number, k: number) => {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
};

/** Bernstein basis b_{i,n}(t) = C(n, i) tⁱ (1 − t)ⁿ⁻ⁱ: the weight of control point i. */
export const bernstein = (n: number, i: number, t: number) => binom(n, i) * Math.pow(t, i) * Math.pow(1 - t, n - i);

/** All n + 1 weights at t (they always add up to 1). */
export const weights = (n: number, t: number) => Array.from({ length: n + 1 }, (_, i) => bernstein(n, i, t));

/** Convex hull (Andrew's monotone chain), counter-clockwise, for the hull-property overlay. */
export function convexHull(pts: Pt[]): Pt[] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cr = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: Pt[] = [];
  for (const q of p) {
    while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop();
    lo.push(q);
  }
  const up: Pt[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i];
    while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop();
    up.push(q);
  }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

/* ───────── easing ───────── */

export interface Easing {
  id: string;
  name: string;
  /** CSS cubic-bezier(x1, y1, x2, y2); null for linear. */
  cb: [number, number, number, number] | null;
}

export const EASINGS: Easing[] = [
  { id: 'linear', name: '선형 (linear)', cb: null },
  { id: 'ease', name: 'ease', cb: [0.25, 0.1, 0.25, 1] },
  { id: 'ease-in-out', name: 'ease-in-out', cb: [0.42, 0, 0.58, 1] },
  { id: 'back', name: '되튀기', cb: [0.34, 1.56, 0.64, 1] },
];

/**
 * Evaluate CSS cubic-bezier(x1, y1, x2, y2) at progress x in [0, 1]: the curve runs from (0, 0)
 * to (1, 1) with control points (x1, y1), (x2, y2). Find the parameter s with X(s) = x by
 * Newton's method (bisection as a fallback), then return Y(s).
 */
export function cubicBezierEase(x1: number, y1: number, x2: number, y2: number, x: number): number {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
  const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = (s: number) => ((ax * s + bx) * s + cx) * s;
  const dX = (s: number) => (3 * ax * s + 2 * bx) * s + cx;
  const Y = (s: number) => ((ay * s + by) * s + cy) * s;
  let s = x;
  for (let i = 0; i < 8; i++) {
    const e = X(s) - x;
    if (Math.abs(e) < 1e-7) return Y(s);
    const d = dX(s);
    if (Math.abs(d) < 1e-6) break;
    s -= e / d;
  }
  let lo = 0, hi = 1;
  s = x;
  for (let i = 0; i < 40; i++) {
    const v = X(s);
    if (Math.abs(v - x) < 1e-7) break;
    if (v < x) lo = s;
    else hi = s;
    s = (lo + hi) / 2;
  }
  return Y(s);
}

export const ease = (e: Easing['cb'], x: number) => (e ? cubicBezierEase(e[0], e[1], e[2], e[3], x) : Math.max(0, Math.min(1, x)));

/* ───────── a path of cubic segments (for the continuity figure) ───────── */

/**
 * A two-segment cubic path P0 P1 P2 P3 | P3 P4 P5 P6. With `smooth`, moving one handle at the
 * joint P3 mirrors the other through P3 so the tangent stays continuous (C1).
 */
export function mirrorHandle(joint: Pt, moved: Pt): Pt {
  return [2 * joint[0] - moved[0], 2 * joint[1] - moved[1]];
}

/** Angle in degrees between the incoming and outgoing tangents at the joint (0 = smooth). */
export function kinkDegrees(inHandle: Pt, joint: Pt, outHandle: Pt): number {
  const a = Math.atan2(joint[1] - inHandle[1], joint[0] - inHandle[0]);
  const b = Math.atan2(outHandle[1] - joint[1], outHandle[0] - joint[0]);
  let d = Math.abs(((b - a) * 180) / Math.PI);
  if (d > 180) d = 360 - d;
  return d;
}

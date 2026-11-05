/* 복소해석 · 정칙 함수: difference quotients, partial derivatives, Laplacians and contour lines. */

import { abs, add, div, fromPolar, presets, sub, type Box, type C } from './cplx';

export interface Fn {
  id: string;
  name: string;
  tex: string;
  f: (z: C) => C;
  holomorphic: boolean;
}

/** The holomorphic presets used here, plus three functions that are not complex-differentiable. */
export const FNS: Record<string, Fn> = {
  exp: { id: 'exp', name: 'eᶻ', tex: 'e^z', f: presets.exp.f, holomorphic: true },
  z2: { id: 'z2', name: 'z²', tex: 'z^2', f: presets.z2.f, holomorphic: true },
  sin: { id: 'sin', name: 'sin z', tex: '\\sin z', f: presets.sin.f, holomorphic: true },
  inv: { id: 'inv', name: '1/z', tex: '1/z', f: presets.inv.f, holomorphic: true },
  z3m1: { id: 'z3m1', name: 'z³ − 1', tex: 'z^3 - 1', f: presets.z3m1.f, holomorphic: true },
  cyl: { id: 'cyl', name: 'z + 1/z', tex: 'z + 1/z', f: (z) => add(z, div([1, 0], z)), holomorphic: true },
  conj: { id: 'conj', name: 'z̄', tex: '\\bar z', f: (z) => [z[0], -z[1]], holomorphic: false },
  abs2: { id: 'abs2', name: '|z|²', tex: '|z|^2', f: (z) => [z[0] * z[0] + z[1] * z[1], 0], holomorphic: false },
  xsq: { id: 'xsq', name: 'x² + iy', tex: 'x^2 + iy', f: (z) => [z[0] * z[0], z[1]], holomorphic: false },
};

/** (f(z₀ + h e^{iφ}) − f(z₀)) / (h e^{iφ}): the difference quotient along direction φ. */
export function quotient(f: (z: C) => C, z0: C, h: number, phi: number): C {
  const dz = fromPolar(h, phi);
  return div(sub(f(add(z0, dz)), f(z0)), dz);
}

/** The quotient for every direction, sampled; and the largest distance between any two of them. */
export function quotientCurve(f: (z: C) => C, z0: C, h: number, n = 120): { pts: C[]; spread: number } {
  const pts = Array.from({ length: n }, (_, i) => quotient(f, z0, h, (2 * Math.PI * i) / n));
  let spread = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) spread = Math.max(spread, abs(sub(pts[i], pts[j])));
  return { pts, spread };
}

export interface Partials {
  ux: number;
  uy: number;
  vx: number;
  vy: number;
}

/** Central-difference partial derivatives of u = Re f and v = Im f. */
export function partials(f: (z: C) => C, z: C, e = 1e-5): Partials {
  const fx1 = f([z[0] + e, z[1]]), fx0 = f([z[0] - e, z[1]]);
  const fy1 = f([z[0], z[1] + e]), fy0 = f([z[0], z[1] - e]);
  return {
    ux: (fx1[0] - fx0[0]) / (2 * e),
    vx: (fx1[1] - fx0[1]) / (2 * e),
    uy: (fy1[0] - fy0[0]) / (2 * e),
    vy: (fy1[1] - fy0[1]) / (2 * e),
  };
}

/** Five-point Laplacian of one real component (0 = Re, 1 = Im). */
export function laplacian(f: (z: C) => C, z: C, part: 0 | 1, e = 1e-3): number {
  const g = (x: number, y: number) => f([x, y])[part];
  return (g(z[0] + e, z[1]) + g(z[0] - e, z[1]) + g(z[0], z[1] + e) + g(z[0], z[1] - e) - 4 * g(z[0], z[1])) / (e * e);
}

/**
 * The angle at f(z₀) between the images of the horizontal and the vertical direction through z₀,
 * measured from tiny steps (in degrees, 0..180).
 */
export function imageAngle(f: (z: C) => C, z0: C, e = 1e-5): number {
  const a = sub(f(add(z0, [e, 0])), f(z0));
  const b = sub(f(add(z0, [0, e])), f(z0));
  const cos = (a[0] * b[0] + a[1] * b[1]) / (abs(a) * abs(b));
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
}

/** Marching squares: segments [x1, y1, x2, y2] where g(x, y) = level, on an n × n grid over the box. */
export function contourSegments(g: (x: number, y: number) => number, box: Box, n: number, levels: number[], skip?: (x: number, y: number) => boolean): number[][][] {
  const dx = (box.x1 - box.x0) / n, dy = (box.y1 - box.y0) / n;
  const vals: number[] = [];
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) vals.push(g(box.x0 + i * dx, box.y0 + j * dy));
  const at = (i: number, j: number) => vals[j * (n + 1) + i];
  return levels.map((L) => {
    const segs: number[][] = [];
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const x = box.x0 + i * dx, y = box.y0 + j * dy;
        if (skip && skip(x + dx / 2, y + dy / 2)) continue;
        const c = [at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)];
        if (c.some((v) => !isFinite(v))) continue;
        const p = [
          [x, y],
          [x + dx, y],
          [x + dx, y + dy],
          [x, y + dy],
        ];
        const cross: number[][] = [];
        for (let e = 0; e < 4; e++) {
          const a = c[e] - L, b = c[(e + 1) % 4] - L;
          if ((a < 0) !== (b < 0)) {
            const t = a / (a - b);
            const p0 = p[e], p1 = p[(e + 1) % 4];
            cross.push([p0[0] + t * (p1[0] - p0[0]), p0[1] + t * (p1[1] - p0[1])]);
          }
        }
        if (cross.length === 2) segs.push([...cross[0], ...cross[1]]);
        else if (cross.length === 4) segs.push([...cross[0], ...cross[1]], [...cross[2], ...cross[3]]);
      }
    return segs;
  });
}

/** Angle in degrees between the gradients of Re f and Im f at z (90 for a holomorphic f with f′ ≠ 0). */
export function gradientAngle(f: (z: C) => C, z: C): number {
  const p = partials(f, z);
  const cos = (p.ux * p.vx + p.uy * p.vy) / (Math.hypot(p.ux, p.uy) * Math.hypot(p.vx, p.vy));
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
}


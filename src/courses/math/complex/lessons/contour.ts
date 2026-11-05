/*
 * 복소해석 · 복소 적분과 코시 정리: closed paths, numerical contour integrals, winding numbers,
 * Cauchy's integral formula and the maximum modulus principle.
 */
import { add, cabs, carg, cexp, csin, div, fromPolar, mul, scale, sub, inv, cpowInt, type C } from './series';

export type Path = C[]; // closed: the last point connects back to the first

/** A circle of radius r around c, sampled at M points (counterclockwise). */
export function circle(c: C, r: number, M = 400): Path {
  return Array.from({ length: M }, (_, j) => add(c, fromPolar(r, (2 * Math.PI * j) / M)));
}

/** A closed Catmull–Rom spline through the control points, `per` samples between each pair. */
export function closedSpline(ctrl: C[], per = 80): Path {
  const n = ctrl.length;
  const out: Path = [];
  for (let i = 0; i < n; i++) {
    const p0 = ctrl[(i - 1 + n) % n], p1 = ctrl[i], p2 = ctrl[(i + 1) % n], p3 = ctrl[(i + 2) % n];
    for (let s = 0; s < per; s++) {
      const t = s / per, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  return out;
}

/**
 * ∮ f(z) dz along a closed polyline, using f at each segment's midpoint times the segment (midpoint rule).
 * Also returns the running sum, which the lesson draws as a path in the plane.
 */
export function contourIntegral(f: (z: C) => C, path: Path): { value: C; running: C[] } {
  let s: C = [0, 0];
  const running: C[] = [s];
  for (let i = 0; i < path.length; i++) {
    const a = path[i], b = path[(i + 1) % path.length];
    const mid = scale(add(a, b), 0.5);
    s = add(s, mul(f(mid), sub(b, a)));
    running.push(s);
  }
  return { value: s, running };
}

/** How many times the closed path winds counterclockwise around the point a. */
export function winding(path: Path, a: C): number {
  let total = 0;
  for (let i = 0; i < path.length; i++) {
    const p = sub(path[i], a), q = sub(path[(i + 1) % path.length], a);
    let d = carg(q) - carg(p);
    if (d > Math.PI) d -= 2 * Math.PI;
    if (d < -Math.PI) d += 2 * Math.PI;
    total += d;
  }
  return Math.round(total / (2 * Math.PI)) || 0; // || 0 turns −0 into 0
}

/**
 * ∮ f(z) dz on the circle |z − c| = r with z = c + r e^{iθ}, dz = i (z − c) dθ, by the trapezoid rule in θ.
 * For a smooth periodic integrand this is accurate to rounding error with a few hundred points.
 */
export function circleIntegral(f: (z: C) => C, c: C, r: number, M = 400): { value: C; running: C[] } {
  let s: C = [0, 0];
  const running: C[] = [s];
  const dt = (2 * Math.PI) / M;
  for (let j = 0; j < M; j++) {
    const u = fromPolar(r, j * dt);
    const z = add(c, u);
    s = add(s, scale(mul(f(z), [-u[1], u[0]]), dt)); // i·u = (−u_y, u_x)
    running.push(s);
  }
  return { value: s, running };
}

/** ∮_{|z| = r} z^n dz on a circle around 0, M points. */
export const powerOnCircle = (n: number, r: number, M = 400) => circleIntegral((z) => cpowInt(z, n), [0, 0], r, M);

/* ───────── functions used in the lesson ───────── */

export type FnId = 'square' | 'exp' | 'inv' | 'twoPoles';
export const FNS: Record<FnId, { name: string; tex: string; f: (z: C) => C; poles: C[] }> = {
  square: { name: 'z²', tex: 'z^2', f: (z) => mul(z, z), poles: [] },
  exp: { name: 'eᶻ', tex: 'e^z', f: cexp, poles: [] },
  inv: { name: '1/z', tex: '\\dfrac{1}{z}', f: inv, poles: [[0, 0]] },
  twoPoles: { name: '1/z + 1/(z−1)', tex: '\\dfrac{1}{z} + \\dfrac{1}{z-1}', f: (z) => add(inv(z), inv(sub(z, [1, 0]))), poles: [[0, 0], [1, 0]] },
};

/* ───────── Cauchy's integral formula ───────── */

export type CauchyId = 'exp' | 'sin' | 'cubic';
export const CAUCHY_FNS: Record<CauchyId, { name: string; tex: string; f: (z: C) => C; df: (z: C) => C }> = {
  exp: { name: 'eᶻ', tex: 'e^z', f: cexp, df: cexp },
  sin: { name: 'sin z', tex: '\\sin z', f: csin, df: (z) => [Math.cos(z[0]) * Math.cosh(z[1]), -Math.sin(z[0]) * Math.sinh(z[1])] },
  cubic: { name: 'z³ − z', tex: 'z^3 - z', f: (z) => sub(mul(z, mul(z, z)), z), df: (z) => sub(scale(mul(z, z), 3), [1, 0]) },
};

/** (1/2πi) ∮ f(z) / (z − z0)^{k+1} dz on the circle |z| = r, times k!: the formula for f^{(k)}(z0). */
export function cauchyFormula(f: (z: C) => C, z0: C, r: number, k: 0 | 1, M = 400): C {
  const { value } = circleIntegral((z) => div(f(z), cpowInt(sub(z, z0), k + 1)), [0, 0], r, M);
  // divide by 2πi
  return div(value, [0, 2 * Math.PI]);
}

/* ───────── maximum modulus ───────── */

export type ModId = 'exp' | 'poly' | 'sin';
export const MOD_FNS: Record<ModId, { name: string; tex: string; f: (z: C) => C }> = {
  exp: { name: 'eᶻ', tex: 'e^z', f: cexp },
  poly: { name: 'z² + z/2 + 0.3', tex: 'z^2 + \\tfrac{z}{2} + 0.3', f: (z) => add(add(mul(z, z), scale(z, 0.5)), [0.3, 0]) },
  sin: { name: 'sin(2z)', tex: '\\sin 2z', f: (z) => csin(scale(z, 2)) },
};

/** Largest |f| over a grid inside the closed unit disk, and where it is. */
export function diskMax(f: (z: C) => C, n = 161): { max: number; at: C; boundaryMax: number } {
  let mx = -1, at: C = [0, 0];
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const z: C = [-1 + (2 * i) / (n - 1), -1 + (2 * j) / (n - 1)];
      if (cabs(z) > 1 + 1e-12) continue;
      const v = cabs(f(z));
      if (v > mx) {
        mx = v;
        at = z;
      }
    }
  let bmx = 0;
  for (let j = 0; j < 1440; j++) bmx = Math.max(bmx, cabs(f(fromPolar(1, (2 * Math.PI * j) / 1440))));
  return { max: mx, at, boundaryMax: bmx };
}

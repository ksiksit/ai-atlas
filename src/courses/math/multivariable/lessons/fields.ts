/*
 * 다변수 미적분: plane vector fields and the numerics the vector-field lessons share.
 * Every field comes with its divergence and curl written out by hand, so a figure can show
 * the exact value next to the numeric estimate. Pure functions, no imports.
 */

export type V2 = [number, number];

export type FieldId = 'uniform' | 'source' | 'rotation' | 'hill' | 'wave';

export interface Field {
  id: FieldId;
  name: string;
  /** TeX for F(x, y) = (P, Q). */
  tex: string;
  F: (x: number, y: number) => V2;
  /** ∂P/∂x + ∂Q/∂y */
  div: (x: number, y: number) => number;
  /** ∂Q/∂x − ∂P/∂y (the z-component of the curl) */
  curl: (x: number, y: number) => number;
  /** A potential φ with ∇φ = F, when the field has one. */
  potential?: (x: number, y: number) => number;
  potTex?: string;
}

export const FIELDS: Record<FieldId, Field> = {
  uniform: {
    id: 'uniform',
    name: '일정한 바람',
    tex: '\\mathbf F = (1,\\; 0.5)',
    F: () => [1, 0.5],
    div: () => 0,
    curl: () => 0,
    potential: (x, y) => x + 0.5 * y,
    potTex: '\\varphi = x + 0.5y',
  },
  source: {
    id: 'source',
    name: '샘',
    tex: '\\mathbf F = (0.5x,\\; 0.5y)',
    F: (x, y) => [0.5 * x, 0.5 * y],
    div: () => 1,
    curl: () => 0,
    potential: (x, y) => 0.25 * (x * x + y * y),
    potTex: '\\varphi = \\tfrac14 (x^2 + y^2)',
  },
  rotation: {
    id: 'rotation',
    name: '소용돌이',
    tex: '\\mathbf F = (-0.5y,\\; 0.5x)',
    F: (x, y) => [-0.5 * y, 0.5 * x],
    div: () => 0,
    curl: () => 1,
  },
  hill: {
    id: 'hill',
    name: '언덕의 경사',
    tex: '\\mathbf F = (\\cos x \\cos y,\\; -\\sin x \\sin y)',
    F: (x, y) => [Math.cos(x) * Math.cos(y), -Math.sin(x) * Math.sin(y)],
    div: (x, y) => -2 * Math.sin(x) * Math.cos(y),
    curl: () => 0,
    potential: (x, y) => Math.sin(x) * Math.cos(y),
    potTex: '\\varphi = \\sin x \\cos y',
  },
  wave: {
    id: 'wave',
    name: '물결 흐름',
    tex: '\\mathbf F = (0.6\\sin y + 0.15x,\\; 0.6\\sin x)',
    F: (x, y) => [0.6 * Math.sin(y) + 0.15 * x, 0.6 * Math.sin(x)],
    div: () => 0.15,
    curl: (x, y) => 0.6 * Math.cos(x) - 0.6 * Math.cos(y),
  },
};

export const FIELD_IDS: FieldId[] = ['uniform', 'source', 'rotation', 'hill', 'wave'];

/* ───────── paths ───────── */

/** Quadratic Bézier from a through control c to b, sampled at n + 1 points. */
export function bezier(a: V2, c: V2, b: V2, n = 400): V2[] {
  const out: V2[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const u = 1 - t;
    out.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]);
  }
  return out;
}

/** Straight segment from a to b sampled at n + 1 points. */
export function segment(a: V2, b: V2, n = 200): V2[] {
  const out: V2[] = [];
  for (let i = 0; i <= n; i++) out.push([a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n]);
  return out;
}

/** Circle of radius r around (cx, cy), counter-clockwise, closed (first point repeated). */
export function circle(cx: number, cy: number, r: number, n = 400): V2[] {
  const out: V2[] = [];
  for (let i = 0; i <= n; i++) {
    const t = (2 * Math.PI * i) / n;
    out.push([cx + r * Math.cos(t), cy + r * Math.sin(t)]);
  }
  return out;
}

/** Smooth closed curve through the given vertices (Catmull-Rom), counter-clockwise if they are. */
export function closedSpline(pts: V2[], per = 60): V2[] {
  const n = pts.length;
  const out: V2[] = [];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(out[0]);
  return out;
}

export function pathLength(path: V2[]): number {
  let s = 0;
  for (let i = 1; i < path.length; i++) s += Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]);
  return s;
}

/** Signed area by the shoelace formula: positive when the closed path runs counter-clockwise. */
export function signedArea(path: V2[]): number {
  let a = 0;
  for (let i = 1; i < path.length; i++) a += path[i - 1][0] * path[i][1] - path[i][0] * path[i - 1][1];
  return a / 2;
}

/* ───────── integrals along curves ───────── */

/** ∫ F · dr along the path (midpoint rule on each little segment). */
export function lineIntegral(f: Field, path: V2[]): number {
  let w = 0;
  for (let i = 1; i < path.length; i++) {
    const [x0, y0] = path[i - 1], [x1, y1] = path[i];
    const [P, Q] = f.F((x0 + x1) / 2, (y0 + y1) / 2);
    w += P * (x1 - x0) + Q * (y1 - y0);
  }
  return w;
}

/** The tangential component F · T at each point, against arc length s: what the line integral adds up. */
export function tangentialProfile(f: Field, path: V2[], samples = 120): { s: number[]; ft: number[]; total: number } {
  const s: number[] = [];
  const ft: number[] = [];
  let acc = 0;
  const step = Math.max(1, Math.floor((path.length - 1) / samples));
  for (let i = 1; i < path.length; i++) {
    const [x0, y0] = path[i - 1], [x1, y1] = path[i];
    const ds = Math.hypot(x1 - x0, y1 - y0);
    if (i % step === 0 && ds > 0) {
      const [P, Q] = f.F((x0 + x1) / 2, (y0 + y1) / 2);
      s.push(acc + ds / 2);
      ft.push((P * (x1 - x0) + Q * (y1 - y0)) / ds);
    }
    acc += ds;
  }
  return { s, ft, total: acc };
}

/** Outward flux ∮ F · n ds through a closed counter-clockwise path (n = (dy, −dx) / ds). */
export function flux(f: Field, path: V2[]): number {
  let q = 0;
  for (let i = 1; i < path.length; i++) {
    const [x0, y0] = path[i - 1], [x1, y1] = path[i];
    const [P, Q] = f.F((x0 + x1) / 2, (y0 + y1) / 2);
    q += P * (y1 - y0) - Q * (x1 - x0);
  }
  return q;
}

/* ───────── integrals over regions ───────── */

export function inside(path: V2[], x: number, y: number): boolean {
  let c = false;
  for (let i = 0, j = path.length - 1; i < path.length; j = i++) {
    const [xi, yi] = path[i], [xj, yj] = path[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}

/**
 * ∬ g dA over the region a closed path encloses. Rows of height h; on each row the exact
 * crossings with the boundary are found, and g is integrated between them with the midpoint rule
 * in steps of at most dx0.
 */
export function areaIntegral(g: (x: number, y: number) => number, path: V2[], h = 0.02, dx0 = h): number {
  let y0 = Infinity, y1 = -Infinity;
  for (const [, y] of path) {
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  let s = 0;
  for (let y = y0 + h / 2; y < y1; y += h) {
    const xs: number[] = [];
    for (let i = 1; i < path.length; i++) {
      const [xa, ya] = path[i - 1], [xb, yb] = path[i];
      if (ya > y !== yb > y) xs.push(xa + ((y - ya) * (xb - xa)) / (yb - ya));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const a = xs[k], b = xs[k + 1];
      const m = Math.max(2, Math.ceil((b - a) / dx0));
      const dx = (b - a) / m;
      for (let q = 0; q < m; q++) s += g(a + (q + 0.5) * dx, y) * dx;
    }
  }
  return s * h;
}

/* ───────── tiny boxes: divergence and curl as limits ───────── */

/** The closed counter-clockwise square of side h centred at (cx, cy). */
export function square(cx: number, cy: number, h: number, perSide = 50): V2[] {
  const a = h / 2;
  const corners: V2[] = [[cx - a, cy - a], [cx + a, cy - a], [cx + a, cy + a], [cx - a, cy + a], [cx - a, cy - a]];
  const out: V2[] = [];
  for (let k = 0; k < 4; k++) {
    const [p, q] = [corners[k], corners[k + 1]];
    for (let i = 0; i < perSide; i++) out.push([p[0] + ((q[0] - p[0]) * i) / perSide, p[1] + ((q[1] - p[1]) * i) / perSide]);
  }
  out.push(out[0]);
  return out;
}

/** Outflow through each edge of the square (right, top, left, bottom), for drawing. */
export function edgeFluxes(f: Field, cx: number, cy: number, h: number): number[] {
  const a = h / 2;
  const sides: [V2, V2][] = [
    [[cx + a, cy - a], [cx + a, cy + a]],
    [[cx + a, cy + a], [cx - a, cy + a]],
    [[cx - a, cy + a], [cx - a, cy - a]],
    [[cx - a, cy - a], [cx + a, cy - a]],
  ];
  return sides.map(([p, q]) => flux(f, segment(p, q, 60)));
}

/** Flux out of the little square divided by its area: tends to the divergence as h → 0. */
export const divEstimate = (f: Field, cx: number, cy: number, h: number) => flux(f, square(cx, cy, h)) / (h * h);
/** Circulation around the little square divided by its area: tends to the curl as h → 0. */
export const curlEstimate = (f: Field, cx: number, cy: number, h: number) => lineIntegral(f, square(cx, cy, h)) / (h * h);

/* ───────── moving along the field ───────── */

/** One fourth-order Runge–Kutta step of dx/dt = F(x). */
export function rk4(f: Field, p: V2, dt: number): V2 {
  const k1 = f.F(p[0], p[1]);
  const k2 = f.F(p[0] + (dt / 2) * k1[0], p[1] + (dt / 2) * k1[1]);
  const k3 = f.F(p[0] + (dt / 2) * k2[0], p[1] + (dt / 2) * k2[1]);
  const k4 = f.F(p[0] + dt * k3[0], p[1] + dt * k3[1]);
  return [p[0] + (dt / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]), p[1] + (dt / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1])];
}

/** Deterministic pseudo-random numbers (mulberry32), so particle clouds look the same on every load. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ───────── 3-D pictures for Stokes and the divergence theorem ───────── */

/**
 * Flux of curl F = (0, 0, 1) through the cap z = t(1 − x² − y²) over the unit disc, for
 * F = (−y/2, x/2, 0). Computed on a triangulated surface, so the reader sees it stay π.
 */
export function capCurlFlux(t: number, nr = 30, nth = 360): number {
  const P = (r: number, th: number): [number, number, number] => [r * Math.cos(th), r * Math.sin(th), t * (1 - r * r)];
  let s = 0;
  for (let i = 0; i < nr; i++)
    for (let j = 0; j < nth; j++) {
      const r0 = i / nr, r1 = (i + 1) / nr, a0 = (2 * Math.PI * j) / nth, a1 = (2 * Math.PI * (j + 1)) / nth;
      const A = P(r0, a0), B = P(r1, a0), C = P(r1, a1), D = P(r0, a1);
      // z-component of the oriented area of the two triangles (upward normal)
      const nz = (u: number[], v: number[], w: number[]) => ((v[0] - u[0]) * (w[1] - u[1]) - (v[1] - u[1]) * (w[0] - u[0])) / 2;
      s += nz(A, B, C) + nz(A, C, D);
    }
  return s;
}

/** The 3-D field of the divergence-theorem picture: F = (x²/2, y/2, z/2), whose divergence is x + 1. */
export const cubeField = (x: number, y: number, z: number): [number, number, number] => [(x * x) / 2, y / 2, z / 2];
export const cubeDiv = (x: number) => x + 1;

/**
 * Outward flux of cubeField through the cube of side a centred at (c, 0, 0), face by face with a
 * midpoint grid, and the volume integral of the divergence over the same cube. They agree: (c + 1)a³.
 */
export function cubeFlux(a: number, c: number, n = 20): { faces: number[]; total: number; volume: number } {
  const h = a / n;
  const faces = [0, 0, 0, 0, 0, 0]; // +x, −x, +y, −y, +z, −z
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const u = -a / 2 + (i + 0.5) * h;
      const v = -a / 2 + (j + 0.5) * h;
      const dA = h * h;
      faces[0] += cubeField(c + a / 2, u, v)[0] * dA;
      faces[1] -= cubeField(c - a / 2, u, v)[0] * dA;
      faces[2] += cubeField(c + u, a / 2, v)[1] * dA;
      faces[3] -= cubeField(c + u, -a / 2, v)[1] * dA;
      faces[4] += cubeField(c + u, v, a / 2)[2] * dA;
      faces[5] -= cubeField(c + u, v, -a / 2)[2] * dA;
    }
  let volume = 0;
  for (let i = 0; i < n; i++) volume += cubeDiv(c - a / 2 + (i + 0.5) * h) * h * a * a;
  return { faces, total: faces.reduce((p, q) => p + q, 0), volume };
}

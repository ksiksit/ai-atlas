/* 연쇄 법칙과 야코비 행렬: maps of the plane, their Jacobians, and area measurements. */

export type V2 = [number, number];
/** 2×2 matrix, rows first: [[a, b], [c, d]]. */
export type M2 = [[number, number], [number, number]];

export interface PlaneMap {
  id: string;
  name: string;
  /** TeX of the map. */
  tex: string;
  /** TeX of the Jacobian matrix and its determinant. */
  jtex: string;
  dtex: string;
  /** Names of the input coordinates, e.g. ['r', 'θ']. */
  inNames: [string, string];
  f: (p: V2) => V2;
  J: (p: V2) => M2;
  /** The input rectangle the figures draw. */
  dom: { u0: number; u1: number; v0: number; v1: number };
  /** Grid lines per side in the figure. */
  lines: number;
  /** Default point. */
  p0: V2;
}

export const MAPS: Record<'polar' | 'twist' | 'square', PlaneMap> = {
  polar: {
    id: 'polar',
    name: '극좌표',
    tex: '(r,\\theta)\\mapsto(r\\cos\\theta,\\; r\\sin\\theta)',
    jtex: 'J=\\begin{pmatrix}\\cos\\theta & -r\\sin\\theta\\\\ \\sin\\theta & r\\cos\\theta\\end{pmatrix}',
    dtex: '\\det J = r',
    inNames: ['r', 'θ'],
    f: ([r, t]) => [r * Math.cos(t), r * Math.sin(t)],
    J: ([r, t]) => [[Math.cos(t), -r * Math.sin(t)], [Math.sin(t), r * Math.cos(t)]],
    dom: { u0: 0.2, u1: 2, v0: 0, v1: Math.PI },
    lines: 9,
    p0: [1.5, 0.6],
  },
  twist: {
    id: 'twist',
    name: '휘고 밀기',
    tex: '(x,y)\\mapsto\\left(x+0.4y^2,\\; y+0.3\\sin 1.5x\\right)',
    jtex: 'J=\\begin{pmatrix}1 & 0.8y\\\\ 0.45\\cos 1.5x & 1\\end{pmatrix}',
    dtex: '\\det J = 1-0.36\\,y\\cos 1.5x',
    inNames: ['x', 'y'],
    f: ([x, y]) => [x + 0.4 * y * y, y + 0.3 * Math.sin(1.5 * x)],
    J: ([x, y]) => [[1, 0.8 * y], [0.45 * Math.cos(1.5 * x), 1]],
    dom: { u0: -1.5, u1: 1.5, v0: -1.5, v1: 1.5 },
    lines: 9,
    p0: [0.4, 1],
  },
  square: {
    id: 'square',
    name: '복소수 제곱',
    tex: '(x,y)\\mapsto\\left(x^2-y^2,\\; 2xy\\right)',
    jtex: 'J=\\begin{pmatrix}2x & -2y\\\\ 2y & 2x\\end{pmatrix}',
    dtex: '\\det J = 4(x^2+y^2)',
    inNames: ['x', 'y'],
    f: ([x, y]) => [x * x - y * y, 2 * x * y],
    J: ([x, y]) => [[2 * x, -2 * y], [2 * y, 2 * x]],
    dom: { u0: 0.2, u1: 1.4, v0: -1, v1: 1 },
    lines: 7,
    p0: [1, 0.5],
  },
};

export type MapId = keyof typeof MAPS;

export const det = (m: M2) => m[0][0] * m[1][1] - m[0][1] * m[1][0];
export const mul = (a: M2, b: M2): M2 => [
  [a[0][0] * b[0][0] + a[0][1] * b[1][0], a[0][0] * b[0][1] + a[0][1] * b[1][1]],
  [a[1][0] * b[0][0] + a[1][1] * b[1][0], a[1][0] * b[0][1] + a[1][1] * b[1][1]],
];
export const apply = (m: M2, v: V2): V2 => [m[0][0] * v[0] + m[0][1] * v[1], m[1][0] * v[0] + m[1][1] * v[1]];

/** Boundary of the image of the square [p, p + h]², sampled `k` points per side, counter-clockwise. */
export function imageOfSquare(f: (p: V2) => V2, p: V2, h: number, k = 32): V2[] {
  const out: V2[] = [];
  const side = (a: V2, b: V2) => {
    for (let i = 0; i < k; i++) {
      const t = i / k;
      out.push(f([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]));
    }
  };
  const [x, y] = p;
  side([x, y], [x + h, y]);
  side([x + h, y], [x + h, y + h]);
  side([x + h, y + h], [x, y + h]);
  side([x, y + h], [x, y]);
  return out;
}

/** Signed area of a polygon (shoelace). */
export function area(poly: V2[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    s += a[0] * b[1] - a[1] * b[0];
  }
  return s / 2;
}

/** The parallelogram the Jacobian predicts for the square [p, p + h]². */
export function predicted(f: (p: V2) => V2, J: M2, p: V2, h: number): V2[] {
  const o = f(p);
  const c1: V2 = [J[0][0] * h, J[1][0] * h];
  const c2: V2 = [J[0][1] * h, J[1][1] * h];
  return [o, [o[0] + c1[0], o[1] + c1[1]], [o[0] + c1[0] + c2[0], o[1] + c1[1] + c2[1]], [o[0] + c2[0], o[1] + c2[1]]];
}

/** Largest distance from the true image's corners to the predicted parallelogram's corners. */
export function cornerGap(f: (p: V2) => V2, J: M2, p: V2, h: number): number {
  const q = predicted(f, J, p, h);
  const real: V2[] = [f(p), f([p[0] + h, p[1]]), f([p[0] + h, p[1] + h]), f([p[0], p[1] + h])];
  return Math.max(...real.map((r, i) => Math.hypot(r[0] - q[i][0], r[1] - q[i][1])));
}

/* ───────── the two-step map for the chain rule ───────── */

/** g(x, y) = (x + y, xy). */
export const g = ([x, y]: V2): V2 => [x + y, x * y];
export const Jg = ([x, y]: V2): M2 => [[1, 1], [y, x]];
/** f(u, v) = (uv, u − v²). */
export const f = ([u, v]: V2): V2 => [u * v, u - v * v];
export const Jf = ([u, v]: V2): M2 => [[v, u], [1, -2 * v]];
export const fg = (p: V2) => f(g(p));

/** Jacobian by central differences, to check the chain rule numerically. */
export function numericJ(F: (p: V2) => V2, p: V2, h = 1e-5): M2 {
  const ax = F([p[0] + h, p[1]]), bx = F([p[0] - h, p[1]]);
  const ay = F([p[0], p[1] + h]), by = F([p[0], p[1] - h]);
  return [
    [(ax[0] - bx[0]) / (2 * h), (ay[0] - by[0]) / (2 * h)],
    [(ax[1] - bx[1]) / (2 * h), (ay[1] - by[1]) / (2 * h)],
  ];
}

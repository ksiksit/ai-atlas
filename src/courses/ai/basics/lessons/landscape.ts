/**
 * Loss landscapes shared by the gradient-descent lessons.
 * Coordinates are the two parameters (u, v); 3D views put u on world x, the loss on world y and v on world −z.
 */

/** Half-width of the square parameter region [−R, R]². */
export const R = 2.5;

/** A bumpy landscape with one deep valley (the global minimum) and two shallower ones. */
export function f2(x: number, y: number) {
  return (
    0.075 * (x * x + y * y) -
    1.15 * Math.exp(-((x - 1.1) ** 2 + (y - 0.9) ** 2) / 0.7) -
    0.75 * Math.exp(-((x + 1.25) ** 2 + (y + 0.75) ** 2) / 0.45) -
    0.55 * Math.exp(-((x + 0.5) ** 2 + (y - 1.55) ** 2) / 0.22) +
    0.12 * Math.sin(2.1 * x) * Math.sin(1.9 * y)
  );
}

export function numGrad(f: (u: number, v: number) => number, u: number, v: number): [number, number] {
  const h = 1e-4;
  return [(f(u + h, v) - f(u - h, v)) / (2 * h), (f(u, v + h) - f(u, v - h)) / (2 * h)];
}

export function g2(x: number, y: number): [number, number] {
  return numGrad(f2, x, y);
}

/** Lowest value and its location on a grid search over [−R, R]². */
export function gridMin(f: (u: number, v: number) => number, n = 200): { u: number; v: number; f: number } {
  let best = { u: 0, v: 0, f: Infinity };
  for (let i = 0; i <= n; i++)
    for (let j = 0; j <= n; j++) {
      const u = -R + (2 * R * i) / n;
      const v = -R + (2 * R * j) / n;
      const z = f(u, v);
      if (z < best.f) best = { u, v, f: z };
    }
  return best;
}

/* ───────── Hard terrains: a ravine, a saddle and a plateau ───────── */

export type TerrainId = 'ravine' | 'saddle' | 'plateau';

export interface Terrain {
  id: TerrainId;
  name: string;
  f: (u: number, v: number) => number;
  /** Vertical scale used only for drawing and walking. */
  zs: number;
  /** Where the walker starts, and which way it first looks (yaw, see World3D). */
  start: [number, number];
  yaw: number;
  /** Learning rate the figure starts with. */
  lr: number;
  /** Where the loss is lowest (the target). */
  minima: [number, number][];
}

const plateau = (u: number, v: number) => {
  const r = Math.hypot(u, v);
  return 0.6 * Math.tanh(3 * (r - 1.2)) + 0.005 * r * r;
};

export const TERRAINS: Terrain[] = [
  {
    // Very steep across (v), almost flat along (u): curvatures 1.6 and 0.01.
    id: 'ravine',
    name: '좁은 협곡',
    f: (u, v) => 0.005 * u * u + 0.8 * v * v,
    zs: 0.32,
    start: [-2.2, 0.8],
    // look along the ravine toward +x
    yaw: -Math.PI / 2,
    lr: 1.1,
    minima: [[0, 0]],
  },
  {
    // A ridge along v = 0 with a saddle at the origin and two valleys at v = ±1.77.
    id: 'saddle',
    name: '안장점',
    f: (u, v) => 0.25 * u * u - 0.5 * v * v + 0.08 * v ** 4,
    zs: 0.45,
    start: [-2.2, 0],
    yaw: -Math.PI / 2,
    lr: 0.3,
    minima: [
      [0, Math.sqrt(0.5 / 0.16)],
      [0, -Math.sqrt(0.5 / 0.16)],
    ],
  },
  {
    // A high, nearly flat plateau that ends at a cliff around r = 1.2, with a basin inside.
    id: 'plateau',
    name: '고원',
    f: plateau,
    zs: 0.9,
    start: [-2.1, 0.9],
    // face the centre: world (x, z) = (−2.1, −0.9) looking toward the origin
    yaw: Math.atan2(-2.1, -0.9),
    lr: 0.5,
    minima: [[0, 0]],
  },
];

/* ───────── One optimizer step ───────── */

export type OptKind = 'sgd' | 'momentum';
export const MOMENTUM_BETA = 0.9;

export interface OptState {
  u: number;
  v: number;
  vu: number;
  vv: number;
}

/** θ ← θ − η∇L (SGD) or v ← βv + ∇L, θ ← θ − ηv (momentum). Returns the new state; positions stay inside [−R, R]². */
export function optStep(f: (u: number, v: number) => number, s: OptState, kind: OptKind, lr: number): OptState {
  const [gu, gv] = numGrad(f, s.u, s.v);
  let vu = gu;
  let vv = gv;
  if (kind === 'momentum') {
    vu = MOMENTUM_BETA * s.vu + gu;
    vv = MOMENTUM_BETA * s.vv + gv;
  }
  const clamp = (x: number) => Math.max(-R, Math.min(R, x));
  return { u: clamp(s.u - lr * vu), v: clamp(s.v - lr * vv), vu: kind === 'momentum' ? vu : 0, vv: kind === 'momentum' ? vv : 0 };
}

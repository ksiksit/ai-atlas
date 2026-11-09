/*
 * 미분방정식 · 로렌츠 끌개 안에 서기: a cloud of nearly equal starts and the Poincaré section
 * through the plane z = ρ − 1 that holds both fixed points C±. The reader walks on that plane.
 * No imports, so node can run this file directly.
 */

export const SIGMA = 10;
export const BETA = 8 / 3;
export const H = 0.005;

/** World units per unit of the Lorenz variables. */
export const S = 0.12;

/** Height of the floor in the Lorenz variable z: the plane of the fixed points C±. */
export const floorZ = (rho: number) => rho - 1;

/** Fixed points (±√(β(ρ−1)), ±√(β(ρ−1)), ρ−1). */
export const fixedPoints = (rho: number): [number, number, number][] => {
  const c = Math.sqrt(BETA * (rho - 1));
  return [
    [c, c, rho - 1],
    [-c, -c, rho - 1],
  ];
};

/** Lorenz (x, y, z) → world (X, Y, Z) with Y up and the floor at Y = 0. Right-handed both ways. */
export const toWorld = (rho: number, x: number, y: number, z: number): [number, number, number] => [x * S, (z - floorZ(rho)) * S, -y * S];
/** A point of the floor in world (X, Z) → Lorenz (x, y) on the plane z = ρ − 1. */
export const floorToLorenz = (X: number, Z: number): [number, number] => [X / S, -Z / S];

/** One RK4 step of every point in `p` (packed x, y, z), in place. */
export function stepAll(p: Float64Array, rho: number, h = H) {
  const f = (x: number, y: number, z: number, o: number[]) => {
    o[0] = SIGMA * (y - x);
    o[1] = x * (rho - z) - y;
    o[2] = x * y - BETA * z;
  };
  const k1 = [0, 0, 0];
  const k2 = [0, 0, 0];
  const k3 = [0, 0, 0];
  const k4 = [0, 0, 0];
  for (let i = 0; i < p.length; i += 3) {
    const x = p[i];
    const y = p[i + 1];
    const z = p[i + 2];
    f(x, y, z, k1);
    f(x + (h / 2) * k1[0], y + (h / 2) * k1[1], z + (h / 2) * k1[2], k2);
    f(x + (h / 2) * k2[0], y + (h / 2) * k2[1], z + (h / 2) * k2[2], k3);
    f(x + h * k3[0], y + h * k3[1], z + h * k3[2], k4);
    p[i] = x + (h / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]);
    p[i + 1] = y + (h / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]);
    p[i + 2] = z + (h / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2]);
  }
}

/** Deterministic PRNG (mulberry32). */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `n` points spread evenly through a ball of radius `r` around `c`. */
export function makeCloud(c: [number, number, number], r: number, n: number, seed = 1): Float64Array {
  const R = rng(seed);
  const p = new Float64Array(n * 3);
  for (let i = 0; i < n; i++) {
    let x: number;
    let y: number;
    let z: number;
    do {
      x = 2 * R() - 1;
      y = 2 * R() - 1;
      z = 2 * R() - 1;
    } while (x * x + y * y + z * z > 1);
    p[3 * i] = c[0] + r * x;
    p[3 * i + 1] = c[1] + r * y;
    p[3 * i + 2] = c[2] + r * z;
  }
  return p;
}

/** Root-mean-square distance of the points from their centroid. */
export function spread(p: Float64Array): number {
  const n = p.length / 3;
  let mx = 0;
  let my = 0;
  let mz = 0;
  for (let i = 0; i < p.length; i += 3) {
    mx += p[i];
    my += p[i + 1];
    mz += p[i + 2];
  }
  mx /= n;
  my /= n;
  mz /= n;
  let s = 0;
  for (let i = 0; i < p.length; i += 3) s += (p[i] - mx) ** 2 + (p[i + 1] - my) ** 2 + (p[i + 2] - mz) ** 2;
  return Math.sqrt(s / n);
}

/** Times at which the cloud's spread first reaches 10⁻², 10⁻¹, 1 and 10, starting from radius r. */
export function cloudMilestones(c: [number, number, number], rho: number, r = 1e-3, n = 400, T = 40): (number | null)[] {
  const p = makeCloud(c, r, n);
  const marks = [1e-2, 1e-1, 1, 10];
  const out: (number | null)[] = marks.map(() => null);
  for (let k = 1; k * H <= T; k++) {
    stepAll(p, rho);
    const s = spread(p);
    marks.forEach((m, i) => {
      if (out[i] === null && s >= m) out[i] = k * H;
    });
    if (out[out.length - 1] !== null) break;
  }
  return out;
}

/**
 * Follows one point and records where it crosses the floor z = ρ − 1 going down.
 * `onCross` gets the crossing point (x, y) by linear interpolation inside the step.
 */
export class SectionWalker {
  p: Float64Array;
  t = 0;
  constructor(
    public rho: number,
    start: [number, number, number] = [1, 1, 1],
  ) {
    this.p = new Float64Array(start);
  }
  advance(T: number, onCross: (x: number, y: number) => void, onStep?: (x: number, y: number, z: number) => void) {
    const z0 = floorZ(this.rho);
    const n = Math.round(T / H);
    for (let i = 0; i < n; i++) {
      const [x0, y0, zA] = this.p;
      stepAll(this.p, this.rho);
      this.t += H;
      const [x1, y1, zB] = this.p;
      if (zA > z0 && zB <= z0) {
        const a = (zA - z0) / (zA - zB);
        onCross(x0 + a * (x1 - x0), y0 + a * (y1 - y0));
      }
      onStep?.(x1, y1, zB);
    }
  }
}

/** A long orbit on the attractor (after a transient), for drawing its shape. */
export function ghostOrbit(rho: number, T = 60, every = 4): number[][] {
  const p = new Float64Array([1, 1, 1]);
  for (let i = 0; i < 20 / H; i++) stepAll(p, rho);
  const out: number[][] = [];
  for (let i = 0; i < T / H; i++) {
    stepAll(p, rho);
    if (i % every === 0) out.push([p[0], p[1], p[2]]);
  }
  return out;
}

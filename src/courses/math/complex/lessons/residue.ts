/*
 * 복소해석 · 유수 정리: complex arithmetic, contour integrals on circles and paths,
 * residues, the real integrals done by contours, and winding numbers.
 * No imports, so node can run it directly.
 */

export type C = [number, number];

export const c = (re: number, im = 0): C => [re, im];
export const add = (a: C, b: C): C => [a[0] + b[0], a[1] + b[1]];
export const sub = (a: C, b: C): C => [a[0] - b[0], a[1] - b[1]];
export const mul = (a: C, b: C): C => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
export const scale = (a: C, s: number): C => [a[0] * s, a[1] * s];
export function div(a: C, b: C): C {
  const d = b[0] * b[0] + b[1] * b[1];
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
}
export const abs = (a: C) => Math.hypot(a[0], a[1]);
export const arg = (a: C) => Math.atan2(a[1], a[0]);
export const cexp = (a: C): C => [Math.exp(a[0]) * Math.cos(a[1]), Math.exp(a[0]) * Math.sin(a[1])];
export const polar = (r: number, t: number): C => [r * Math.cos(t), r * Math.sin(t)];
export const I: C = [0, 1];

/** Format a complex number with d decimals, e.g. "0.5000 − 1.2000i"; tiny parts print as 0. */
export function fmtC(z: C, d = 4): string {
  const t = 0.5 * 10 ** -d;
  const re = Math.abs(z[0]) < t ? 0 : z[0];
  const im = Math.abs(z[1]) < t ? 0 : z[1];
  if (im === 0) return re.toFixed(d);
  if (re === 0) return `${im < 0 ? '−' : ''}${Math.abs(im).toFixed(d)}i`;
  return `${re.toFixed(d)} ${im < 0 ? '−' : '+'} ${Math.abs(im).toFixed(d)}i`;
}

/**
 * ∮ f(z) dz around the circle |z − c| = r, counterclockwise, by the trapezoid rule with n points.
 * For a function analytic near the circle the trapezoid rule on a closed curve converges very fast.
 */
export function circleIntegral(f: (z: C) => C, center: C, r: number, n = 512): C {
  let s: C = [0, 0];
  for (let k = 0; k < n; k++) {
    const t = (2 * Math.PI * k) / n;
    const e = polar(1, t);
    const z = add(center, scale(e, r));
    const dz = scale(mul(I, e), r); // dz/dt
    s = add(s, mul(f(z), dz));
  }
  return scale(s, (2 * Math.PI) / n);
}

/** (1/2πi) ∮ f dz around a circle. */
export const circleRes = (f: (z: C) => C, center: C, r: number, n = 512): C => div(circleIntegral(f, center, r, n), [0, 2 * Math.PI]);

/* ───────── figure 1: residues at one pole ───────── */

export interface PoleExample {
  id: string;
  name: string;
  tex: string;
  f: (z: C) => C;
  /** The pole whose residue the figure computes, and the other poles. */
  pole: C;
  others: C[];
  order: number;
  /** Exact residue and how it is found. */
  res: C;
  how: string;
}

export const POLE_EXAMPLES: PoleExample[] = [
  {
    id: 'simple',
    name: '1/(z²+1), z = i',
    tex: 'f(z) = \\dfrac{1}{z^2 + 1}',
    f: (z) => div([1, 0], add(mul(z, z), [1, 0])),
    pole: [0, 1],
    others: [[0, -1]],
    order: 1,
    res: [0, -0.5],
    how: '\\operatorname{Res}_{i} f = \\frac{1}{i + i} = -\\frac{i}{2}',
  },
  {
    id: 'simple2',
    name: '1/(z(z−2)), z = 0',
    tex: 'f(z) = \\dfrac{1}{z(z-2)}',
    f: (z) => div([1, 0], mul(z, sub(z, [2, 0]))),
    pole: [0, 0],
    others: [[2, 0]],
    order: 1,
    res: [-0.5, 0],
    how: '\\operatorname{Res}_{0} f = \\frac{1}{0 - 2} = -\\frac{1}{2}',
  },
  {
    id: 'double',
    name: 'eᶻ/(z−1)², z = 1',
    tex: 'f(z) = \\dfrac{e^z}{(z-1)^2}',
    f: (z) => {
      const d = sub(z, [1, 0]);
      return div(cexp(z), mul(d, d));
    },
    pole: [1, 0],
    others: [],
    order: 2,
    res: [Math.E, 0],
    how: '\\operatorname{Res}_{1} f = (e^z)\'\\big|_{z=1} = e',
  },
];

/* ───────── figure 2: three poles and a movable circle ───────── */

export const THREE_POLES: C[] = [
  [1, 0.4],
  [-1, 1],
  [-0.4, -1],
];

/** f(z) = 1/((z−p₁)(z−p₂)(z−p₃)). */
export function threePoles(z: C): C {
  let d: C = [1, 0];
  for (const p of THREE_POLES) d = mul(d, sub(z, p));
  return div([1, 0], d);
}

/** Residue at each pole of threePoles: 1 / ∏_{j≠k} (p_k − p_j). */
export function threePoleResidues(): C[] {
  return THREE_POLES.map((p, k) => {
    let d: C = [1, 0];
    THREE_POLES.forEach((q, j) => {
      if (j !== k) d = mul(d, sub(p, q));
    });
    return div([1, 0], d);
  });
}

/** Distance from the circle to the nearest pole; the numeric integral is unreliable when this is tiny. */
export function nearestPoleGap(center: C, r: number): number {
  return Math.min(...THREE_POLES.map((p) => Math.abs(abs(sub(p, center)) - r)));
}

/* ───────── figure 3: real integrals by contours ───────── */

/** ∫ along a parametrised path z(t), t ∈ [a, b], by composite Simpson with n (even) panels. */
export function pathIntegral(f: (z: C) => C, z: (t: number) => C, dz: (t: number) => C, a: number, b: number, n = 2000): C {
  const h = (b - a) / n;
  let s: C = [0, 0];
  for (let k = 0; k <= n; k++) {
    const t = a + k * h;
    const w = k === 0 || k === n ? 1 : k % 2 ? 4 : 2;
    s = add(s, scale(mul(f(z(t)), dz(t)), w));
  }
  return scale(s, h / 3);
}

export type RealCase = 'x2' | 'x4';

export const realF = (kind: RealCase) => (z: C): C => {
  if (kind === 'x2') return div([1, 0], add(mul(z, z), [1, 0]));
  const z2 = mul(z, z);
  return div([1, 0], add(mul(z2, z2), [1, 0]));
};

/** Poles in the upper half plane and their residues. */
export function upperResidues(kind: RealCase): { pole: C; res: C }[] {
  if (kind === 'x2') return [{ pole: [0, 1], res: [0, -0.5] }];
  // poles of 1/(1+z⁴) at e^{iπ/4}, e^{3iπ/4}; residue 1/(4z³) = −z/4 since z⁴ = −1
  return [Math.PI / 4, (3 * Math.PI) / 4].map((t) => {
    const p = polar(1, t);
    return { pole: p, res: scale(p, -0.25) };
  });
}

export interface SemicircleParts {
  segment: C;
  arc: C;
  total: C;
  /** 2πi × (sum of residues inside), which equals total once R > 1. */
  residues: C;
  /** The ML bound on |arc|: πR · max|f| on the arc. */
  bound: number;
  exact: number;
}

export function semicircle(kind: RealCase, R: number): SemicircleParts {
  const f = realF(kind);
  const segment = pathIntegral(f, (t) => [t, 0], () => [1, 0], -R, R, 4000);
  const arc = pathIntegral(f, (t) => polar(R, t), (t) => mul(I, polar(R, t)), 0, Math.PI, 4000);
  const total = add(segment, arc);
  const inside = R > 1 ? upperResidues(kind) : [];
  const sum = inside.reduce<C>((s, r) => add(s, r.res), [0, 0]);
  const residues = mul([0, 2 * Math.PI], sum);
  const p = kind === 'x2' ? 2 : 4;
  const bound = R > 1 ? (Math.PI * R) / (R ** p - 1) : Infinity;
  const exact = kind === 'x2' ? Math.PI : Math.PI / Math.SQRT2;
  return { segment, arc, total, residues, bound, exact };
}

/** ∫₀^{2π} dθ / (a + cos θ) for a > 1, directly (Simpson) and by the residue at z₀ = −a + √(a²−1). */
export function cosIntegral(a: number) {
  const n = 2000;
  const h = (2 * Math.PI) / n;
  let s = 0;
  for (let k = 0; k <= n; k++) {
    const w = k === 0 || k === n ? 1 : k % 2 ? 4 : 2;
    s += w / (a + Math.cos(k * h));
  }
  const direct = (s * h) / 3;
  const z0 = -a + Math.sqrt(a * a - 1);
  const z1 = -a - Math.sqrt(a * a - 1);
  // integrand on |z| = 1: 2 / (i (z² + 2az + 1)) = 2 / (i (z − z0)(z − z1)); residue at z0 = 2 / (i (z0 − z1))
  const res: C = div([2, 0], mul(I, [z0 - z1, 0]));
  const viaRes = mul([0, 2 * Math.PI], res)[0];
  return { direct, viaRes, exact: (2 * Math.PI) / Math.sqrt(a * a - 1), z0, z1, res };
}

/* ───────── figure 4: the argument principle ───────── */

export const ARG_ZEROS: C[] = [
  [0.8, 0.5],
  [-0.9, 0.3],
  [0.1, -1],
];
export const ARG_POLE: C = [-0.2, 0.9];

/** f(z) = (z−a₁)(z−a₂)(z−a₃) / (z − p): three zeros, one pole. */
export function argF(z: C, withPole: boolean): C {
  let n: C = [1, 0];
  for (const a of ARG_ZEROS) n = mul(n, sub(z, a));
  return withPole ? div(n, sub(z, ARG_POLE)) : n;
}

/** The image f(γ) of the circle |z − c| = r, sampled at n points. */
export function imageCurve(center: C, r: number, withPole: boolean, n = 720): C[] {
  return Array.from({ length: n + 1 }, (_, k) => argF(add(center, polar(r, (2 * Math.PI * k) / n)), withPole));
}

/** Winding number of a closed sampled curve around 0, by adding up the change of argument. */
export function winding(curve: C[]): number {
  let total = 0;
  for (let k = 1; k < curve.length; k++) {
    let d = arg(curve[k]) - arg(curve[k - 1]);
    if (d > Math.PI) d -= 2 * Math.PI;
    if (d < -Math.PI) d += 2 * Math.PI;
    total += d;
  }
  return total / (2 * Math.PI);
}

export const inside = (p: C, center: C, r: number) => abs(sub(p, center)) < r;

/* ───────── domain colouring ───────── */

/** HSL (h in turns) to 0..255 RGB. */
function hsl(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h * 12) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
}

/**
 * Colour for the value w = f(z): hue from arg w (red at positive reals, going round the colour wheel),
 * and soft light/dark bands where |w| doubles, so zeros and poles show as points where all hues meet.
 */
export function domainColour(w: C, dark: boolean): [number, number, number, number] {
  if (!isFinite(w[0]) || !isFinite(w[1])) return dark ? [235, 235, 235, 255] : [30, 30, 30, 255];
  const h = ((arg(w) / (2 * Math.PI)) % 1 + 1) % 1;
  const m = Math.log2(abs(w) + 1e-300);
  const band = m - Math.floor(m); // 0..1 within each doubling
  const l = (dark ? 0.42 : 0.55) + 0.12 * (band - 0.5);
  const [r, g, b] = hsl(h, dark ? 0.55 : 0.65, l);
  return [r, g, b, 255];
}

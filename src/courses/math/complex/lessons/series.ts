/*
 * 복소해석 · 멱급수와 로랑 급수: complex arithmetic and the series in the lesson.
 * Domain colouring comes from cplx.ts so the whole course shares one colour scheme.
 * No imports, so node can run it directly.
 */

export type C = [number, number];

export const add = (a: C, b: C): C => [a[0] + b[0], a[1] + b[1]];
export const sub = (a: C, b: C): C => [a[0] - b[0], a[1] - b[1]];
export const mul = (a: C, b: C): C => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
export const scale = (a: C, s: number): C => [a[0] * s, a[1] * s];
export const cabs = (a: C) => Math.hypot(a[0], a[1]);
export const carg = (a: C) => Math.atan2(a[1], a[0]);
export function div(a: C, b: C): C {
  const d = b[0] * b[0] + b[1] * b[1];
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
}
export const inv = (a: C): C => div([1, 0], a);
export function cexp(a: C): C {
  const r = Math.exp(a[0]);
  return [r * Math.cos(a[1]), r * Math.sin(a[1])];
}
export function csin(a: C): C {
  return [Math.sin(a[0]) * Math.cosh(a[1]), Math.cos(a[0]) * Math.sinh(a[1])];
}
export function cpowInt(a: C, n: number): C {
  if (n < 0) return inv(cpowInt(a, -n));
  let out: C = [1, 0];
  for (let i = 0; i < n; i++) out = mul(out, a);
  return out;
}
export const fromPolar = (r: number, t: number): C => [r * Math.cos(t), r * Math.sin(t)];

/* ───────── Figure 1: 1/(1 + x²) and its Taylor series ───────── */

export const lorentz = (x: number) => 1 / (1 + x * x);
/** S_N(x) = Σ_{k=0}^{N} (−1)^k x^{2k}. */
export function lorentzTaylor(x: number, N: number): number {
  let s = 0, t = 1;
  for (let k = 0; k <= N; k++) {
    s += t;
    t *= -x * x;
  }
  return s;
}
export const lorentzC = (z: C): C => inv(add([1, 0], mul(z, z)));

/* ───────── Figure 2: the geometric series ───────── */

/** Σ_{k=0}^{n} z^k computed term by term. */
export function geomPartial(z: C, n: number): C {
  let s: C = [0, 0], t: C = [1, 0];
  for (let k = 0; k <= n; k++) {
    s = add(s, t);
    t = mul(t, z);
  }
  return s;
}
/** |S_n(z) − 1/(1 − z)| = |z|^{n+1} / |1 − z|. */
export const geomError = (z: C, n: number) => Math.pow(cabs(z), n + 1) / cabs(sub([1, 0], z));

/* ───────── radius of convergence ───────── */

export interface SeriesRow {
  id: string;
  tex: string;
  /** |a_k|, possibly as a log to avoid overflow. */
  logAbs: (k: number) => number;
  R: number;
  rTex: string;
}

const lnFact = (k: number) => {
  let s = 0;
  for (let i = 2; i <= k; i++) s += Math.log(i);
  return s;
};

export const SERIES: SeriesRow[] = [
  { id: 'geom', tex: '\\sum z^k', logAbs: () => 0, R: 1, rTex: '1' },
  { id: 'half', tex: '\\sum \\frac{z^k}{2^k}', logAbs: (k) => -k * Math.LN2, R: 2, rTex: '2' },
  { id: 'harm', tex: '\\sum \\frac{z^k}{k}', logAbs: (k) => -Math.log(k), R: 1, rTex: '1' },
  { id: 'exp', tex: '\\sum \\frac{z^k}{k!}', logAbs: (k) => -lnFact(k), R: Infinity, rTex: '\\infty' },
  { id: 'fact', tex: '\\sum k!\\, z^k', logAbs: (k) => lnFact(k), R: 0, rTex: '0' },
];

/** Ratio-test estimate |a_k / a_{k+1}| and root-test estimate |a_k|^{−1/k} at a given k. */
export function radiusEstimates(s: SeriesRow, k: number): { ratio: number; root: number } {
  return { ratio: Math.exp(s.logAbs(k) - s.logAbs(k + 1)), root: Math.exp(-s.logAbs(k) / k) };
}

/* ───────── Figure 3: Laurent series of 1/(z(z − 1)) ───────── */

export const laurentF = (z: C): C => inv(mul(z, sub(z, [1, 0])));

/** Exact coefficient c_n in the annulus 0 < |z| < 1 ('inner') or |z| > 1 ('outer'). */
export function laurentExact(n: number, ring: 'inner' | 'outer'): number {
  if (ring === 'inner') return n >= -1 ? -1 : 0;
  return n <= -2 ? 1 : 0;
}

/**
 * c_n = (1 / 2πi) ∮_{|z| = r} f(z) z^{−n−1} dz, by the trapezoid rule with M points on the circle.
 * With z = r e^{iθ}, dz = i z dθ, so c_n = (1 / M) Σ f(z_j) z_j^{−n}.
 */
export function laurentNumeric(f: (z: C) => C, n: number, r: number, M = 256): C {
  let s: C = [0, 0];
  for (let j = 0; j < M; j++) {
    const z = fromPolar(r, (2 * Math.PI * (j + 0.5)) / M);
    s = add(s, mul(f(z), cpowInt(z, -n)));
  }
  return scale(s, 1 / M);
}

/* ───────── Figure 4: three kinds of singularities ───────── */

export type SingId = 'removable' | 'pole' | 'essential';
export const SING: Record<SingId, { name: string; tex: string; f: (z: C) => C }> = {
  removable: { name: '제거 가능', tex: '\\dfrac{\\sin z}{z}', f: (z) => (cabs(z) < 1e-12 ? [1, 0] : div(csin(z), z)) },
  pole: { name: '2차 극', tex: '\\dfrac{1}{z^2}', f: (z) => inv(mul(z, z)) },
  essential: { name: '진성', tex: 'e^{1/z}', f: (z) => cexp(inv(z)) },
};

/** The points z_k = 1 / (ln w + 2πik) where e^{1/z} = w, for |k| ≤ K, with w a positive real. */
export function essentialHits(w: number, K: number): C[] {
  const out: C[] = [];
  for (let k = -K; k <= K; k++) out.push(inv([Math.log(w), 2 * Math.PI * k]));
  return out;
}
/** How many of those points lie within |z| < R (exactly: |ln w + 2πik| > 1/R). */
export function essentialCount(w: number, R: number, K = 100000): number {
  let c = 0;
  for (let k = -K; k <= K; k++) if (Math.hypot(Math.log(w), 2 * Math.PI * k) > 1 / R) c++;
  return c;
}

/** Largest and smallest |f| on the circle |z| = r. */
export function circleRange(f: (z: C) => C, r: number, M = 720): { min: number; max: number } {
  let mn = Infinity, mx = 0;
  for (let j = 0; j < M; j++) {
    const v = cabs(f(fromPolar(r, (2 * Math.PI * j) / M)));
    mn = Math.min(mn, v);
    mx = Math.max(mx, v);
  }
  return { min: mn, max: mx };
}

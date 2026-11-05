/*
 * 미분방정식 · 연립 선형 방정식과 위상 평면: 2×2 linear systems x′ = Ax, their eigenvalues,
 * classification by trace and determinant, the exact matrix exponential, and a few integrators.
 * No imports, so node can run this file directly.
 */

export type V2 = [number, number];
/** A 2×2 matrix as [a, b, c, d] for [[a, b], [c, d]]. */
export type M2 = [number, number, number, number];

export const trace = (A: M2) => A[0] + A[3];
export const det = (A: M2) => A[0] * A[3] - A[1] * A[2];
export const mulV = (A: M2, x: V2): V2 => [A[0] * x[0] + A[1] * x[1], A[2] * x[0] + A[3] * x[1]];

/** Eigenvalues of A. Complex pairs come back as re ± i·im (im ≥ 0). */
export interface Eig {
  real: boolean;
  /** For a real pair, l1 ≤ l2. For a complex pair, both equal the real part. */
  l1: number;
  l2: number;
  im: number;
}

export function eig(A: M2): Eig {
  const t = trace(A), d = det(A);
  const disc = (t * t) / 4 - d;
  if (disc >= 0) {
    const s = Math.sqrt(disc);
    return { real: true, l1: t / 2 - s, l2: t / 2 + s, im: 0 };
  }
  return { real: false, l1: t / 2, l2: t / 2, im: Math.sqrt(-disc) };
}

/** A unit eigenvector for a real eigenvalue λ (null if A − λI is zero, i.e. every direction works). */
export function eigvec(A: M2, l: number): V2 | null {
  // A − λI has rank 1, so a vector perpendicular to its nonzero row spans the null space
  const a = A[0] - l, b = A[1], c = A[2], d = A[3] - l;
  const row1 = Math.hypot(a, b), row2 = Math.hypot(c, d);
  if (row1 < 1e-9 && row2 < 1e-9) return null;
  const v: V2 = row1 >= row2 ? [b, -a] : [d, -c];
  const n = Math.hypot(v[0], v[1]);
  return [v[0] / n, v[1] / n];
}

export type Kind = 'saddle' | 'stable-node' | 'unstable-node' | 'stable-spiral' | 'unstable-spiral' | 'center' | 'stable-degenerate' | 'unstable-degenerate' | 'line';

export const KIND_KO: Record<Kind, string> = {
  saddle: '안장점',
  'stable-node': '안정 마디',
  'unstable-node': '불안정 마디',
  'stable-spiral': '안정 나선',
  'unstable-spiral': '불안정 나선',
  center: '중심',
  'stable-degenerate': '안정 퇴화 마디',
  'unstable-degenerate': '불안정 퇴화 마디',
  line: '평형점의 직선',
};

/** Classify the origin of x′ = Ax from τ = tr A and Δ = det A. `tol` treats near-zero values as zero. */
export function classify(t: number, d: number, tol = 1e-9): Kind {
  if (Math.abs(d) <= tol) return 'line';
  if (d < 0) return 'saddle';
  const disc = t * t - 4 * d;
  if (Math.abs(t) <= tol) return 'center';
  if (Math.abs(disc) <= tol) return t < 0 ? 'stable-degenerate' : 'unstable-degenerate';
  if (disc > 0) return t < 0 ? 'stable-node' : 'unstable-node';
  return t < 0 ? 'stable-spiral' : 'unstable-spiral';
}

/**
 * Exact e^{At} for a 2×2 matrix by Cayley–Hamilton: with m = τ/2 and s² = m² − Δ,
 * e^{At} = e^{mt} [ C(t) I + S(t) (A − mI) ], where C, S are cosh/sinh(st)/s, cos/sin(st)/s, or 1/t.
 */
export function expm(A: M2, t: number): M2 {
  const m = trace(A) / 2;
  const s2 = m * m - det(A);
  let C: number, S: number;
  if (Math.abs(s2) < 1e-14) {
    C = 1;
    S = t;
  } else if (s2 > 0) {
    const s = Math.sqrt(s2);
    C = Math.cosh(s * t);
    S = Math.sinh(s * t) / s;
  } else {
    const s = Math.sqrt(-s2);
    C = Math.cos(s * t);
    S = Math.sin(s * t) / s;
  }
  const e = Math.exp(m * t);
  return [e * (C + S * (A[0] - m)), e * S * A[1], e * S * A[2], e * (C + S * (A[3] - m))];
}

/* ───────── generic integrators for x′ = f(x) in any dimension ───────── */

export type Field = (x: number[]) => number[];

const axpy = (x: number[], a: number, y: number[]) => x.map((v, i) => v + a * y[i]);

export function eulerStep(f: Field, x: number[], h: number): number[] {
  return axpy(x, h, f(x));
}

export function rk4Step(f: Field, x: number[], h: number): number[] {
  const k1 = f(x);
  const k2 = f(axpy(x, h / 2, k1));
  const k3 = f(axpy(x, h / 2, k2));
  const k4 = f(axpy(x, h, k3));
  return x.map((v, i) => v + (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]));
}

/** Integrate from x0 for time T with step h; returns every state including the first. */
export function integrate(f: Field, x0: number[], T: number, h: number, method: 'euler' | 'rk4' = 'rk4'): number[][] {
  const n = Math.max(1, Math.round(Math.abs(T) / h));
  const dt = T / n;
  const step = method === 'rk4' ? rk4Step : eulerStep;
  const out = [x0.slice()];
  let x = x0.slice();
  for (let i = 0; i < n; i++) {
    x = step(f, x, dt);
    out.push(x);
    if (!x.every(Number.isFinite)) break;
  }
  return out;
}

export const linField = (A: M2): Field => (x) => [A[0] * x[0] + A[1] * x[1], A[2] * x[0] + A[3] * x[1]];

/** Trajectories of x′ = Ax through seeds on a circle, run forward and backward and clipped to a box. */
export function portrait(A: M2, R: number, seeds = 12, T = 6, h = 0.02): V2[][] {
  const f = linField(A);
  const lines: V2[][] = [];
  for (let k = 0; k < seeds; k++) {
    const a = (2 * Math.PI * (k + 0.5)) / seeds;
    const x0 = [R * 0.55 * Math.cos(a), R * 0.55 * Math.sin(a)];
    const keep = (pts: number[][]) => {
      const out: V2[] = [];
      for (const p of pts) {
        if (!Number.isFinite(p[0]) || Math.abs(p[0]) > R * 3 || Math.abs(p[1]) > R * 3) break;
        out.push([p[0], p[1]]);
      }
      return out;
    };
    const fwd = keep(integrate(f, x0, T, h));
    const bwd = keep(integrate(f, x0, -T, h));
    lines.push([...bwd.reverse(), ...fwd.slice(1)]);
  }
  return lines;
}

/* ───────── applied model: two tanks in a row ───────── */

/**
 * Fresh water flows into tank 1 at r L/min, tank 1 drains into tank 2, tank 2 drains out.
 * x₁, x₂ are kilograms of salt: x₁′ = −k₁x₁, x₂′ = k₁x₁ − k₂x₂ with kᵢ = r/Vᵢ.
 */
export function tanks(r: number, V1: number, V2: number): M2 {
  const k1 = r / V1, k2 = r / V2;
  return [-k1, 0, k1, -k2];
}

/** Exact salt in tank 2 at time t, and the time of its peak, starting from (x₁, x₂) = (S, 0). */
export function tankPeak(r: number, V1: number, V2: number, S: number): { t: number; x2: number } {
  const k1 = r / V1, k2 = r / V2;
  if (Math.abs(k1 - k2) < 1e-12) {
    const t = 1 / k1;
    return { t, x2: S * k1 * t * Math.exp(-k1 * t) };
  }
  const t = Math.log(k1 / k2) / (k1 - k2);
  return { t, x2: (S * k1 * (Math.exp(-k2 * t) - Math.exp(-k1 * t))) / (k1 - k2) };
}

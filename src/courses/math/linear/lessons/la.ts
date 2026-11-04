/* 선형대수: small dense linear algebra used by the figures. Everything is plain arrays so it is easy to read. */

export type Vec2 = [number, number];
/** 2×2 matrix stored row by row: [a, b, c, d] = [[a, b], [c, d]]. Columns are (a, c) and (b, d). */
export type Mat2 = [number, number, number, number];

export const I2: Mat2 = [1, 0, 0, 1];
export const EPS = 1e-9;

export const ap = (m: Mat2, v: Vec2): Vec2 => [m[0] * v[0] + m[1] * v[1], m[2] * v[0] + m[3] * v[1]];
/** Matrix product A·B (apply B first, then A). */
export const mul = (A: Mat2, B: Mat2): Mat2 => [A[0] * B[0] + A[1] * B[2], A[0] * B[1] + A[1] * B[3], A[2] * B[0] + A[3] * B[2], A[2] * B[1] + A[3] * B[3]];
export const det = (m: Mat2) => m[0] * m[3] - m[1] * m[2];
export const tr = (m: Mat2) => m[0] + m[3];
export const transpose = (m: Mat2): Mat2 => [m[0], m[2], m[1], m[3]];
export const inv = (m: Mat2): Mat2 | null => {
  const d = det(m);
  if (Math.abs(d) < 1e-9) return null;
  return [m[3] / d, -m[1] / d, -m[2] / d, m[0] / d];
};
export const lerpMat = (A: Mat2, B: Mat2, t: number): Mat2 => [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t, A[3] + (B[3] - A[3]) * t];
export const rot = (th: number): Mat2 => [Math.cos(th), -Math.sin(th), Math.sin(th), Math.cos(th)];
export const diag = (a: number, d: number): Mat2 => [a, 0, 0, d];
export const fromCols = (c1: Vec2, c2: Vec2): Mat2 => [c1[0], c2[0], c1[1], c2[1]];
export const col = (m: Mat2, j: 0 | 1): Vec2 => (j === 0 ? [m[0], m[2]] : [m[1], m[3]]);

export const add = (a: Vec2, b: Vec2): Vec2 => [a[0] + b[0], a[1] + b[1]];
export const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
export const scale = (a: Vec2, k: number): Vec2 => [a[0] * k, a[1] * k];
export const dot = (a: Vec2, b: Vec2) => a[0] * b[0] + a[1] * b[1];
export const norm = (a: Vec2) => Math.hypot(a[0], a[1]);
export const cross = (a: Vec2, b: Vec2) => a[0] * b[1] - a[1] * b[0];
export const unit = (a: Vec2): Vec2 => {
  const n = norm(a);
  return n < EPS ? [1, 0] : [a[0] / n, a[1] / n];
};

/** Smooth start and stop for animations, t in [0, 1]. */
export const ease = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

/** Coordinates (c1, c2) with c1·b1 + c2·b2 = p, or null when b1 ∥ b2 (Cramer's rule). */
export function coords(b1: Vec2, b2: Vec2, p: Vec2): Vec2 | null {
  const d = cross(b1, b2);
  if (Math.abs(d) < 1e-9) return null;
  return [cross(p, b2) / d, cross(b1, p) / d];
}

/** Real eigenpairs of a 2×2 matrix, largest |λ| first. Unit eigenvectors. Empty when they are complex. */
export function eig2(m: Mat2): { l: number; v: Vec2 }[] {
  const [a, b, c, d] = m;
  const t = a + d;
  const disc = t * t - 4 * det(m);
  if (disc < -1e-9) return [];
  const s = Math.sqrt(Math.max(0, disc));
  const ls = s < 1e-7 ? [t / 2] : [(t + s) / 2, (t - s) / 2];
  const out: { l: number; v: Vec2 }[] = [];
  for (const l of ls) {
    let v: Vec2;
    const r1: Vec2 = [b, l - a];
    const r2: Vec2 = [l - d, c];
    if (norm(r1) > 1e-7 && norm(r1) >= norm(r2)) v = r1;
    else if (norm(r2) > 1e-7) v = r2;
    else {
      // A = λI: every direction is an eigenvector
      return [
        { l, v: [1, 0] },
        { l, v: [0, 1] },
      ];
    }
    out.push({ l, v: unit(v) });
  }
  out.sort((p, q) => Math.abs(q.l) - Math.abs(p.l));
  return out;
}

export interface Svd2 {
  /** Left singular vectors as columns of U. */
  U: Mat2;
  s: [number, number];
  /** Right singular vectors as columns of V. */
  V: Mat2;
  /** Angle of v1 (V is the rotation by phi). */
  phi: number;
  /** Angle of u1. */
  alpha: number;
  /** det U: −1 when U also flips. */
  flip: 1 | -1;
}

/** SVD of a 2×2 matrix, A = U Σ Vᵀ, with V a pure rotation by phi ∈ (−π/2, π/2] and σ1 ≥ σ2 ≥ 0. */
export function svd2(A: Mat2): Svd2 {
  const [a, b, c, d] = A;
  // AᵀA = [[p, q], [q, r]]; its eigenvectors are the right singular vectors
  const p = a * a + c * c;
  const q = a * b + c * d;
  const r = b * b + d * d;
  let ph = 0.5 * Math.atan2(2 * q, p - r); // direction of the largest eigenvalue of AᵀA
  while (ph > Math.PI / 2) ph -= Math.PI;
  while (ph <= -Math.PI / 2) ph += Math.PI;
  const v1: Vec2 = [Math.cos(ph), Math.sin(ph)];
  const v2: Vec2 = [-v1[1], v1[0]];
  const w1 = ap(A, v1);
  const w2 = ap(A, v2);
  const s1 = norm(w1);
  const s2 = Math.min(s1, norm(w2));
  const u1: Vec2 = s1 > EPS ? scale(w1, 1 / s1) : [1, 0];
  const perp: Vec2 = [-u1[1], u1[0]];
  const flip: 1 | -1 = s2 > 1e-7 && dot(w2, perp) < 0 ? -1 : 1;
  const u2 = scale(perp, flip);
  return { U: fromCols(u1, u2), s: [s1, s2], V: fromCols(v1, v2), phi: ph, alpha: Math.atan2(u1[1], u1[0]), flip };
}

/** Symmetric eigen-decomposition by cyclic Jacobi rotations. S is n×n row-major. Returns eigenvalues (descending) and eigenvectors as columns of V (row-major). */
export function jacobiEig(S: Float64Array, n: number, sweeps = 30): { vals: Float64Array; vecs: Float64Array } {
  const A = Float64Array.from(S);
  const V = new Float64Array(n * n);
  for (let i = 0; i < n; i++) V[i * n + i] = 1;
  for (let sw = 0; sw < sweeps; sw++) {
    let off = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += A[i * n + j] * A[i * n + j];
    if (off < 1e-18) break;
    for (let p = 0; p < n; p++)
      for (let q = p + 1; q < n; q++) {
        const apq = A[p * n + q];
        if (Math.abs(apq) < 1e-15) continue;
        const app = A[p * n + p];
        const aqq = A[q * n + q];
        const theta = (aqq - app) / (2 * apq);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = A[k * n + p];
          const akq = A[k * n + q];
          A[k * n + p] = c * akp - s * akq;
          A[k * n + q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = A[p * n + k];
          const aqk = A[q * n + k];
          A[p * n + k] = c * apk - s * aqk;
          A[q * n + k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = V[k * n + p];
          const vkq = V[k * n + q];
          V[k * n + p] = c * vkp - s * vkq;
          V[k * n + q] = s * vkp + c * vkq;
        }
      }
  }
  const idx = Array.from({ length: n }, (_, i) => i).sort((x, y) => A[y * n + y] - A[x * n + x]);
  const vals = new Float64Array(n);
  const vecs = new Float64Array(n * n);
  idx.forEach((src, dst) => {
    vals[dst] = A[src * n + src];
    for (let k = 0; k < n; k++) vecs[k * n + dst] = V[k * n + src];
  });
  return { vals, vecs };
}

export interface SvdN {
  m: number;
  n: number;
  /** Singular values, descending. */
  s: number[];
  /** u_i as rows: U[i] has length m. */
  U: Float64Array[];
  /** v_i as rows: V[i] has length n. */
  V: Float64Array[];
}

/** SVD of an m×n matrix (row-major) through the eigen-decomposition of AᵀA. Fine for the small images used here. */
export function svdN(A: Float64Array, m: number, n: number): SvdN {
  const G = new Float64Array(n * n);
  for (let i = 0; i < n; i++)
    for (let j = i; j < n; j++) {
      let s = 0;
      for (let k = 0; k < m; k++) s += A[k * n + i] * A[k * n + j];
      G[i * n + j] = s;
      G[j * n + i] = s;
    }
  const { vals, vecs } = jacobiEig(G, n);
  const s: number[] = [];
  const U: Float64Array[] = [];
  const V: Float64Array[] = [];
  for (let r = 0; r < n; r++) {
    const sig = Math.sqrt(Math.max(0, vals[r]));
    const v = new Float64Array(n);
    for (let k = 0; k < n; k++) v[k] = vecs[k * n + r];
    const u = new Float64Array(m);
    if (sig > 1e-9) {
      for (let i = 0; i < m; i++) {
        let acc = 0;
        for (let k = 0; k < n; k++) acc += A[i * n + k] * v[k];
        u[i] = acc / sig;
      }
    }
    s.push(sig);
    U.push(u);
    V.push(v);
  }
  return { m, n, s, U, V };
}

/** Σ_{i<k} σ_i u_i v_iᵀ, row-major. */
export function lowRank(d: SvdN, k: number): Float64Array {
  const out = new Float64Array(d.m * d.n);
  for (let r = 0; r < Math.min(k, d.s.length); r++) {
    const sg = d.s[r];
    if (sg < 1e-12) continue;
    const u = d.U[r];
    const v = d.V[r];
    for (let i = 0; i < d.m; i++) {
      const a = sg * u[i];
      for (let j = 0; j < d.n; j++) out[i * d.n + j] += a * v[j];
    }
  }
  return out;
}

/* ───────── number formatting for TeX and readouts ───────── */

/** Number for TeX: fixed decimals, trailing zeros removed, ASCII minus, no "-0". */
export function tn(v: number, d = 2): string {
  if (!isFinite(v)) return v > 0 ? '\\infty' : '-\\infty';
  let s = v.toFixed(d);
  if (s.includes('.')) s = s.replace(/0+$/, '').replace(/\.$/, '');
  if (s === '-0') s = '0';
  return s;
}

/** Number for HTML readouts: like tn but with a real minus sign. */
export function nf(v: number, d = 2): string {
  return tn(v, d).replace('-', '−').replace('\\infty', '∞');
}

/** A 2×2 matrix in TeX. `c1`, `c2` colour the two columns. */
export function texM2(m: Mat2, d = 2, c1?: string, c2?: string): string {
  const w = (v: number, c?: string) => (c ? `\\textcolor{${c}}{${tn(v, d)}}` : tn(v, d));
  return `\\begin{pmatrix} ${w(m[0], c1)} & ${w(m[1], c2)} \\\\ ${w(m[2], c1)} & ${w(m[3], c2)} \\end{pmatrix}`;
}

export function texV2(v: Vec2, d = 2, c?: string): string {
  const w = (x: number) => (c ? `\\textcolor{${c}}{${tn(x, d)}}` : tn(x, d));
  return `\\begin{pmatrix} ${w(v[0])} \\\\ ${w(v[1])} \\end{pmatrix}`;
}

/** Round to `sig` significant digits: a stand-in for a computer with very few digits of precision. */
export function roundSig(v: number, sig: number): number {
  if (v === 0 || !isFinite(v)) return v;
  const e = Math.floor(Math.log10(Math.abs(v)));
  const f = Math.pow(10, sig - 1 - e);
  return Math.round(v * f) / f;
}

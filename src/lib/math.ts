/** Deterministic PRNG (mulberry32) so figures look the same on every load. */
export function rng(seed = 1): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Standard normal sample via Box–Muller. */
export function gauss(r: () => number): number {
  let u = 0;
  while (u === 0) u = r();
  const v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));
export const relu = (z: number) => Math.max(0, z);

export function softmax(xs: number[], temperature = 1): number[] {
  const t = Math.max(1e-6, temperature);
  const m = Math.max(...xs.map((x) => x / t));
  const e = xs.map((x) => Math.exp(x / t - m));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map((v) => v / s);
}

export function normalPdf(x: number, mu = 0, sigma = 1): number {
  const z = (x - mu) / sigma;
  return Math.exp(-0.5 * z * z) / (sigma * Math.sqrt(2 * Math.PI));
}

/** Error function (Abramowitz–Stegun 7.1.26). */
export function erf(x: number): number {
  const s = Math.sign(x);
  x = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * x);
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return s * y;
}
export function normalCdf(x: number, mu = 0, sigma = 1): number {
  return 0.5 * (1 + erf((x - mu) / (sigma * Math.SQRT2)));
}

export type Vec2 = [number, number];
export const dot2 = (a: Vec2, b: Vec2) => a[0] * b[0] + a[1] * b[1];
export const len2 = (a: Vec2) => Math.hypot(a[0], a[1]);

export interface Pt {
  x: number;
  y: number;
  label: number; // 0 or 1 (or cluster id)
}

export type DatasetName = 'blobs' | 'circle' | 'xor' | 'spiral' | 'moons';

/** Classic 2D toy datasets in roughly [-1,1]^2 (spiral slightly larger). */
export function makeDataset(name: DatasetName, n = 200, noise = 0.1, seed = 7): Pt[] {
  const r = rng(seed);
  const pts: Pt[] = [];
  const nz = () => gauss(r) * noise;
  for (let i = 0; i < n; i++) {
    const label = i % 2;
    let x = 0;
    let y = 0;
    switch (name) {
      case 'blobs': {
        const c = label ? [0.45, 0.4] : [-0.45, -0.35];
        x = c[0] + gauss(r) * (0.22 + noise);
        y = c[1] + gauss(r) * (0.22 + noise);
        break;
      }
      case 'circle': {
        const rad = label ? r() * 0.38 : 0.6 + r() * 0.3;
        const a = r() * Math.PI * 2;
        x = Math.cos(a) * rad + nz();
        y = Math.sin(a) * rad + nz();
        break;
      }
      case 'xor': {
        x = (r() * 2 - 1) * 0.95;
        y = (r() * 2 - 1) * 0.95;
        const pad = 0.06;
        x += x > 0 ? pad : -pad;
        y += y > 0 ? pad : -pad;
        x += nz() * 0.5;
        y += nz() * 0.5;
        pts.push({ x, y, label: x * y > 0 ? 1 : 0 });
        continue;
      }
      case 'spiral': {
        const t = (Math.floor(i / 2) / (n / 2)) * 1.0;
        const rad = 0.08 + t * 0.85;
        const a = t * 3.2 * Math.PI + label * Math.PI;
        x = Math.cos(a) * rad + nz() * 0.6;
        y = Math.sin(a) * rad + nz() * 0.6;
        break;
      }
      case 'moons': {
        const a = r() * Math.PI;
        if (label) {
          x = 1 - Math.cos(a) - 0.5;
          y = 0.5 - Math.sin(a) - 0.1;
        } else {
          x = Math.cos(a) - 0.5;
          y = Math.sin(a) - 0.25;
        }
        x = x * 0.62 + nz();
        y = y * 0.62 + 0.08 + nz();
        break;
      }
    }
    pts.push({ x, y, label });
  }
  return pts;
}

/** Solve a small dense linear system Ax=b (Gaussian elimination, partial pivoting). */
export function solve(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let piv = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
    if (Math.abs(M[piv][c]) < 1e-12) return null;
    [M[c], M[piv]] = [M[piv], M[c]];
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

/** Least-squares polynomial fit of degree d with optional L2 penalty λ. Returns coefficients c0..cd. */
export function polyFit(xs: number[], ys: number[], d: number, lambda = 0): number[] {
  const m = d + 1;
  const A: number[][] = Array.from({ length: m }, () => new Array(m).fill(0));
  const b = new Array(m).fill(0);
  for (let i = 0; i < xs.length; i++) {
    const pw = [1];
    for (let k = 1; k < m; k++) pw.push(pw[k - 1] * xs[i]);
    for (let r = 0; r < m; r++) {
      b[r] += pw[r] * ys[i];
      for (let c = 0; c < m; c++) A[r][c] += pw[r] * pw[c];
    }
  }
  for (let k = 1; k < m; k++) A[k][k] += lambda + 1e-10;
  A[0][0] += 1e-10;
  return solve(A, b) ?? new Array(m).fill(0);
}

export function polyEval(c: number[], x: number): number {
  let y = 0;
  for (let k = c.length - 1; k >= 0; k--) y = y * x + c[k];
  return y;
}

/* ───────── Statistics helpers ───────── */

export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

/** Variance; `sample` divides by n−1 instead of n. */
export function variance(xs: number[], sample = false): number {
  const n = xs.length;
  if (n < (sample ? 2 : 1)) return NaN;
  const m = mean(xs);
  return xs.reduce((s, x) => s + (x - m) ** 2, 0) / (sample ? n - 1 : n);
}

/** q-quantile of already-sorted values, linear interpolation between order statistics. */
export function quantileSorted(sorted: number[], q: number): number {
  if (!sorted.length) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Inverse of the standard normal CDF (Acklam's rational approximation, |error| < 1.2e-9). */
export function normalInv(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  if (p < pl) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p > 1 - pl) return -normalInv(1 - p);
  const q = p - 0.5;
  const r = q * q;
  return ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/** Quantile of Student's t with `df` degrees of freedom (Cornish–Fisher expansion; within ~0.3% for df ≥ 3). */
export function tInv(p: number, df: number): number {
  const z = normalInv(p);
  const z3 = z ** 3;
  const z5 = z ** 5;
  const z7 = z ** 7;
  const z9 = z ** 9;
  return (
    z +
    (z3 + z) / (4 * df) +
    (5 * z5 + 16 * z3 + 3 * z) / (96 * df ** 2) +
    (3 * z7 + 19 * z5 + 17 * z3 - 15 * z) / (384 * df ** 3) +
    (79 * z9 + 776 * z7 + 1482 * z5 - 1920 * z3 - 945 * z) / (92160 * df ** 4)
  );
}

/** P(X = k) for k = 0..n, X ~ Binomial(n, p), computed in log space so n can be large. */
export function binomialPmf(n: number, p: number): number[] {
  const logFact = [0];
  for (let i = 1; i <= n; i++) logFact.push(logFact[i - 1] + Math.log(i));
  const lp = Math.log(p);
  const lq = Math.log(1 - p);
  return Array.from({ length: n + 1 }, (_, k) => {
    if (p <= 0) return k === 0 ? 1 : 0;
    if (p >= 1) return k === n ? 1 : 0;
    return Math.exp(logFact[n] - logFact[k] - logFact[n - k] + k * lp + (n - k) * lq);
  });
}

/** Two-sided p-value of k heads in n fair flips: P(|X − n/2| ≥ |k − n/2|). */
export function binomialTwoSidedP(n: number, k: number, p0 = 0.5): number {
  const pmf = binomialPmf(n, p0);
  const d = Math.abs(k - n * p0);
  let s = 0;
  for (let i = 0; i <= n; i++) if (Math.abs(i - n * p0) >= d - 1e-9) s += pmf[i];
  return Math.min(1, s);
}

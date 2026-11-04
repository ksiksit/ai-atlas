/* 확률과 컴퓨팅: small numeric helpers shared by the lessons. Everything random takes a seeded `r`. */
import { gauss, rng } from '../../../../lib/math';

export { gauss, rng };

/** ln(k!) for k = 0..n. */
export function logFactorials(n: number): number[] {
  const out = [0];
  for (let i = 1; i <= n; i++) out.push(out[i - 1] + Math.log(i));
  return out;
}

/** P(X = k), k = 0..kmax, X ~ Poisson(λ). */
export function poissonPmf(lam: number, kmax: number): number[] {
  const out: number[] = [];
  let p = Math.exp(-lam);
  for (let k = 0; k <= kmax; k++) {
    out.push(p);
    p = (p * lam) / (k + 1);
  }
  return out;
}

/** P(X = k), k = 0..kmax (index 0 is always 0), X ~ Geometric(p) counting trials up to the first success. */
export function geomPmf(p: number, kmax: number): number[] {
  return Array.from({ length: kmax + 1 }, (_, k) => (k === 0 ? 0 : Math.pow(1 - p, k - 1) * p));
}

export function sampleBernoulli(r: () => number, p: number): number {
  return r() < p ? 1 : 0;
}
export function sampleBinom(r: () => number, n: number, p: number): number {
  let s = 0;
  for (let i = 0; i < n; i++) if (r() < p) s++;
  return s;
}
/** Trials up to and including the first success. */
export function sampleGeom(r: () => number, p: number): number {
  if (p >= 1) return 1;
  return Math.max(1, Math.ceil(Math.log(1 - r()) / Math.log(1 - p)));
}
/** Knuth's method: multiply uniforms until the product drops below e^{-λ}. */
export function samplePoisson(r: () => number, lam: number): number {
  const L = Math.exp(-lam);
  let k = 0;
  let p = r();
  while (p > L) {
    k++;
    p *= r();
  }
  return k;
}
/** Inverse transform: −ln(1 − U) / λ. */
export function sampleExp(r: () => number, lam: number): number {
  return -Math.log(1 - r()) / lam;
}
export function sampleNormal(r: () => number, mu: number, sigma: number): number {
  return mu + sigma * gauss(r);
}

export function harmonic(n: number): number {
  let h = 0;
  for (let i = 1; i <= n; i++) h += 1 / i;
  return h;
}

/** Fisher–Yates shuffle in place. */
export function shuffleInPlace<T>(a: T[], r: () => number): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Percent with d decimals, e.g. 0.1234 → "12.3%". */
export function pct(v: number, d = 1): string {
  if (!isFinite(v)) return '–';
  return (v * 100).toFixed(d) + '%';
}

/** A probability that may be tiny: "0.031", "2.4 × 10⁻⁷". */
export function prob(v: number, d = 3): string {
  if (!isFinite(v)) return '–';
  if (v === 0) return '0';
  if (v >= 0.001) return v.toFixed(d);
  const e = Math.floor(Math.log10(v));
  const m = v / Math.pow(10, e);
  return `${m.toFixed(1)} × 10${sup(e)}`;
}

const SUP: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' };
export const sup = (n: number) =>
  String(n)
    .split('')
    .map((c) => SUP[c] ?? c)
    .join('');

/** Greatest common divisor, for showing fractions like 6/36 = 1/6. */
export const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : Math.abs(a));
export function frac(num: number, den: number): string {
  if (den === 0) return '–';
  const g = gcd(num, den) || 1;
  return `${num / g}/${den / g}`;
}

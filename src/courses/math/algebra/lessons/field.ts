/*
 * 현대대수학 · 환과 체: integers mod n, polynomials over GF(p), and finite fields GF(p^k).
 * No imports, so node can run it directly.
 *
 * Polynomials are coefficient arrays from the constant term up: [1, 1, 0, 1] is 1 + x + x³.
 * An element of GF(p^k) is stored as an integer whose base-p digits are its coefficients,
 * so in GF(2^k) the element x² + 1 is 0b101 = 5.
 */

export type Poly = number[];

export const mod = (a: number, n: number) => ((a % n) + n) % n;

export function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

/** Bézout coefficients: a·s + b·t = g = gcd(a, b). */
export function egcd(a: number, b: number): { g: number; s: number; t: number } {
  let [r0, r1, s0, s1, t0, t1] = [a, b, 1, 0, 0, 1];
  while (r1 !== 0) {
    const q = Math.floor(r0 / r1);
    [r0, r1] = [r1, r0 - q * r1];
    [s0, s1] = [s1, s0 - q * s1];
    [t0, t1] = [t1, t0 - q * t1];
  }
  return { g: r0, s: s0, t: t0 };
}

/** Inverse of a mod n, or null if gcd(a, n) ≠ 1. */
export function invMod(a: number, n: number): number | null {
  const { g, s } = egcd(mod(a, n), n);
  return g === 1 ? mod(s, n) : null;
}

export const isPrime = (n: number) => {
  if (n < 2) return false;
  for (let d = 2; d * d <= n; d++) if (n % d === 0) return false;
  return true;
};

/* ───────── ℤ/n ───────── */

export interface ZnInfo {
  n: number;
  table: number[][];
  /** Elements with a multiplicative inverse. */
  units: number[];
  /** Nonzero a with a·b ≡ 0 for some nonzero b. */
  zeroDivisors: number[];
  isField: boolean;
}

export function zn(n: number): ZnInfo {
  const table = Array.from({ length: n }, (_, a) => Array.from({ length: n }, (_, b) => (a * b) % n));
  const units: number[] = [];
  const zeroDivisors: number[] = [];
  for (let a = 1; a < n; a++) {
    if (table[a].includes(1)) units.push(a);
    if (table[a].some((v, b) => b !== 0 && v === 0)) zeroDivisors.push(a);
  }
  return { n, table, units, zeroDivisors, isField: n > 1 && units.length === n - 1 };
}

/* ───────── polynomials over GF(p) ───────── */

export function trim(a: Poly): Poly {
  const r = a.slice();
  while (r.length > 1 && r[r.length - 1] === 0) r.pop();
  return r.length ? r : [0];
}

export const deg = (a: Poly) => {
  const t = trim(a);
  return t.length === 1 && t[0] === 0 ? -Infinity : t.length - 1;
};

export const isZero = (a: Poly) => deg(a) === -Infinity;

export function pAdd(a: Poly, b: Poly, p: number): Poly {
  const n = Math.max(a.length, b.length);
  return trim(Array.from({ length: n }, (_, i) => mod((a[i] ?? 0) + (b[i] ?? 0), p)));
}

export function pSub(a: Poly, b: Poly, p: number): Poly {
  const n = Math.max(a.length, b.length);
  return trim(Array.from({ length: n }, (_, i) => mod((a[i] ?? 0) - (b[i] ?? 0), p)));
}

export function pMul(a: Poly, b: Poly, p: number): Poly {
  if (isZero(a) || isZero(b)) return [0];
  const r = new Array(a.length + b.length - 1).fill(0);
  for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) r[i + j] = mod(r[i + j] + a[i] * b[j], p);
  return trim(r);
}

/** One step of long division: subtract (coef · x^shift) · divisor from the remainder. */
export interface DivStep {
  /** The term added to the quotient in this step, as [coefficient, power]. */
  term: [number, number];
  /** term · divisor, the thing subtracted. */
  subtracted: Poly;
  /** Remainder after this step. */
  remainder: Poly;
  /** Quotient so far. */
  quotient: Poly;
}

/** Long division a = q·b + r over GF(p), with every step recorded for a stepper. */
export function pDivSteps(a: Poly, b: Poly, p: number): { q: Poly; r: Poly; steps: DivStep[] } {
  const B = trim(b);
  const db = deg(B);
  if (db === -Infinity) throw new Error('division by zero polynomial');
  const lcInv = invMod(B[db], p)!;
  let r = trim(a);
  let q: Poly = [0];
  const steps: DivStep[] = [];
  while (deg(r) >= db) {
    const dr = deg(r);
    const c = mod(r[dr] * lcInv, p);
    const shift = dr - db;
    const mono: Poly = new Array(shift + 1).fill(0);
    mono[shift] = c;
    const sub = pMul(mono, B, p);
    r = pSub(r, sub, p);
    q = pAdd(q, mono, p);
    steps.push({ term: [c, shift], subtracted: sub, remainder: r, quotient: q });
  }
  return { q, r, steps };
}

export const pMod = (a: Poly, b: Poly, p: number) => pDivSteps(a, b, p).r;

/** All monic polynomials of exact degree d over GF(p). */
export function monics(d: number, p: number): Poly[] {
  const out: Poly[] = [];
  const total = Math.pow(p, d);
  for (let k = 0; k < total; k++) {
    const c: number[] = [];
    let v = k;
    for (let i = 0; i < d; i++) {
      c.push(v % p);
      v = Math.floor(v / p);
    }
    c.push(1);
    out.push(c);
  }
  return out;
}

/**
 * Is f irreducible over GF(p)? Tries every monic polynomial of degree 1..deg(f)/2 as a divisor
 * and returns the first factor found (with its cofactor), or null when there is none.
 */
export function findFactor(f: Poly, p: number): { factor: Poly; cofactor: Poly; tried: number } | null {
  const d = deg(f);
  let tried = 0;
  for (let k = 1; k <= Math.floor(d / 2); k++)
    for (const g of monics(k, p)) {
      tried++;
      const { q, r } = pDivSteps(f, g, p);
      if (isZero(r)) return { factor: g, cofactor: q, tried };
    }
  return null;
}

export function countTried(f: Poly, p: number): number {
  let n = 0;
  for (let k = 1; k <= Math.floor(deg(f) / 2); k++) n += Math.pow(p, k);
  return n;
}

const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const sup = (n: number) => String(n).split('').map((d) => SUP[+d]).join('');

/** "x³ + x + 1"; over GF(p) with p > 2 coefficients are shown ("2x² + 4"). */
export function polyStr(a: Poly, v = 'x'): string {
  const t = trim(a);
  if (isZero(t)) return '0';
  const parts: string[] = [];
  for (let i = t.length - 1; i >= 0; i--) {
    const c = t[i];
    if (!c) continue;
    const mono = i === 0 ? '' : i === 1 ? v : v + sup(i);
    parts.push(i === 0 ? String(c) : (c === 1 ? '' : String(c)) + mono);
  }
  return parts.join(' + ');
}

/* ───────── GF(p^k) ───────── */

export interface GF {
  p: number;
  k: number;
  /** Size p^k. */
  q: number;
  modulus: Poly;
  /** Element (as integer) → coefficient list of length k. */
  coeffs: (e: number) => Poly;
  fromCoeffs: (c: Poly) => number;
  add: (a: number, b: number) => number;
  mul: (a: number, b: number) => number;
  /** Is the modulus irreducible, so that this really is a field? */
  irreducible: boolean;
  factor: { factor: Poly; cofactor: Poly } | null;
  label: (e: number) => string;
}

export function makeGF(p: number, modulus: Poly): GF {
  const m = trim(modulus);
  const k = deg(m);
  const q = Math.pow(p, k);
  const coeffs = (e: number): Poly => {
    const c: number[] = [];
    for (let i = 0; i < k; i++) {
      c.push(e % p);
      e = Math.floor(e / p);
    }
    return c;
  };
  const fromCoeffs = (c: Poly): number => {
    let e = 0;
    for (let i = Math.min(c.length, k) - 1; i >= 0; i--) e = e * p + mod(c[i] ?? 0, p);
    return e;
  };
  const mulTable: number[] = new Array(q * q);
  for (let a = 0; a < q; a++)
    for (let b = 0; b < q; b++) mulTable[a * q + b] = fromCoeffs(pMod(pMul(coeffs(a), coeffs(b), p), m, p));
  const f = findFactor(m, p);
  return {
    p,
    k,
    q,
    modulus: m,
    coeffs,
    fromCoeffs,
    add: (a, b) => fromCoeffs(pAdd(coeffs(a), coeffs(b), p)),
    mul: (a, b) => mulTable[a * q + b],
    irreducible: f === null,
    factor: f,
    label: (e) => polyStr(coeffs(e)),
  };
}

/** Powers g, g², … until they return to 1 (or repeat without reaching 1, for a non-unit). */
export function powers(F: GF, g: number): { seq: number[]; order: number | null } {
  const seq: number[] = [];
  let x = g;
  const seen = new Set<number>();
  for (let i = 1; i <= F.q; i++) {
    seq.push(x);
    if (x === 1) return { seq, order: i };
    if (seen.has(x)) return { seq, order: null };
    seen.add(x);
    x = F.mul(x, g);
  }
  return { seq, order: null };
}

/** Elements whose powers reach every nonzero element (only possible in a field). */
export function primitives(F: GF): number[] {
  const out: number[] = [];
  for (let g = 1; g < F.q; g++) if (powers(F, g).order === F.q - 1) out.push(g);
  return out;
}

/** Nonzero a with a·b = 0 for some nonzero b. */
export function zeroDivisorsGF(F: GF): number[] {
  const out: number[] = [];
  for (let a = 1; a < F.q; a++)
    for (let b = 1; b < F.q; b++)
      if (F.mul(a, b) === 0) {
        out.push(a);
        break;
      }
  return out;
}

export function unitsGF(F: GF): number[] {
  const out: number[] = [];
  for (let a = 1; a < F.q; a++)
    for (let b = 1; b < F.q; b++)
      if (F.mul(a, b) === 1) {
        out.push(a);
        break;
      }
  return out;
}

/** Bits of an element of GF(2^k), high coefficient first, e.g. 0b011 → "011". */
export const bits = (e: number, k: number) => e.toString(2).padStart(k, '0');

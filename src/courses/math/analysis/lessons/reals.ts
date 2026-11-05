/*
 * 해석학 · 실수와 완비성: pure logic for the figures. No imports, so node can run it.
 */

/* ───────── Figure 1: rational upper bounds of {q : q² < 2} that keep getting smaller ───────── */

export interface Frac {
  p: number;
  q: number;
}

export const fv = (f: Frac) => f.p / f.q;
export const fstr = (f: Frac) => (f.q === 1 ? String(f.p) : `${f.p}/${f.q}`);

function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}
const red = (p: number, q: number): Frac => {
  const g = gcd(p, q);
  return { p: p / g, q: q / g };
};

/**
 * Given a rational upper bound u = p/q with u² > 2, the rational (u + 2/u)/2 = (p² + 2q²)/(2pq)
 * is a strictly smaller upper bound (its square is still more than 2), and 2/u is a lower bound.
 * Starting from 2 this is Newton's method for √2.
 */
export function shrinkBound(u: Frac): Frac {
  return red(u.p * u.p + 2 * u.q * u.q, 2 * u.p * u.q);
}

export interface BoundStep {
  upper: Frac;
  lower: Frac;
  /** upper² − 2 as an exact fraction: (p² − 2q²)/q². For these bounds the numerator is always 1 or 2. */
  excess: Frac;
}

/** The first `n` upper bounds 2, 3/2, 17/12, 577/408, … with their matching lower bounds 2/u. */
export function boundSteps(n = 5): BoundStep[] {
  const out: BoundStep[] = [];
  let u: Frac = { p: 2, q: 1 };
  for (let k = 0; k < n; k++) {
    out.push({ upper: u, lower: red(2 * u.q, u.p), excess: { p: u.p * u.p - 2 * u.q * u.q, q: u.q * u.q } });
    if (u.p * u.p > 9e15 / 4) break;
    u = shrinkBound(u);
  }
  return out;
}

/* ───────── Figure 2: is b an upper bound, and is it the least? ───────── */

export type SetId = 'finite' | 'open' | 'oneMinus' | 'sqrtR' | 'sqrtQ';

export interface SetInfo {
  id: SetId;
  label: string;
  tex: string;
  /** Where the supremum is, or null when it does not exist in the number system of the set. */
  sup: number | null;
  /** The supremum's value even when it is missing from ℚ (for drawing the hole). */
  supValue: number;
  /** Whether the supremum belongs to the set. */
  supIn: boolean;
  /** Points drawn on the number line (a finite sample for infinite sets). */
  points: number[];
  /** Points that are an interval, drawn as a bar. */
  interval?: [number, number];
  rationalOnly: boolean;
}

const oneMinus = Array.from({ length: 40 }, (_, k) => 1 - 1 / (k + 1));

export const SETS: SetInfo[] = [
  { id: 'finite', label: '유한집합 {0.3, 0.5, 0.8, 1.1}', tex: '\\{0.3,\\ 0.5,\\ 0.8,\\ 1.1\\}', sup: 1.1, supValue: 1.1, supIn: true, points: [0.3, 0.5, 0.8, 1.1], rationalOnly: false },
  { id: 'open', label: '열린구간 (0, 1)', tex: '(0, 1) = \\{x : 0 < x < 1\\}', sup: 1, supValue: 1, supIn: false, points: [], interval: [0, 1], rationalOnly: false },
  { id: 'oneMinus', label: '{1 − 1/n : n = 1, 2, 3, …}', tex: '\\{1 - 1/n : n \\in \\mathbb{N}\\}', sup: 1, supValue: 1, supIn: false, points: oneMinus, rationalOnly: false },
  { id: 'sqrtR', label: '실수에서 {x : x² < 2}', tex: '\\{x \\in \\mathbb{R} : x^2 < 2\\}', sup: Math.SQRT2, supValue: Math.SQRT2, supIn: false, points: [], interval: [-Math.SQRT2, Math.SQRT2], rationalOnly: false },
  { id: 'sqrtQ', label: '유리수에서 {q : q² < 2}', tex: '\\{q \\in \\mathbb{Q} : q^2 < 2\\}', sup: null, supValue: Math.SQRT2, supIn: false, points: [], interval: [-Math.SQRT2, Math.SQRT2], rationalOnly: true },
];

export interface BoundVerdict {
  isUpper: boolean;
  isLeast: boolean;
  /** When b is not an upper bound: an element of the set larger than b. */
  witness: number | null;
  /** When b is an upper bound but not least: a smaller upper bound (rational in the ℚ case). */
  smaller: number | null;
}

const EPS = 1e-9;

/**
 * Check a candidate b against a set. For {1 − 1/n} the witness is the first term above b;
 * for the open sets it is the midpoint between b and the supremum.
 */
export function judge(s: SetInfo, b: number): BoundVerdict {
  const supV = s.supValue;
  if (s.id === 'finite') {
    const bigger = s.points.filter((x) => x > b + EPS);
    if (bigger.length) return { isUpper: false, isLeast: false, witness: Math.min(...bigger), smaller: null };
    const least = Math.abs(b - supV) < EPS;
    return { isUpper: true, isLeast: least, witness: null, smaller: least ? null : supV };
  }
  if (s.id === 'oneMinus') {
    if (b < 1 - EPS) {
      // smallest n with 1 − 1/n > b, i.e. n > 1/(1 − b)
      const n = Math.floor(1 / (1 - b)) + 1;
      return { isUpper: false, isLeast: false, witness: 1 - 1 / n, smaller: null };
    }
    const least = Math.abs(b - 1) < EPS;
    return { isUpper: true, isLeast: least, witness: null, smaller: least ? null : 1 };
  }
  // open interval and the √2 sets: elements fill everything below supV.
  // For the √2 sets the witness is a rational strictly between b and √2 (it is in both sets).
  if (b < supV - EPS) return { isUpper: false, isLeast: false, witness: s.id === 'open' ? (b + supV) / 2 : rationalBetween(b, supV).r, smaller: null };
  if (s.rationalOnly) {
    // every rational upper bound has a smaller rational one: (b + 2/b)/2 for b = √2 is impossible, since b is rational
    return { isUpper: true, isLeast: false, witness: null, smaller: (b + 2 / b) / 2 };
  }
  const least = Math.abs(b - supV) < 1e-6;
  return { isUpper: true, isLeast: least, witness: null, smaller: least ? null : supV };
}

/* ───────── Figure 3: a rational between any two reals ───────── */

export interface Between {
  n: number;
  m: number;
  /** m/n as a number. */
  r: number;
}

/**
 * The proof of density: pick n with 1/n < b − a (the Archimedean property), then m = ⌊na⌋ + 1.
 * Then na < m ≤ na + 1 < nb, so a < m/n < b.
 */
export function rationalBetween(a: number, b: number): Between {
  let n = Math.floor(1 / (b - a)) + 1;
  let m = Math.floor(n * a) + 1;
  // floating-point a and b can make n(b − a) land on exactly 1; one more step restores the strict gap
  while (m / n >= b) {
    n++;
    m = Math.floor(n * a) + 1;
  }
  return { n, m, r: m / n };
}

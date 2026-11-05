/*
 * 해석학 · 수열의 수렴: pure logic for the figures. No imports, so node can run it.
 */

/* ───────── Figure 1: the ε-N game ───────── */

export type SeqId = 'inv' | 'alt' | 'ratio' | 'euler' | 'sign';

export interface SeqInfo {
  id: SeqId;
  label: string;
  tex: string;
  a: (n: number) => number;
  /** The limit, or null when the sequence has none. */
  L: number | null;
  /** Default L the reader starts from (for the divergent one too). */
  L0: number;
  yMin: number;
  yMax: number;
}

export const SEQS: SeqInfo[] = [
  { id: 'inv', label: '1/n', tex: 'a_n = \\frac{1}{n}', a: (n) => 1 / n, L: 0, L0: 0, yMin: -0.15, yMax: 1.05 },
  { id: 'alt', label: '(−1)ⁿ/n', tex: 'a_n = \\frac{(-1)^n}{n}', a: (n) => (n % 2 ? -1 : 1) / n, L: 0, L0: 0, yMin: -1.05, yMax: 0.6 },
  { id: 'ratio', label: 'n/(n+1)', tex: 'a_n = \\frac{n}{n+1}', a: (n) => n / (n + 1), L: 1, L0: 1, yMin: 0.45, yMax: 1.1 },
  { id: 'euler', label: '(1 + 1/n)ⁿ', tex: 'a_n = \\left(1 + \\frac{1}{n}\\right)^n', a: (n) => Math.pow(1 + 1 / n, n), L: Math.E, L0: Math.E, yMin: 1.9, yMax: 2.85 },
  { id: 'sign', label: '(−1)ⁿ', tex: 'a_n = (-1)^n', a: (n) => (n % 2 ? -1 : 1), L: null, L0: 0, yMin: -1.6, yMax: 1.6 },
];

/** How far we look for a counterexample. Every sequence here is monotone in |a_n − L| on each parity, so this is exact. */
export const N_CHECK = 200000;

export interface EpsN {
  /** Smallest N with |a_n − L| < ε for every n ≥ N (checked up to N_CHECK), or null if none. */
  N: number | null;
  /** The last n that breaks the band, or null when none does. */
  lastBad: number | null;
  /** How many of the first `upTo` terms break the band. */
  badCount: number;
}

export function epsN(s: SeqInfo, L: number, eps: number, upTo = N_CHECK): EpsN {
  let lastBad: number | null = null;
  let badCount = 0;
  for (let n = 1; n <= upTo; n++) {
    if (!(Math.abs(s.a(n) - L) < eps)) {
      lastBad = n;
      badCount++;
    }
  }
  // a break near the end of the search means it keeps breaking: no N works
  if (lastBad !== null && lastBad > upTo - 10) return { N: null, lastBad, badCount };
  return { N: lastBad === null ? 1 : lastBad + 1, lastBad, badCount };
}

/* ───────── Figure 2: monotone and bounded, so it converges ───────── */

export interface Newton {
  n: number;
  x: number;
  /** The fraction p/q while it fits in a double exactly. */
  frac: string | null;
  /** x_n − √2. */
  gap: number;
}

/** x₁ = 2, x_{n+1} = (x_n + 2/x_n)/2, kept as exact fractions while they fit. */
export function newtonSqrt2(steps = 6): Newton[] {
  const out: Newton[] = [];
  let p = 2, q = 1;
  for (let n = 1; n <= steps; n++) {
    const exact = p < 2 ** 53 && q < 2 ** 53;
    out.push({ n, x: p / q, frac: exact ? (q === 1 ? String(p) : `${p}/${q}`) : null, gap: p / q - Math.SQRT2 });
    // (p/q + 2q/p)/2 = (p² + 2q²)/(2pq); the result is already in lowest terms for this sequence
    const np = p * p + 2 * q * q, nq = 2 * p * q;
    p = np;
    q = nq;
    const g = gcdN(p, q);
    p /= g;
    q /= g;
  }
  return out;
}

function gcdN(a: number, b: number): number {
  while (b) [a, b] = [b, a % b];
  return a;
}

/* ───────── Figure 3: Bolzano–Weierstrass by halving ───────── */

export type Half = 'lower' | 'upper';

export interface Halving {
  k: number;
  lo: number;
  hi: number;
  /** The index chosen for the subsequence at this step (strictly increasing), and its term. */
  nk: number;
  term: number;
  /** How many of the first `sample` terms fell in each half of the previous interval. */
  lowerCount: number;
  upperCount: number;
  chose: Half | null;
}

/** Up/down/up/down…: the kept intervals close in on 1/3. */
export const DEFAULT_HALVES: Half[] = Array.from({ length: 12 }, (_, k) => (k % 2 ? 'lower' : 'upper'));

/**
 * Start with [−1, 1], which holds every sin(n). At each step split the interval in half and keep a half that
 * holds infinitely many terms. For sin(n) every subinterval does (its values are dense in [−1, 1]), so the
 * reader may keep either half; the counts over the first `sample` terms show both halves keep filling up.
 * Then take the next index n_k > n_{k−1} whose term lies in the kept half.
 */
export function bolzano(choices: Half[], sample = 20000, a: (n: number) => number = Math.sin): Halving[] {
  let lo = -1, hi = 1;
  let nk = 1;
  const out: Halving[] = [{ k: 0, lo, hi, nk, term: a(nk), lowerCount: 0, upperCount: 0, chose: null }];
  choices.forEach((chose, idx) => {
    const mid = (lo + hi) / 2;
    let lc = 0, uc = 0;
    for (let n = 1; n <= sample; n++) {
      const v = a(n);
      if (v >= lo && v < mid) lc++;
      else if (v >= mid && v <= hi) uc++;
    }
    if (chose === 'upper') lo = mid;
    else hi = mid;
    let n = nk + 1;
    while (!(a(n) >= lo && a(n) <= hi)) n++;
    nk = n;
    out.push({ k: idx + 1, lo, hi, nk, term: a(nk), lowerCount: lc, upperCount: uc, chose });
  });
  return out;
}

/* ───────── Figure 4: Cauchy tails ───────── */

export type CauchyId = 'basel' | 'harmonic' | 'decimals';

export interface CauchyInfo {
  id: CauchyId;
  label: string;
  tex: string;
  a: (n: number) => number;
  /** sup over m > n ≥ N of |a_m − a_n|, for m up to `far`. */
  spread: (N: number, far: number) => number;
  limitNote: string;
}

/** Prefix sums, built once up to FAR so tails are cheap to read. */
export const FAR = 100000;
const prefix = (term: (k: number) => number) => {
  const out = new Float64Array(FAR + 1);
  for (let k = 1; k <= FAR; k++) out[k] = out[k - 1] + term(k);
  return out;
};
let HP: Float64Array | null = null;
let BP: Float64Array | null = null;
const H = (n: number) => (HP ??= prefix((k) => 1 / k))[Math.min(n, FAR)];
const B = (n: number) => (BP ??= prefix((k) => 1 / (k * k)))[Math.min(n, FAR)];
/** √2 cut after n decimal places: 1, 1.4, 1.41, 1.414, … (n = 1 means no decimals). */
const SQRT2_DIGITS = '14142135623730950488';
const dec = (n: number) => {
  const d = Math.min(n, SQRT2_DIGITS.length);
  return Number(SQRT2_DIGITS.slice(0, d)) / 10 ** (d - 1);
};

export const CAUCHY: CauchyInfo[] = [
  {
    id: 'basel',
    label: '1 + 1/4 + 1/9 + … 의 부분합',
    tex: 's_n = \\sum_{k=1}^{n} \\frac{1}{k^2}',
    a: B,
    // increasing, so the spread over [N, far] is s_far − s_N
    spread: (N, far) => B(far) - B(N),
    limitNote: '실수 π²/6 ≈ 1.6449로 수렴',
  },
  {
    id: 'harmonic',
    label: '1 + 1/2 + 1/3 + … 의 부분합',
    tex: 'h_n = \\sum_{k=1}^{n} \\frac{1}{k}',
    a: H,
    spread: (N, far) => H(far) - H(N),
    limitNote: '수렴하지 않음',
  },
  {
    id: 'decimals',
    label: '√2를 소수 n−1자리에서 자른 수',
    tex: 'd_n = 1,\\ 1.4,\\ 1.41,\\ 1.414,\\ \\dots',
    a: dec,
    // increasing (each cut adds a nonnegative digit), so the spread is d_far − d_N, and at most 10^{−(N−1)}
    spread: (N, far) => dec(Math.min(far, SQRT2_DIGITS.length)) - dec(N),
    limitNote: '실수 √2로 수렴하지만 유리수 안에는 극한이 없음',
  },
];

/** Smallest N whose tail spread up to `far` is below ε (searched up to maxN), or null. */
export function cauchyN(c: CauchyInfo, eps: number, far: number, maxN = 2000): number | null {
  for (let N = 1; N <= maxN; N++) if (c.spread(N, far) < eps) return N;
  return null;
}

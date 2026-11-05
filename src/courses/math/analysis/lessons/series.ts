/* 해석학 · 급수: pure helpers for the figures (no imports, so node can run them). */

export type SeriesId = 'geo' | 'p2' | 'alt' | 'harm';

export interface SeriesDef {
  id: SeriesId;
  name: string;
  tex: string;
  term: (n: number) => number;
  /** The sum, when it is finite and known in closed form. */
  sum: number | null;
  /**
   * Oscillation of the tail: max − min of S_k over k ≥ N (exact, from the series' shape).
   * Infinity when the series diverges.
   */
  tailOsc: (N: number) => number;
}

/** Partial sums S_1..S_n of a series with terms a_1, a_2, … */
export function partialSums(term: (n: number) => number, n: number): number[] {
  const out: number[] = [];
  let s = 0;
  for (let k = 1; k <= n; k++) {
    s += term(k);
    out.push(s);
  }
  return out;
}

const sumTo = (term: (n: number) => number, n: number) => {
  let s = 0;
  for (let k = 1; k <= n; k++) s += term(k);
  return s;
};

export const SERIES: SeriesDef[] = [
  {
    id: 'geo',
    name: '기하급수 1/2ⁿ',
    tex: '\\sum_{n\\ge1} \\tfrac{1}{2^n}',
    term: (n) => Math.pow(0.5, n),
    sum: 1,
    // S_k increases to 1, so the tail swings between S_N and 1
    tailOsc: (N) => Math.pow(0.5, N),
  },
  {
    id: 'p2',
    name: '1/n²',
    tex: '\\sum_{n\\ge1} \\tfrac{1}{n^2}',
    term: (n) => 1 / (n * n),
    sum: (Math.PI * Math.PI) / 6,
    tailOsc: (N) => (Math.PI * Math.PI) / 6 - sumTo((n) => 1 / (n * n), N),
  },
  {
    id: 'alt',
    name: '교대 조화급수',
    tex: '\\sum_{n\\ge1} \\tfrac{(-1)^{n+1}}{n}',
    term: (n) => (n % 2 ? 1 : -1) / n,
    sum: Math.LN2,
    // terms alternate and shrink, so every later S_k lies between S_N and S_{N+1}
    tailOsc: (N) => 1 / (N + 1),
  },
  {
    id: 'harm',
    name: '조화급수',
    tex: '\\sum_{n\\ge1} \\tfrac{1}{n}',
    term: (n) => 1 / n,
    sum: null,
    tailOsc: () => Infinity,
  },
];

/** Smallest N with tail oscillation below ε (searched up to `limit`), or null if none. */
export function cauchyN(s: SeriesDef, eps: number, limit = 100000): number | null {
  if (s.sum === null) return null;
  // the oscillation decreases in N for all three convergent series, so a doubling + bisection search works
  let hi = 1;
  while (hi <= limit && !(s.tailOsc(hi) < eps)) hi *= 2;
  if (hi > limit) return null;
  let lo = Math.max(1, Math.floor(hi / 2));
  if (s.tailOsc(lo) < eps) return lo;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (s.tailOsc(mid) < eps) hi = mid;
    else lo = mid;
  }
  return hi;
}

/** S_{2n} − S_n for the harmonic series: always at least 1/2, which is why it is not Cauchy. */
export const harmonicBlock = (n: number) => {
  let s = 0;
  for (let k = n + 1; k <= 2 * n; k++) s += 1 / k;
  return s;
};

/* ───────── ratio test on a_n = n² / 2ⁿ ───────── */

export const ratioTerm = (n: number) => (n * n) / Math.pow(2, n);
export const ratio = (n: number) => ratioTerm(n + 1) / ratioTerm(n);
/** Σ n²/2ⁿ = 6. */
export const RATIO_SUM = 6;

/** First N with a_{n+1}/a_n ≤ q for every n ≥ N (the ratio decreases toward 1/2 from n = 1 on). */
export function ratioN(q: number): number {
  let n = 1;
  while (ratio(n) > q) n++;
  return n;
}

/** The bound from the proof: S_{N−1} + a_N / (1 − q). */
export function ratioBound(q: number): { N: number; head: number; tailBound: number; total: number } {
  const N = ratioN(q);
  const head = sumTo(ratioTerm, N - 1);
  const tailBound = ratioTerm(N) / (1 - q);
  return { N, head, tailBound, total: head + tailBound };
}

/* ───────── Riemann rearrangement of the alternating harmonic series ───────── */

export interface Rearranged {
  /** The value of each term in the order used. */
  terms: number[];
  sums: number[];
  positives: number;
  negatives: number;
}

/**
 * Greedy rearrangement: take unused positive terms 1, 1/3, 1/5, … while the sum is at most
 * `target(step)`, otherwise take the next negative term −1/2, −1/4, … Every term is used once,
 * in its own order within its sign.
 */
export function rearrange(target: (k: number) => number, count: number): Rearranged {
  let p = 0, q = 0, s = 0;
  const terms: number[] = [];
  const sums: number[] = [];
  for (let k = 0; k < count; k++) {
    let t: number;
    if (s <= target(k)) {
      t = 1 / (2 * p + 1);
      p++;
    } else {
      q++;
      t = -1 / (2 * q);
    }
    s += t;
    terms.push(t);
    sums.push(s);
  }
  return { terms, sums, positives: p, negatives: q };
}

/** Rearrange toward +∞: the target climbs by one each time the sum passes it. */
export function rearrangeToInfinity(count: number): Rearranged {
  let p = 0, q = 0, s = 0, goal = 1, owe = false;
  const terms: number[] = [];
  const sums: number[] = [];
  for (let k = 0; k < count; k++) {
    let t: number;
    if (owe) {
      // after passing a goal, spend exactly one negative term, so every negative is eventually used
      q++;
      t = -1 / (2 * q);
      owe = false;
    } else {
      t = 1 / (2 * p + 1);
      p++;
    }
    s += t;
    if (t > 0 && s > goal) {
      goal += 1;
      owe = true;
    }
    terms.push(t);
    sums.push(s);
  }
  return { terms, sums, positives: p, negatives: q };
}

/* ───────── a fixed pattern applied to two alternating series ───────── */

/**
 * Take `pos` positive terms then `neg` negative terms, repeating, from the alternating series
 * with |a_n| = mag(n). Returns the partial sums.
 */
export function pattern(mag: (n: number) => number, pos: number, neg: number, count: number): number[] {
  let p = 0, q = 0, s = 0;
  const out: number[] = [];
  while (out.length < count) {
    for (let i = 0; i < pos && out.length < count; i++) {
      s += mag(2 * p + 1);
      p++;
      out.push(s);
    }
    for (let i = 0; i < neg && out.length < count; i++) {
      q++;
      s -= mag(2 * q);
      out.push(s);
    }
  }
  return out;
}

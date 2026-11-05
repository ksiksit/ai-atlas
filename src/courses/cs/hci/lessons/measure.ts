/*
 * 사람과 컴퓨터의 상호작용: timing helpers and the fits used by the measurement lessons.
 * Pure functions, no DOM, so node can run them.
 */

export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

export function median(xs: number[]): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export interface LinFit {
  /** intercept */
  a: number;
  /** slope */
  b: number;
  /** coefficient of determination */
  r2: number;
  n: number;
}

/** Least-squares line y = a + b·x. Needs at least two distinct x values. */
export function linFit(xs: number[], ys: number[]): LinFit | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return null;
  const mx = mean(xs.slice(0, n));
  const my = mean(ys.slice(0, n));
  let sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    sxx += (xs[i] - mx) ** 2;
    sxy += (xs[i] - mx) * (ys[i] - my);
    syy += (ys[i] - my) ** 2;
  }
  if (sxx === 0) return null;
  const b = sxy / sxx;
  const a = my - b * mx;
  let sse = 0;
  for (let i = 0; i < n; i++) sse += (ys[i] - (a + b * xs[i])) ** 2;
  return { a, b, r2: syy === 0 ? 1 : 1 - sse / syy, n };
}

/* ───────── reaction time ───────── */

/** Random wait before the stimulus, in ms: between 1.2 and 3.5 s so it cannot be anticipated. */
export const waitMs = (r: number) => 1200 + r * 2300;

/** Answers faster than this are anticipations, not reactions. */
export const TOO_FAST_MS = 100;

/** Choice reaction: one block per number of alternatives. */
export const CHOICES = [1, 2, 4, 8] as const;
export type Choice = (typeof CHOICES)[number];
/** Keys for the alternatives, left to right. */
export const CHOICE_KEYS = ['1', '2', '3', '4', '5', '6', '7', '8'];
/** Trials per block (correct answers counted). */
export const TRIALS_PER_BLOCK = 8;

/**
 * Example data, labelled as such wherever it is shown: made-up but plausible correct-answer
 * times (ms) of one person for each number of alternatives.
 */
export const EXAMPLE_CHOICE: Record<Choice, number[]> = {
  1: [262, 241, 288, 255, 270, 249, 281, 258],
  2: [371, 402, 356, 389, 418, 365, 397, 380],
  4: [498, 532, 470, 515, 546, 489, 507, 521],
  8: [631, 668, 602, 655, 689, 640, 617, 662],
};

/** Hick–Hyman fit RT = a + b·log₂N over block means. */
export function hickFit(data: Partial<Record<Choice, number[]>>): { pts: { n: Choice; bits: number; rt: number }[]; fit: LinFit | null } {
  const pts = CHOICES.filter((n) => (data[n]?.length ?? 0) > 0).map((n) => ({ n, bits: Math.log2(n), rt: mean(data[n]!) }));
  return { pts, fit: pts.length >= 2 ? linFit(pts.map((p) => p.bits), pts.map((p) => p.rt)) : null };
}

/* ───────── digit span ───────── */

/** A random digit string of length k with no digit repeated twice in a row. */
export function digits(k: number, r: () => number): string {
  let s = '';
  while (s.length < k) {
    const d = String(Math.floor(r() * 10));
    if (d !== s[s.length - 1]) s += d;
  }
  return s;
}

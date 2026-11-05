/* 위상수학 · 콤팩트성: pure logic for the figures (no React, no DOM). */

import { rng } from '../../../../lib/math';

/* ───────── Figure 1: the nested cover Uₙ = (1/n, 2) ───────── */

/** The smallest n with 1/n < δ, so that (−δ, δ) and Uₙ = (1/n, 2) together cover [0, 1]. */
export const neededN = (delta: number) => Math.floor(1 / delta) + 1;

/* ───────── Figure 2: pick a finite subcover from a cover of [0, 1] ───────── */

export interface Interval {
  a: number;
  b: number;
}

/** A seeded cover of [0, 1] by short open intervals with centres in [−0.05, 1.05]. */
export function randomCover(seed: number, count = 40): Interval[] {
  const r = rng(seed);
  return Array.from({ length: count }, () => {
    const c = -0.05 + 1.1 * r();
    const h = 0.025 + 0.06 * r();
    return { a: c - h, b: c + h };
  });
}

/**
 * Greedy finite subcover of [0, 1] from open intervals: from the leftmost point not yet covered,
 * take the interval containing it that reaches farthest right; repeat until past 1.
 * Returns the chosen indices, or the first point left uncovered.
 */
export function greedySubcover(cover: Interval[]): { chosen: number[]; gapAt: number | null } {
  const chosen: number[] = [];
  let x = 0;
  for (let guard = 0; guard < cover.length + 1; guard++) {
    let best = -1;
    for (let i = 0; i < cover.length; i++) {
      const I = cover[i];
      // x must lie inside the open interval
      if (I.a < x && x < I.b && (best < 0 || I.b > cover[best].b)) best = i;
    }
    if (best < 0) return { chosen, gapAt: x };
    chosen.push(best);
    if (cover[best].b > 1) return { chosen, gapAt: null };
    // the next point to cover is the right end of the chosen interval, which it does not contain
    x = cover[best].b;
  }
  return { chosen, gapAt: x };
}

/* ───────── Figure 3: the bisection argument ───────── */

export interface BisectStep {
  k: number;
  /** The kept interval [a, b]. */
  a: number;
  b: number;
  /** The smallest n with Uₙ = (1/n, 2) covering the other half, which needs just one set. */
  otherN: number;
}

/** In (0, 1) with the cover Uₙ = (1/n, 2), the half without a finite subcover is always the left one. */
export function bisectSteps(steps: number): BisectStep[] {
  return Array.from({ length: steps + 1 }, (_, k) => {
    const b = 2 ** -k;
    // the right half [2^−(k+1), 2^−k] is inside Uₙ once 1/n < 2^−(k+1)
    return { k, a: 0, b, otherN: Math.floor(2 ** (k + 1)) + 1 };
  });
}

/** In [0, 1] with the extra set (−δ, δ): the first step whose kept interval [0, 2^−k] fits inside (−δ, δ). */
export const contradictionStep = (delta: number) => {
  let k = 0;
  while (2 ** -k >= delta) k++;
  return k;
};

/* ───────── Figure 4: the gallery ───────── */

export type SetId = 'closed-interval' | 'reals' | 'open-disk' | 'half-line' | 'naturals' | 'reciprocals' | 'reciprocals-zero';

export interface GallerySet {
  id: SetId;
  name: string;
  tex: string;
  closed: boolean;
  bounded: boolean;
  compact: boolean;
  /** A sequence in the set with no subsequence converging inside the set (empty when compact). */
  sequence: string;
  /** An open cover with no finite subcover (empty when compact). */
  cover: string;
  /** A continuous real function on the set with no largest value (empty when compact). */
  noMax: string;
}

export const GALLERY: GallerySet[] = [
  { id: 'closed-interval', name: '닫힌 구간', tex: '[0, 1]', closed: true, bounded: true, compact: true, sequence: '', cover: '', noMax: '' },
  { id: 'reals', name: '실수 전체', tex: '\\mathbb{R}', closed: true, bounded: false, compact: false, sequence: 'x_n = n', cover: '(-n, n),\\ n = 1, 2, \\dots', noMax: 'f(x) = x' },
  { id: 'open-disk', name: '열린 원판', tex: '\\{ z : |z| < 1 \\}', closed: false, bounded: true, compact: false, sequence: 'z_n = 1 - 1/n', cover: '\\{ |z| < 1 - 1/n \\},\\ n = 2, 3, \\dots', noMax: 'f(z) = |z|' },
  { id: 'half-line', name: '닫힌 반직선', tex: '[0, \\infty)', closed: true, bounded: false, compact: false, sequence: 'x_n = n', cover: '[0, n),\\ n = 1, 2, \\dots', noMax: 'f(x) = x' },
  { id: 'naturals', name: '자연수', tex: '\\mathbb{N}', closed: true, bounded: false, compact: false, sequence: 'x_n = n', cover: '(n - \\tfrac12, n + \\tfrac12),\\ n \\in \\mathbb{N}', noMax: 'f(n) = n' },
  { id: 'reciprocals', name: '역수의 집합', tex: '\\{ 1/n : n \\ge 1 \\}', closed: false, bounded: true, compact: false, sequence: 'x_n = 1/n', cover: '\\left(\\tfrac{1}{n} - \\tfrac{1}{3n^2},\\ \\tfrac{1}{n} + \\tfrac{1}{3n^2}\\right)', noMax: 'f(x) = 1/x' },
  { id: 'reciprocals-zero', name: '역수와 0', tex: '\\{0\\} \\cup \\{ 1/n : n \\ge 1 \\}', closed: true, bounded: true, compact: true, sequence: '', cover: '', noMax: '' },
];

/**
 * For {0} ∪ {1/n}: any open set around 0 contains (−r, r), which holds every 1/n with n > 1/r.
 * Returns how many points 1/n are left outside it, each needing one more set.
 */
export const pointsOutside = (r: number) => Math.floor(1 / r);

/*
 * 사람과 컴퓨터의 상호작용: Fitts's law (Shannon form, MacKenzie 1992).
 * Pure functions, no DOM.
 */

import { linFit, mean, type LinFit } from './measure';

/** Index of difficulty in bits: ID = log₂(D/W + 1). */
export const fittsId = (d: number, w: number) => Math.log2(d / w + 1);

export interface FittsTrial {
  d: number;
  w: number;
  /** movement time, ms */
  mt: number;
  /** missed clicks before hitting the target */
  miss: number;
}

/** A condition of the reciprocal tapping task, in CSS px. */
export interface Condition {
  d: number;
  w: number;
}

/**
 * Six conditions spread over ID, sized to the width of the task area so the two targets fit.
 * Distances are fractions of the usable width; widths are fixed pixel sizes.
 */
export function conditions(areaW: number): Condition[] {
  const usable = Math.max(160, areaW - 40);
  const near = Math.round(usable * 0.3);
  const mid = Math.round(usable * 0.55);
  const far = Math.round(usable * 0.85);
  const fit = (d: number, w: number) => ({ d: Math.min(d, usable - w), w });
  return [fit(near, 48), fit(near, 16), fit(mid, 40), fit(mid, 12), fit(far, 32), fit(far, 10)];
}

/** Clicks per condition: the first click only starts the clock, the next CLICKS are timed. */
export const CLICKS = 5;

/** Fit MT = a + b·ID over all trials. */
export function fittsFit(trials: FittsTrial[]): LinFit | null {
  return linFit(trials.map((t) => fittsId(t.d, t.w)), trials.map((t) => t.mt));
}

/** Throughput in bits per second: the mean of ID/MT over trials. */
export function throughput(trials: FittsTrial[]): number {
  return mean(trials.map((t) => fittsId(t.d, t.w) / (t.mt / 1000)));
}

/**
 * Example data, labelled as such wherever it is shown: made-up but plausible timed clicks of
 * one person with a mouse on a 900 px wide area (the six conditions of conditions(900)).
 */
export const EXAMPLE_FITTS: FittsTrial[] = (() => {
  const conds = conditions(900);
  // a person whose MT ≈ 150 + 165·ID ms, with fixed jitter so the example is the same every time
  const jitter = [-38, 22, -9, 41, -27, 15, -44, 33, 4, -18, 27, -6, 36, -31, 11, -22, 46, -13, 8, -35, 19, -3, 29, -41, 13, -16, 38, -24, 2, 31];
  const out: FittsTrial[] = [];
  conds.forEach((c, i) => {
    for (let k = 0; k < CLICKS; k++) {
      const j = jitter[(i * CLICKS + k) % jitter.length];
      out.push({ d: c.d, w: c.w, mt: Math.round(150 + 165 * fittsId(c.d, c.w) + j), miss: k === 3 && c.w <= 12 ? 1 : 0 });
    }
  });
  return out;
})();

/* ───────── menus ───────── */

/** Linear (drop-down) menu: the pointer starts at the top edge; item k (1-based) has height h. */
export const linearIds = (n: number) => Array.from({ length: n }, (_, k) => fittsId((k + 0.5) * 1, 1));

/**
 * Pie menu: the pointer starts at the centre; each of n slices is reached by moving a distance r,
 * and its width across the movement is the arc length 2πr/n. ID is the same for every item.
 */
export const pieId = (n: number) => fittsId(1, (2 * Math.PI) / n);

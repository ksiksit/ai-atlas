/* 테스트: a partitioned input space with mutants, property-based testing with shrinking, line and branch coverage */

import { rng } from '../../../../lib/math';

/* ─────────────── Figure 1: partitions and mutants ─────────────── */

export const AGE_MAX = 90;
export const HOUR_MIN = 7;
export const HOUR_MAX = 23;

export type PriceFn = (age: number, hour: number) => number;

/** The spec: ticket price by age group, minus a time-of-day discount, never below 5,000. */
export const ticketPrice: PriceFn = (age, hour) => {
  const base = age < 13 ? 7000 : age >= 65 ? 6000 : 12000;
  const disc = hour < 10 ? 2000 : hour >= 22 ? 3000 : 0;
  return Math.max(5000, base - disc);
};

export interface Mutant {
  id: number;
  name: string;
  line: string;
  equivalent?: boolean;
  f: PriceFn;
}

function priceWith(o: { child?: (a: number) => boolean; senior?: (a: number) => boolean; morning?: (h: number) => boolean; night?: (h: number) => boolean; childPrice?: number; nightDisc?: number; floor?: number; seniorNoDisc?: boolean; childNoMorning?: boolean }): PriceFn {
  return (age, hour) => {
    const child = (o.child ?? ((a) => a < 13))(age);
    const senior = !child && (o.senior ?? ((a) => a >= 65))(age);
    const base = child ? (o.childPrice ?? 7000) : senior ? 6000 : 12000;
    const morning = (o.morning ?? ((h) => h < 10))(hour);
    const night = (o.night ?? ((h) => h >= 22))(hour);
    let disc = morning ? 2000 : night ? (o.nightDisc ?? 3000) : 0;
    if (senior && o.seniorNoDisc) disc = 0;
    if (child && morning && o.childNoMorning) disc = 0;
    const fl = o.floor === undefined ? 5000 : o.floor;
    return fl < 0 ? base - disc : Math.max(fl, base - disc);
  };
}

export const MUTANTS: Mutant[] = [
  { id: 1, name: '어린이 경계', line: 'age <= 13', f: priceWith({ child: (a) => a <= 13 }) },
  { id: 2, name: '경로 경계', line: 'age > 65', f: priceWith({ senior: (a) => a > 65 }) },
  { id: 3, name: '조조 경계', line: 'hour <= 10', f: priceWith({ morning: (h) => h <= 10 }) },
  { id: 4, name: '심야 경계', line: 'hour > 22', f: priceWith({ night: (h) => h > 22 }) },
  { id: 5, name: '어린이 요금', line: 'base = 8000', f: priceWith({ childPrice: 8000 }) },
  { id: 6, name: '심야 할인액', line: 'disc = 2000 (심야)', f: priceWith({ nightDisc: 2000 }) },
  { id: 7, name: '최저가 빠짐', line: 'return base - disc', f: priceWith({ floor: -1 }) },
  { id: 8, name: '경로는 할인 없음', line: 'if (senior) disc = 0', f: priceWith({ seniorNoDisc: true }) },
  { id: 9, name: '어린이 조조 빠짐', line: 'if (child && morning) disc = 0', f: priceWith({ childNoMorning: true }) },
  { id: 10, name: '같은 뜻의 다른 조건', line: 'hour <= 9', equivalent: true, f: priceWith({ morning: (h) => h <= 9 }) },
];

export interface PTest {
  age: number;
  hour: number;
}

export const AGE_BANDS = [
  { lo: 0, hi: 12, name: '어린이' },
  { lo: 13, hi: 64, name: '일반' },
  { lo: 65, hi: AGE_MAX, name: '경로' },
];
export const HOUR_BANDS = [
  { lo: HOUR_MIN, hi: 9, name: '조조' },
  { lo: 10, hi: 21, name: '낮' },
  { lo: 22, hi: HOUR_MAX, name: '심야' },
];
export const cellOf = (t: PTest) => AGE_BANDS.findIndex((b) => t.age >= b.lo && t.age <= b.hi) * 3 + HOUR_BANDS.findIndex((b) => t.hour >= b.lo && t.hour <= b.hi);

export const PART_TESTS: PTest[] = [4, 30, 72].flatMap((age) => [8, 15, 23].map((hour) => ({ age, hour })));
export const BOUNDARY_TESTS: PTest[] = [
  { age: 12, hour: 15 },
  { age: 13, hour: 15 },
  { age: 64, hour: 15 },
  { age: 65, hour: 15 },
  { age: 40, hour: 9 },
  { age: 40, hour: 10 },
  { age: 40, hour: 21 },
  { age: 40, hour: 22 },
];

export function randomTests(n: number, seed: number): PTest[] {
  const r = rng(seed);
  return Array.from({ length: n }, () => ({ age: Math.floor(r() * (AGE_MAX + 1)), hour: HOUR_MIN + Math.floor(r() * (HOUR_MAX - HOUR_MIN + 1)) }));
}

/** For each mutant, the index of the first test that tells it apart from the spec (or -1). */
export const killers = (tests: PTest[]) => MUTANTS.map((m) => tests.findIndex((t) => m.f(t.age, t.hour) !== ticketPrice(t.age, t.hour)));

/* ─────────────── Figure 2: property-based testing ─────────────── */

/** Quicksort on the first element. The buggy one keeps only values strictly greater than the pivot on the right. */
export function mySort(xs: number[], buggy: boolean): number[] {
  if (xs.length <= 1) return xs.slice();
  const [p, ...rest] = xs;
  const left = rest.filter((x) => x < p);
  const right = rest.filter((x) => (buggy ? x > p : x >= p));
  return [...mySort(left, buggy), p, ...mySort(right, buggy)];
}

export type PropId = 'sorted' | 'length' | 'perm';
export const PROPS: { id: PropId; label: string; code: string }[] = [
  { id: 'sorted', label: '정렬되어 있다', code: 'isSorted(out)' },
  { id: 'length', label: '길이가 같다', code: 'out.length === xs.length' },
  { id: 'perm', label: '원소가 같다', code: 'sameElements(out, xs)' },
];

export function holds(prop: PropId, xs: number[], out: number[]): boolean {
  if (prop === 'sorted') return out.every((v, i) => i === 0 || out[i - 1] <= v);
  if (prop === 'length') return out.length === xs.length;
  const a = [...xs].sort((p, q) => p - q);
  return a.length === out.length && a.every((v, i) => v === out[i]);
}

export const TRIALS = 100;

export interface PbtRun {
  trials: { xs: number[]; ok: boolean }[]; // up to and including the first failure
  failAt: number; // -1 when every trial passed
  shrink: { xs: number[]; tried: number }[]; // accepted steps, starting from the failing input
  totalTried: number;
}

/** Like QuickCheck, start with short inputs and let them grow: trial k has length ≤ 1 + k/4 (at most 8), values 0..9. */
function genArray(r: () => number, k: number): number[] {
  const maxLen = Math.min(8, 1 + Math.floor(k / 4));
  const len = Math.floor(r() * (maxLen + 1));
  return Array.from({ length: len }, () => Math.floor(r() * 10));
}

/** Smaller candidates for a failing input: drop one element, then make one element smaller. */
function candidates(xs: number[]): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < xs.length; i++) out.push([...xs.slice(0, i), ...xs.slice(i + 1)]);
  for (let i = 0; i < xs.length; i++) {
    if (xs[i] === 0) continue;
    for (const v of [0, Math.floor(xs[i] / 2), xs[i] - 1]) {
      if (v >= xs[i]) continue;
      const c = xs.slice();
      c[i] = v;
      if (!out.some((o) => o.length === c.length && o.every((x, k) => x === c[k]))) out.push(c);
    }
  }
  return out;
}

export function runPbt(prop: PropId, buggy: boolean, seed: number): PbtRun {
  const r = rng(seed * 7919 + 13);
  const fails = (xs: number[]) => !holds(prop, xs, mySort(xs, buggy));
  const trials: PbtRun['trials'] = [];
  let failAt = -1;
  for (let k = 0; k < TRIALS; k++) {
    const xs = genArray(r, k);
    const ok = !fails(xs);
    trials.push({ xs, ok });
    if (!ok) {
      failAt = k;
      break;
    }
  }
  const shrink: PbtRun['shrink'] = [];
  let totalTried = 0;
  if (failAt >= 0) {
    let cur = trials[failAt].xs;
    shrink.push({ xs: cur, tried: 0 });
    for (let guard = 0; guard < 200; guard++) {
      let tried = 0;
      let next: number[] | null = null;
      for (const c of candidates(cur)) {
        tried++;
        if (fails(c)) {
          next = c;
          break;
        }
      }
      totalTried += tried;
      if (!next) break;
      cur = next;
      shrink.push({ xs: cur, tried });
    }
  }
  return { trials, failAt, shrink, totalTried };
}

/* ─────────────── Figure 3: coverage ─────────────── */

export const COV_SRC = [
  'function average(scores, dropLowest) {',
  '  let sum = 0, min = Infinity;',
  '  for (const s of scores) {',
  '    sum += s;',
  '    if (s < min) min = s;',
  '  }',
  '  let n = scores.length;',
  '  if (dropLowest) {',
  '    sum -= min;',
  '    n -= 1;',
  '  }',
  '  return sum / n;',
  '}',
];
/** 0-based indices of the lines that count for line coverage */
export const EXEC_LINES = [1, 2, 3, 4, 6, 7, 8, 9, 11];
/** branches: [line index, label] — each has a true and a false outcome */
export const BRANCHES: { line: number; label: string }[] = [
  { line: 2, label: 'for' },
  { line: 4, label: 's < min' },
  { line: 7, label: 'dropLowest' },
];

export interface CovTest {
  id: string;
  scores: number[];
  drop: boolean;
  expect: number;
}

export const COV_TESTS: CovTest[] = [
  { id: 'A', scores: [80, 90], drop: false, expect: 85 },
  { id: 'B', scores: [70, 90, 100], drop: true, expect: 95 },
  { id: 'C', scores: [90, 70], drop: true, expect: 90 },
  { id: 'D', scores: [], drop: false, expect: 0 },
  { id: 'E', scores: [50], drop: true, expect: 50 },
];

export interface CovRun {
  got: number;
  hits: number[]; // per line
  br: [boolean, boolean][]; // per branch: [taken true, taken false]
}

/** Runs the function above while counting which lines and branch outcomes were executed. */
export function runCov(t: CovTest): CovRun {
  const hits = Array(COV_SRC.length).fill(0);
  const br: [boolean, boolean][] = BRANCHES.map(() => [false, false]);
  const hit = (i: number) => hits[i]++;
  hit(1);
  let sum = 0;
  let min = Infinity;
  let k = 0;
  for (;;) {
    hit(2);
    const more = k < t.scores.length;
    br[0][more ? 0 : 1] = true;
    if (!more) break;
    const s = t.scores[k++];
    hit(3);
    sum += s;
    hit(4);
    br[1][s < min ? 0 : 1] = true;
    if (s < min) min = s;
  }
  hit(6);
  let n = t.scores.length;
  hit(7);
  br[2][t.drop ? 0 : 1] = true;
  if (t.drop) {
    hit(8);
    sum -= min;
    hit(9);
    n -= 1;
  }
  hit(11);
  return { got: sum / n, hits, br };
}

export const sameNum = (a: number, b: number) => (Number.isNaN(a) ? Number.isNaN(b) : Math.abs(a - b) < 1e-9);

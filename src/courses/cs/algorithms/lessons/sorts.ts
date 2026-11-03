/**
 * Sorting algorithms instrumented to record every comparison and every move,
 * so figures can replay them step by step or simply count operations.
 */

export type Alg = 'selection' | 'insertion' | 'merge' | 'quick';

export const ALGS: Record<Alg, { name: string; big: string }> = {
  selection: { name: '선택 정렬', big: 'O(n²)' },
  insertion: { name: '삽입 정렬', big: 'O(n²)' },
  merge: { name: '병합 정렬', big: 'O(n log n)' },
  quick: { name: '퀵 정렬', big: 'O(n log n)' },
};

export interface Frame {
  a: number[];
  /** Positions being compared. */
  cmp: [number, number] | null;
  /** Positions just swapped, or the single position just written. */
  moved: number[];
  /** Active sub-range (merge / quick) or sorted prefix (selection / insertion). */
  range: [number, number] | null;
  pivot: number | null;
  /** Indices known to be in their final place. */
  fixed: number;
  done: boolean;
  c: number;
  m: number;
  note: string;
}

class Recorder {
  frames: Frame[] = [];
  c = 0;
  m = 0;
  range: [number, number] | null = null;
  pivot: number | null = null;
  fixed = 0;
  a: number[];
  private keep: boolean;
  constructor(a: number[], keep: boolean) {
    this.a = a;
    this.keep = keep;
    this.snap({ note: '시작' });
  }
  snap(f: Partial<Frame>) {
    if (!this.keep) return;
    this.frames.push({ a: [...this.a], cmp: null, moved: [], range: this.range, pivot: this.pivot, fixed: this.fixed, done: false, c: this.c, m: this.m, note: '', ...f });
  }
  /** a[i] > a[j]? */
  greater(i: number, j: number): boolean {
    this.c++;
    const g = this.a[i] > this.a[j];
    this.snap({ cmp: [i, j], note: `${this.a[i]}과 ${this.a[j]} 비교 → ${g ? `${this.a[i]}이(가) 큼` : `${this.a[j]}이(가) 크거나 같음`}` });
    return g;
  }
  /** Compare two values that are not (or no longer) at single array positions; i, j only for highlighting. */
  greaterVal(x: number, y: number, i: number, j: number): boolean {
    this.c++;
    this.snap({ cmp: [i, j], note: `${x}과 ${y} 비교` });
    return x > y;
  }
  swap(i: number, j: number) {
    if (i === j) return;
    this.m++;
    [this.a[i], this.a[j]] = [this.a[j], this.a[i]];
    this.snap({ moved: [i, j], note: `${this.a[j]}과 ${this.a[i]} 자리 바꿈` });
  }
  write(k: number, v: number) {
    this.m++;
    this.a[k] = v;
    this.snap({ moved: [k], note: `${k}번 칸에 ${v} 쓰기` });
  }
}

function selection(r: Recorder) {
  const n = r.a.length;
  for (let i = 0; i < n - 1; i++) {
    let min = i;
    for (let j = i + 1; j < n; j++) if (r.greater(min, j)) min = j;
    r.swap(i, min);
    r.fixed = i + 1;
    r.range = [0, i];
  }
  r.fixed = n;
}

function insertion(r: Recorder) {
  const n = r.a.length;
  for (let i = 1; i < n; i++) {
    r.range = [0, i];
    for (let j = i; j > 0 && r.greater(j - 1, j); j--) r.swap(j - 1, j);
  }
}

function merge(r: Recorder) {
  const go = (lo: number, hi: number) => {
    if (lo >= hi) return;
    const mid = (lo + hi) >> 1;
    go(lo, mid);
    go(mid + 1, hi);
    r.range = [lo, hi];
    const aux = r.a.slice(lo, hi + 1);
    let i = lo;
    let j = mid + 1;
    for (let k = lo; k <= hi; k++) {
      if (i > mid) r.write(k, aux[j++ - lo]);
      else if (j > hi) r.write(k, aux[i++ - lo]);
      else if (r.greaterVal(aux[i - lo], aux[j - lo], i, j)) r.write(k, aux[j++ - lo]);
      else r.write(k, aux[i++ - lo]);
    }
  };
  go(0, r.a.length - 1);
}

/** Quicksort with the last element as pivot (Lomuto partition): simple, and slow on sorted input. */
function quick(r: Recorder) {
  const go = (lo: number, hi: number) => {
    if (lo >= hi) return;
    r.range = [lo, hi];
    r.pivot = hi;
    let i = lo;
    for (let j = lo; j < hi; j++) {
      if (!r.greater(j, hi)) {
        r.swap(i, j);
        i++;
      }
    }
    r.swap(i, hi);
    r.pivot = null;
    go(lo, i - 1);
    go(i + 1, hi);
  };
  go(0, r.a.length - 1);
}

const RUN: Record<Alg, (r: Recorder) => void> = { selection, insertion, merge, quick };

/** Every step of sorting a copy of `input`. */
export function trace(alg: Alg, input: number[]): Frame[] {
  const r = new Recorder([...input], true);
  RUN[alg](r);
  r.range = null;
  r.pivot = null;
  r.fixed = input.length;
  r.snap({ done: true, note: `완료 · 비교 ${r.c}번, 이동 ${r.m}번` });
  return r.frames;
}

/** Operation counts only (no frames), for large inputs. */
export function count(alg: Alg, input: number[]): { c: number; m: number } {
  const r = new Recorder([...input], false);
  RUN[alg](r);
  return { c: r.c, m: r.m };
}

export type InputKind = 'random' | 'nearly' | 'reversed' | 'sorted';

export const INPUTS: Record<InputKind, string> = {
  random: '무작위',
  nearly: '거의 정렬됨',
  reversed: '역순',
  sorted: '이미 정렬됨',
};

/** 1..n arranged according to `kind`. */
export function makeInput(kind: InputKind, n: number, r: () => number): number[] {
  const a = Array.from({ length: n }, (_, i) => i + 1);
  if (kind === 'sorted' || n < 2) return a;
  if (kind === 'reversed') return a.reverse();
  if (kind === 'nearly') {
    // a few neighbouring pairs out of place
    for (let k = 0; k < Math.max(1, Math.round(n / 12)); k++) {
      const i = Math.floor(r() * (n - 1));
      [a[i], a[i + 1]] = [a[i + 1], a[i]];
    }
    return a;
  }
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

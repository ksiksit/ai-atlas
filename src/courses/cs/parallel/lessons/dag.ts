/* 병렬·분산 컴퓨팅, 2장: computation DAGs, a greedy scheduler, parallel prefix sums and merge-sort cost models. */

import { rng } from '../../../../lib/math';

/* ───────── 1. summing n numbers as a DAG ───────── */

export interface DagNode {
  id: number;
  /** Inputs are given; only 'op' nodes cost a unit of time. */
  kind: 'in' | 'op';
  deps: number[];
  value: number;
  /** Layout in grid units: column (0 … n−1, may be fractional) and row (0 = inputs). */
  col: number;
  row: number;
}

export type SumShape = 'chain' | 'tree';

export function sumInputs(n: number, seed = 4): number[] {
  const r = rng(seed);
  return Array.from({ length: n }, () => 1 + Math.floor(r() * 9));
}

/** The DAG of adding xs one by one (a chain) or pairwise (a balanced tree). */
export function sumDag(xs: number[], shape: SumShape): DagNode[] {
  const nodes: DagNode[] = xs.map((v, i) => ({ id: i, kind: 'in', deps: [], value: v, col: i, row: 0 }));
  const add = (a: DagNode, b: DagNode, col: number, row: number) => {
    const nd: DagNode = { id: nodes.length, kind: 'op', deps: [a.id, b.id], value: a.value + b.value, col, row };
    nodes.push(nd);
    return nd;
  };
  if (shape === 'chain') {
    let acc = nodes[0];
    for (let i = 1; i < xs.length; i++) acc = add(acc, nodes[i], i - 0.5, i);
  } else {
    let level = nodes.slice();
    let row = 1;
    while (level.length > 1) {
      const next: DagNode[] = [];
      for (let i = 0; i + 1 < level.length; i += 2) next.push(add(level[i], level[i + 1], (level[i].col + level[i + 1].col) / 2, row));
      if (level.length % 2) next.push(level[level.length - 1]);
      level = next;
      row++;
    }
  }
  return nodes;
}

/** Number of op nodes (T₁). */
export const work = (g: DagNode[]) => g.filter((x) => x.kind === 'op').length;

/** Longest chain of op nodes (T∞). */
export function span(g: DagNode[]): number {
  const d = new Map<number, number>();
  for (const nd of g) d.set(nd.id, nd.kind === 'in' ? 0 : 1 + Math.max(...nd.deps.map((k) => d.get(k)!)));
  return Math.max(0, ...d.values());
}

export interface SchedFrame {
  /** Op ids finished after this many steps. */
  done: Set<number>;
  /** Op ids executed in the latest step. */
  ran: number[];
  /** Op ids that were ready but had to wait for a free processor in the latest step. */
  waited: number[];
}

/**
 * Greedy scheduling with p processors and unit-time ops: at every step, run up to p ops whose
 * inputs are all done (deepest first, then lowest id). frames[0] is the start, frames[Tp] the end.
 */
export function greedy(g: DagNode[], p: number): SchedFrame[] {
  const done = new Set<number>(g.filter((x) => x.kind === 'in').map((x) => x.id));
  const ops = g.filter((x) => x.kind === 'op');
  const frames: SchedFrame[] = [{ done: new Set(), ran: [], waited: [] }];
  const finished = new Set<number>();
  while (finished.size < ops.length) {
    const ready = ops.filter((x) => !finished.has(x.id) && x.deps.every((k) => done.has(k)));
    ready.sort((a, b) => b.row - a.row || a.id - b.id);
    const ran = ready.slice(0, p).map((x) => x.id);
    const waited = ready.slice(p).map((x) => x.id);
    for (const k of ran) {
      done.add(k);
      finished.add(k);
    }
    frames.push({ done: new Set(finished), ran, waited });
  }
  return frames;
}

/* ───────── 2. prefix sums ───────── */

export type ScanKind = 'seq' | 'hillis' | 'blelloch';

export interface ScanOp {
  from: number;
  to: number;
  /** 'add': a[to] += a[from]. 'swap-add' (Blelloch down-sweep): a[from] ← a[to], a[to] += old a[from]. 'zero': a[to] ← 0. */
  kind: 'add' | 'swap-add' | 'zero';
}

export interface ScanRound {
  label: string;
  ops: ScanOp[];
  after: number[];
  /** Additions in this round. */
  adds: number;
}

/** Rounds of a prefix-sum algorithm on xs (length a power of two). Every op in a round runs at once. */
export function scanRounds(xs: number[], kind: ScanKind): ScanRound[] {
  const n = xs.length;
  const out: ScanRound[] = [];
  let a = xs.slice();
  if (kind === 'seq') {
    for (let i = 1; i < n; i++) {
      a = a.slice();
      a[i] += a[i - 1];
      out.push({ label: `${i}번 칸 = ${i - 1}번 칸 + 자기`, ops: [{ from: i - 1, to: i, kind: 'add' }], after: a, adds: 1 });
    }
  } else if (kind === 'hillis') {
    for (let d = 1; d < n; d *= 2) {
      const b = a.slice();
      const ops: ScanOp[] = [];
      for (let i = d; i < n; i++) {
        b[i] = a[i] + a[i - d];
        ops.push({ from: i - d, to: i, kind: 'add' });
      }
      a = b;
      out.push({ label: `거리 ${d}만큼 왼쪽 칸을 더함`, ops, after: a, adds: ops.length });
    }
  } else {
    for (let d = 1; d < n; d *= 2) {
      const b = a.slice();
      const ops: ScanOp[] = [];
      for (let i = 2 * d - 1; i < n; i += 2 * d) {
        b[i] = a[i] + a[i - d];
        ops.push({ from: i - d, to: i, kind: 'add' });
      }
      a = b;
      out.push({ label: `올라가기: 거리 ${d}`, ops, after: a, adds: ops.length });
    }
    a = a.slice();
    a[n - 1] = 0;
    out.push({ label: '맨 끝 칸을 0으로', ops: [{ from: n - 1, to: n - 1, kind: 'zero' }], after: a, adds: 0 });
    for (let d = n / 2; d >= 1; d /= 2) {
      const b = a.slice();
      const ops: ScanOp[] = [];
      for (let i = 2 * d - 1; i < n; i += 2 * d) {
        b[i - d] = a[i];
        b[i] = a[i] + a[i - d];
        ops.push({ from: i - d, to: i, kind: 'swap-add' });
      }
      a = b;
      out.push({ label: `내려가기: 거리 ${d}`, ops, after: a, adds: ops.length });
    }
  }
  return out;
}

export interface ScanCost {
  work: number;
  /** Rounds that contain at least one addition. */
  span: number;
  /** Steps with p processors: each round takes ⌈ops/p⌉ steps. */
  steps: (p: number) => number;
}

export function scanCost(rounds: ScanRound[]): ScanCost {
  const work = rounds.reduce((s, r) => s + r.adds, 0);
  const span = rounds.filter((r) => r.adds > 0).length;
  return { work, span, steps: (p) => rounds.reduce((s, r) => s + (r.adds ? Math.ceil(r.adds / p) : 0), 0) };
}

/* ───────── 3. merge sort cost models ───────── */

export type SortKind = 'seq' | 'par-split' | 'par-merge';

export interface SortCost {
  work: number;
  span: number;
}

/**
 * Unit-cost models for sorting n = 2^L items. Work is n·L in every version (each level of the
 * recursion merges n items). Span:
 * - seq: everything in one line, so span = work.
 * - par-split: the two halves sort in parallel but each merge is sequential: S(n) = S(n/2) + n ≈ 2n.
 * - par-merge: the merge itself is parallel (split by binary search), span k for k = log₂ of its size,
 *   so S(n) = S(n/2) + L(L+1)/2 ≈ L³/6.
 */
export function sortCost(L: number, kind: SortKind): SortCost {
  const n = 2 ** L;
  const work = n * L;
  if (kind === 'seq') return { work, span: work };
  if (kind === 'par-split') return { work, span: 2 * n - 2 };
  let s = 0;
  for (let j = 1; j <= L; j++) s += (j * (j + 1)) / 2;
  return { work, span: s };
}

/** Brent's bound: a greedy scheduler finishes in at most T₁/p + T∞ steps. */
export const brent = (c: SortCost, p: number) => c.work / p + c.span;

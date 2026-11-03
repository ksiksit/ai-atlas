/* Traces and counters for the recursion and divide-and-conquer lessons. Pure functions so they can be checked outside the browser. */

/* ─────────────── fib(n) call tree ─────────────── */

export interface FibNode {
  id: number; // order of the call (0 = the first call, fib(n))
  arg: number;
  parent: number; // -1 for the root
  depth: number;
  x: number; // horizontal position in leaf units (leaves are 0, 1, 2, …)
  value: number;
  callAt: number; // frame index where the call starts
  returnAt: number; // frame index where it returns
  repeat: boolean; // an earlier call already had the same argument
}

export interface FibFrame {
  active: number; // node on top of the stack (-1 when nothing runs)
  stack: number[]; // node ids, bottom first
  calls: number; // calls made so far
  repeats: number; // of those, calls whose argument had been seen before
  note: string;
}

export function fibTrace(n: number): { nodes: FibNode[]; frames: FibFrame[]; leaves: number; maxDepth: number } {
  const nodes: FibNode[] = [];
  const frames: FibFrame[] = [{ active: -1, stack: [], calls: 0, repeats: 0, note: `재생하면 fib(${n}) 호출부터 시작합니다.` }];
  const stack: number[] = [];
  const seen = new Set<number>();
  let leaves = 0;
  let repeats = 0;
  const snap = (note: string) => frames.push({ active: stack.length ? stack[stack.length - 1] : -1, stack: [...stack], calls: nodes.length, repeats, note });

  const call = (k: number, parent: number, depth: number): number => {
    const id = nodes.length;
    const repeat = seen.has(k);
    seen.add(k);
    if (repeat) repeats++;
    const node: FibNode = { id, arg: k, parent, depth, x: 0, value: 0, callAt: frames.length, returnAt: 0, repeat };
    nodes.push(node);
    stack.push(id);
    const again = repeat ? ` (fib(${k}) 계산은 이번이 처음이 아님)` : '';
    if (k < 2) {
      snap(`fib(${k}) 호출 → n < 2, 기저 사례${again}`);
      node.value = k;
      node.x = leaves++;
    } else {
      snap(`fib(${k}) 호출 → 먼저 fib(${k - 1}) 계산${again}`);
      const a = call(k - 1, id, depth + 1);
      const b = call(k - 2, id, depth + 1);
      node.value = nodes[a].value + nodes[b].value;
      node.x = (nodes[a].x + nodes[b].x) / 2;
    }
    stack.pop();
    node.returnAt = frames.length;
    const back = parent >= 0 ? ` (호출한 곳: fib(${nodes[parent].arg}))` : '. 끝';
    if (k < 2) snap(`fib(${k}) = ${k} 반환${back}`);
    else {
      const [a, b] = nodes.filter((m) => m.parent === id);
      snap(`fib(${k}) = ${a.value} + ${b.value} = ${node.value} 반환${back}`);
    }
    return id;
  };
  call(n, -1, 0);
  return { nodes, frames, leaves, maxDepth: Math.max(...nodes.map((m) => m.depth)) };
}

/** Number of calls the naive recursive fib(n) makes: C(n) = C(n-1) + C(n-2) + 1. */
export function fibCalls(n: number): number {
  let a = 1; // C(0)
  let b = 1; // C(1)
  if (n === 0) return 1;
  for (let k = 2; k <= n; k++) [a, b] = [b, a + b + 1];
  return b;
}

/* ─────────────── N-Queens backtracking ─────────────── */

export interface QueenFrame {
  queens: number[]; // column of the queen in rows 0..queens.length-1
  row: number; // row being filled
  col: number; // column being tried (-1 for a backtrack / final frame)
  kind: 'start' | 'place' | 'conflict' | 'back' | 'solution' | 'done';
  hit: number; // row of the queen that attacks the tried square (-1 if none)
  tried: number; // squares tried so far
  solutions: number;
  note: string;
}

/** The first queen (by row) that attacks (r, c), or -1. */
export function attacker(queens: readonly number[], r: number, c: number): number {
  for (let q = 0; q < queens.length; q++) {
    const qc = queens[q];
    if (qc === c || Math.abs(qc - c) === r - q) return q;
  }
  return -1;
}

export function queensTrace(n: number): { frames: QueenFrame[]; solutionAt: number[] } {
  const frames: QueenFrame[] = [];
  const solutionAt: number[] = [];
  const queens: number[] = [];
  let tried = 0;
  let solutions = 0;
  const snap = (f: Omit<QueenFrame, 'queens' | 'tried' | 'solutions'>) => frames.push({ ...f, queens: [...queens], tried, solutions });
  snap({ row: 0, col: -1, kind: 'start', hit: -1, note: `한 행에 퀸을 하나씩, 1행부터 놓아 봅니다.` });

  const place = (r: number) => {
    if (r === n) {
      solutions++;
      solutionAt.push(frames.length);
      snap({ row: r, col: -1, kind: 'solution', hit: -1, note: `${solutions}번째 해 발견. 마지막 퀸을 치우고 다른 칸을 계속 찾습니다.` });
      return;
    }
    for (let c = 0; c < n; c++) {
      tried++;
      const q = attacker(queens, r, c);
      if (q >= 0) {
        const why = queens[q] === c ? '같은 열' : '같은 대각선';
        snap({ row: r, col: c, kind: 'conflict', hit: q, note: `${r + 1}행 ${c + 1}열: ${q + 1}행 퀸과 ${why} → 건너뜀` });
        continue;
      }
      snap({ row: r, col: c, kind: 'place', hit: -1, note: `${r + 1}행 ${c + 1}열: 안전 → 퀸을 놓고 다음 행으로` });
      queens.push(c); // 고르기
      place(r + 1); // 탐색
      queens.pop(); // 되돌리기
    }
    if (r > 0) snap({ row: r, col: -1, kind: 'back', hit: -1, note: `${r + 1}행의 칸을 모두 시도함 → 되돌아가서 ${r}행 퀸을 다음 칸으로` });
  };
  place(0);
  snap({ row: 0, col: -1, kind: 'done', hit: -1, note: `1행의 모든 칸까지 시도했습니다. 해는 모두 ${solutions}개입니다.` });
  return { frames, solutionAt };
}

/** Squares tried and solutions found by backtracking (no frames, so it is fast). */
export function queensBacktrack(n: number): { tried: number; solutions: number } {
  let tried = 0;
  let solutions = 0;
  const cols = new Array<boolean>(n).fill(false);
  const d1 = new Array<boolean>(2 * n).fill(false); // r + c
  const d2 = new Array<boolean>(2 * n).fill(false); // r - c + n
  const place = (r: number) => {
    if (r === n) {
      solutions++;
      return;
    }
    for (let c = 0; c < n; c++) {
      tried++;
      if (cols[c] || d1[r + c] || d2[r - c + n]) continue;
      cols[c] = d1[r + c] = d2[r - c + n] = true;
      place(r + 1);
      cols[c] = d1[r + c] = d2[r - c + n] = false;
    }
  };
  place(0);
  return { tried, solutions };
}

/**
 * Squares tried without pruning, one queen per row, any column: n + n² + … + nⁿ.
 * Every full placement (nⁿ of them) is checked only at the end.
 */
export function queensBruteRows(n: number): number {
  let s = 0;
  let p = 1;
  for (let k = 1; k <= n; k++) {
    p *= n;
    s += p;
  }
  return s;
}

/** Squares tried when only the column rule is built in (all permutations): n + n(n-1) + … + n!. */
export function queensBrutePerms(n: number): number {
  let s = 0;
  let p = 1;
  for (let k = 0; k < n; k++) {
    p *= n - k;
    s += p;
  }
  return s;
}

/** Count the same quantities by actually enumerating (only for small n; used by the checking script). */
export function queensEnumerate(n: number, mode: 'rows' | 'perms'): { tried: number; solutions: number } {
  let tried = 0;
  let solutions = 0;
  const q: number[] = [];
  const used = new Array<boolean>(n).fill(false);
  const rec = (r: number) => {
    if (r === n) {
      let ok = true;
      for (let i = 0; i < n && ok; i++) for (let j = i + 1; j < n; j++) if (q[i] === q[j] || Math.abs(q[i] - q[j]) === j - i) ok = false;
      if (ok) solutions++;
      return;
    }
    for (let c = 0; c < n; c++) {
      if (mode === 'perms' && used[c]) continue;
      tried++;
      q.push(c);
      used[c] = true;
      rec(r + 1);
      used[c] = false;
      q.pop();
    }
  };
  rec(0);
  return { tried, solutions };
}

/* ─────────────── Recursion tree of T(n) = a·T(n/2) + f(n) ─────────────── */

export type Work = '1' | 'n' | 'n2';
export const WORK_FN: Record<Work, (m: number) => number> = { '1': () => 1, n: (m) => m, n2: (m) => m * m };

export interface Level {
  depth: number;
  count: number; // subproblems on this level
  size: number; // size of each subproblem
  work: number; // count · f(size)
}

export function treeLevels(a: number, f: Work, n: number): Level[] {
  const out: Level[] = [];
  for (let k = 0, size = n, count = 1; size >= 1; k++, size /= 2, count *= a) out.push({ depth: k, count, size, work: count * WORK_FN[f](size) });
  return out;
}

/** Where the work sits: compare a with 2^d for f(n) = n^d (master theorem with b = 2). */
export function treeShape(a: number, f: Work): 'root' | 'even' | 'leaf' {
  const r = a / { '1': 1, n: 2, n2: 4 }[f];
  return r < 1 ? 'root' : r === 1 ? 'even' : 'leaf';
}

/* ─────────────── Fast exponentiation ─────────────── */

export interface PowStep {
  exp: number; // exponent after this step
  op: 'start' | 'sq' | 'mul';
  bit: number; // index (from the top, 0-based) of the bit this step handles
}

/** Left-to-right binary exponentiation: one squaring per bit after the first, one multiplication per extra 1-bit. */
export function powChain(n: number): PowStep[] {
  const bits = n.toString(2);
  const out: PowStep[] = [{ exp: 1, op: 'start', bit: 0 }];
  let e = 1;
  for (let i = 1; i < bits.length; i++) {
    e *= 2;
    out.push({ exp: e, op: 'sq', bit: i });
    if (bits[i] === '1') {
      e += 1;
      out.push({ exp: e, op: 'mul', bit: i });
    }
  }
  return out;
}

export const powMults = (n: number) => powChain(n).length - 1;

/** The same algorithm on numbers (counts multiplications), used by the checking script. */
export function fastPow(x: bigint, n: number, counter = { m: 0 }): bigint {
  if (n === 0) return 1n;
  if (n === 1) return x;
  const half = fastPow(x, Math.floor(n / 2), counter);
  counter.m++;
  let r = half * half;
  if (n % 2 === 1) {
    counter.m++;
    r *= x;
  }
  return r;
}

/* ─────────────── Ship within D days: binary search on the answer ─────────────── */

/** Greedy packing in order: returns the groups (index ranges) each day carries. Infinity days if a package is heavier than cap. */
export function packDays(w: readonly number[], cap: number): { groups: [number, number][]; days: number } {
  const groups: [number, number][] = [];
  let start = 0;
  let load = 0;
  for (let i = 0; i < w.length; i++) {
    if (w[i] > cap) return { groups: [], days: Infinity };
    if (load + w[i] > cap) {
      groups.push([start, i - 1]);
      start = i;
      load = 0;
    }
    load += w[i];
  }
  groups.push([start, w.length - 1]);
  return { groups, days: groups.length };
}

export interface ShipStep {
  lo: number; // the answer is known to lie in [lo, hi] at this step
  hi: number;
  mid: number | null; // capacity tested at this step
  days: number | null;
  ok: boolean | null; // mid ships within D days
  done: boolean;
  note: string;
}

export function shipSearch(w: readonly number[], D: number): { steps: ShipStep[]; answer: number; probes: number } {
  let lo = Math.max(...w);
  let hi = w.reduce((s, x) => s + x, 0);
  const steps: ShipStep[] = [{ lo, hi, mid: null, days: null, ok: null, done: false, note: `답은 가장 무거운 택배 무게 ${lo} 이상, 전체 무게 ${hi} 이하입니다.` }];
  let probes = 0;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const days = packDays(w, mid).days;
    const ok = days <= D;
    probes++;
    const note = ok
      ? `적재량 ${mid} → ${days}일 (≤ ${D}일) 가능. 답은 ${mid} 이하 → hi = ${mid}`
      : `적재량 ${mid} → ${days}일 (> ${D}일) 불가능. 답은 ${mid + 1} 이상 → lo = ${mid + 1}`;
    steps.push({ lo, hi, mid, days, ok, done: false, note });
    if (ok) hi = mid;
    else lo = mid + 1;
  }
  steps.push({ lo, hi, mid: lo, days: packDays(w, lo).days, ok: true, done: true, note: `lo = hi = ${lo}. ${D}일 안에 보내는 최소 적재량은 ${lo}입니다.` });
  return { steps, answer: lo, probes };
}

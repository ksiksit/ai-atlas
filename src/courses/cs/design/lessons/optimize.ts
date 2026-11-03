/* Pure logic for the 동적 계획법 and 탐욕 알고리즘 lessons: step traces and counters that can be checked outside the browser. */

/* ─────────────── Fibonacci: how much work each version does ─────────────── */

/** F(0) = 0, F(1) = 1, … as plain numbers (exact up to F(78)). */
export function fibNumbers(n: number): number[] {
  const f = [0, 1];
  for (let i = 2; i <= n; i++) f.push(f[i - 1] + f[i - 2]);
  return f.slice(0, n + 1);
}

/** Calls made by `fib(n)` written as `n < 2 ? n : fib(n - 1) + fib(n - 2)`: 2·F(n+1) − 1. */
export function naiveCalls(n: number): number {
  return 2 * fibNumbers(n + 1)[n + 1] - 1;
}

/** Calls made by the memoized version that checks its cache at the top of every call. */
export function memoCalls(n: number): number {
  return n < 2 ? 1 : 2 * n - 1;
}

/** Loop iterations of the bottom-up version with two variables. */
export function loopSteps(n: number): number {
  return Math.max(0, n - 1);
}

/** Count calls by actually running the two recursive versions (used to check the formulas). */
export function countCalls(n: number): { naive: number; memo: number } {
  let naive = 0;
  const slow = (k: number): number => {
    naive++;
    return k < 2 ? k : slow(k - 1) + slow(k - 2);
  };
  slow(n);
  let memo = 0;
  const cache = new Map<number, number>();
  const fast = (k: number): number => {
    memo++;
    if (k < 2) return k;
    const hit = cache.get(k);
    if (hit !== undefined) return hit;
    const v = fast(k - 1) + fast(k - 2);
    cache.set(k, v);
    return v;
  };
  fast(n);
  return { naive, memo };
}

/* ─────────────── Edit distance (Levenshtein) ─────────────── */

export type EditMove = 'same' | 'sub' | 'del' | 'ins';
export const MOVE_NAME: Record<EditMove, string> = { same: '일치', sub: '교체', del: '삭제', ins: '삽입' };

export interface EditTable {
  a: string[];
  b: string[];
  /** d[i][j] = distance between the first i characters of a and the first j characters of b. */
  d: number[][];
  /** Which neighbour gave d[i][j] (row 0 and column 0 are base cases). */
  move: (EditMove | null)[][];
}

/** Split into user-perceived characters (Hangul syllables stay whole). */
export const chars = (s: string) => Array.from(s);

export function editTable(as: string, bs: string): EditTable {
  const a = chars(as);
  const b = chars(bs);
  const m = a.length;
  const n = b.length;
  const d = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  const move = Array.from({ length: m + 1 }, () => new Array<EditMove | null>(n + 1).fill(null));
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) move[i][0] = 'del';
  for (let j = 1; j <= n; j++) move[0][j] = 'ins';
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const same = a[i - 1] === b[j - 1];
      const diag = d[i - 1][j - 1] + (same ? 0 : 1);
      const del = d[i - 1][j] + 1;
      const ins = d[i][j - 1] + 1;
      // ties prefer the diagonal, then delete, then insert
      let best = diag;
      let mv: EditMove = same ? 'same' : 'sub';
      if (del < best) {
        best = del;
        mv = 'del';
      }
      if (ins < best) {
        best = ins;
        mv = 'ins';
      }
      d[i][j] = best;
      move[i][j] = mv;
    }
  }
  return { a, b, d, move };
}

export interface EditOp {
  move: EditMove;
  i: number; // cell the move arrives at
  j: number;
  text: string;
}

/** Walk back from the bottom-right corner. Returns the cells on the path (from (0,0)) and the operations in reading order. */
export function editPath(t: EditTable): { cells: [number, number][]; ops: EditOp[] } {
  let i = t.a.length;
  let j = t.b.length;
  const cells: [number, number][] = [[i, j]];
  const ops: EditOp[] = [];
  while (i > 0 || j > 0) {
    const mv = t.move[i][j]!;
    if (mv === 'same' || mv === 'sub') {
      ops.push({ move: mv, i, j, text: mv === 'same' ? `${t.a[i - 1]} 그대로` : `${t.a[i - 1]} → ${t.b[j - 1]} 교체` });
      i--;
      j--;
    } else if (mv === 'del') {
      ops.push({ move: mv, i, j, text: `${t.a[i - 1]} 삭제` });
      i--;
    } else {
      ops.push({ move: mv, i, j, text: `${t.b[j - 1]} 삽입` });
      j--;
    }
    cells.push([i, j]);
  }
  return { cells: cells.reverse(), ops: ops.reverse() };
}

export interface EditFrame {
  /** Cells filled so far, in row-major order of the interior (bases are always shown). */
  filled: number;
  cur: [number, number] | null;
  /** Number of path cells shown during the trace-back, counted from the bottom-right corner. */
  path: number;
  note: string;
}

const show = (c: string) => (c === ' ' ? '␣' : c);

/** One frame per interior cell, then one per trace-back step. */
export function editFrames(t: EditTable): EditFrame[] {
  const m = t.a.length;
  const n = t.b.length;
  const frames: EditFrame[] = [{ filled: 0, cur: null, path: 0, note: `첫 행과 첫 열은 기저입니다. 빈 문자열에서 j글자를 만들려면 삽입 j번, i글자를 지우려면 삭제 i번이 듭니다.` }];
  let k = 0;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      k++;
      const x = t.a[i - 1];
      const y = t.b[j - 1];
      const same = x === y;
      const dg = t.d[i - 1][j - 1] + (same ? 0 : 1);
      const dl = t.d[i - 1][j] + 1;
      const is = t.d[i][j - 1] + 1;
      const mv = t.move[i][j]!;
      frames.push({
        filled: k,
        cur: [i, j],
        path: 0,
        note: `${show(x)} 대 ${show(y)}: ${same ? '같음 → 대각선 + 0' : '다름 → 교체'} = ${dg} · 삭제 = ${dl} · 삽입 = ${is} → 최솟값 ${t.d[i][j]} (${MOVE_NAME[mv]})`,
      });
    }
  }
  const { cells } = editPath(t);
  for (let p = 1; p <= cells.length; p++) {
    frames.push({
      filled: m * n,
      cur: null,
      path: p,
      note: p === 1 ? `표가 다 찼습니다. 마지막 칸의 값 = ${t.d[m][n]}, 이것이 편집 거리입니다. 이제 각 칸이 어느 이웃에서 왔는지 거꾸로 따라갑니다.` : p === cells.length ? '맨 위 왼쪽 칸에 도착했습니다. 지나온 길이 곧 편집 순서입니다.' : `한 칸 거슬러 올라감 → ${cells.length - p}칸 남음`,
    });
  }
  return frames;
}

/* ─────────────── Coin change ─────────────── */

/** Minimum number of coins for every amount 0..amount (Infinity if impossible) and the coin that achieved it. */
export function minCoinsTable(coins: readonly number[], amount: number): { dp: number[]; pick: number[] } {
  const cs = [...coins].sort((x, y) => x - y);
  const dp = new Array<number>(amount + 1).fill(Infinity);
  const pick = new Array<number>(amount + 1).fill(0);
  dp[0] = 0;
  for (let x = 1; x <= amount; x++) {
    for (const c of cs) {
      if (c > x) break;
      if (dp[x - c] + 1 < dp[x]) {
        dp[x] = dp[x - c] + 1;
        pick[x] = c;
      }
    }
  }
  return { dp, pick };
}

/** Coins of an optimal solution, largest first, or null when the amount cannot be made. */
export function minCoins(coins: readonly number[], amount: number): number[] | null {
  const { dp, pick } = minCoinsTable(coins, amount);
  if (!isFinite(dp[amount])) return null;
  const out: number[] = [];
  for (let x = amount; x > 0; x -= pick[x]) out.push(pick[x]);
  return out.sort((p, q) => q - p);
}

export interface CoinFrame {
  x: number; // amount being filled (0 = base case only)
  /** Candidates considered for dp[x]: coin c looks at dp[x − c]. */
  cands: { coin: number; from: number; value: number }[];
  /** Amounts on the reconstruction chain shown so far. */
  chain: number[];
  note: string;
}

const fmtDp = (v: number) => (isFinite(v) ? String(v) : '∞');

export function coinFrames(coins: readonly number[], amount: number): CoinFrame[] {
  const cs = [...coins].sort((x, y) => x - y);
  const { dp, pick } = minCoinsTable(cs, amount);
  const frames: CoinFrame[] = [{ x: 0, cands: [], chain: [], note: '기저: 0원을 만드는 데는 동전 0개. 나머지 칸은 아직 모릅니다.' }];
  for (let x = 1; x <= amount; x++) {
    const cands = cs.filter((c) => c <= x).map((c) => ({ coin: c, from: x - c, value: dp[x - c] + 1 }));
    const parts = cands.map((c) => `동전 ${c.coin} → dp[${c.from}]+1 = ${fmtDp(c.value)}`);
    frames.push({
      x,
      cands,
      chain: [],
      note: cands.length ? `${x}원: ${parts.join(' · ')} → ${isFinite(dp[x]) ? `dp[${x}] = ${dp[x]} (동전 ${pick[x]})` : '모두 ∞ → 만들 수 없음'}` : `${x}원: 쓸 수 있는 동전이 없음 → ∞`,
    });
  }
  if (isFinite(dp[amount]) && amount > 0) {
    const chain = [amount];
    for (let x = amount; x > 0; x -= pick[x]) chain.push(x - pick[x]);
    for (let p = 1; p <= chain.length; p++) {
      const used = chain.slice(0, p);
      const coinsSoFar = used.slice(1).map((v, k) => used[k] - v);
      frames.push({
        x: amount,
        cands: [],
        chain: used,
        note: p === chain.length ? `복원 완료: ${amount} = ${coinsSoFar.join(' + ')} → 동전 ${coinsSoFar.length}개` : p === 1 ? `답 복원: 칸 ${amount}에 적어 둔 동전부터 거꾸로 따라갑니다.` : `칸 ${used[p - 2]}: 동전 ${used[p - 2] - used[p - 1]} → 칸 ${used[p - 1]}`,
      });
    }
  }
  return frames;
}

/* ─────────────── Greedy change ─────────────── */

/** Largest coin first, as many as fit. Returns the coins (largest first) and what is left over. */
export function greedyCoins(coins: readonly number[], amount: number): { coins: number[]; left: number } {
  const out: number[] = [];
  let left = amount;
  for (const c of [...coins].sort((x, y) => y - x)) {
    while (left >= c) {
      out.push(c);
      left -= c;
    }
  }
  return { coins: out, left };
}

/** Smallest amount ≤ limit where greedy uses more coins than the optimum or fails although a solution exists. */
export function firstCounterexample(coins: readonly number[], limit: number): number | null {
  const { dp } = minCoinsTable(coins, limit);
  for (let x = 1; x <= limit; x++) {
    if (!isFinite(dp[x])) continue;
    const g = greedyCoins(coins, x);
    if (g.left > 0 || g.coins.length > dp[x]) return x;
  }
  return null;
}

/* ─────────────── Activity selection (회의실 배정) ─────────────── */

export interface Meeting {
  id: string;
  s: number; // start, in half-hour slots from 09:00
  e: number; // end (exclusive)
}

export type Strategy = 'start' | 'short' | 'end';
export const STRATEGY_NAME: Record<Strategy, string> = { start: '빨리 시작', short: '짧은 것', end: '빨리 끝남' };

export const slotTime = (t: number) => {
  const h = 9 + Math.floor(t / 2);
  return `${String(h).padStart(2, '0')}:${t % 2 ? '30' : '00'}`;
};

/** n random meetings between 09:00 and 18:00, named A, B, C… in order of start time. */
export function makeMeetings(n: number, r: () => number, slots = 18): Meeting[] {
  const raw: { s: number; e: number }[] = [];
  while (raw.length < n) {
    // mostly short meetings plus the occasional long one
    const len = r() < 0.2 ? 5 + Math.floor(r() * 4) : 1 + Math.floor(r() * 4);
    const s = Math.floor(r() * (slots - len + 1));
    if (raw.some((m) => m.s === s && m.e === s + len)) continue;
    raw.push({ s, e: s + len });
  }
  raw.sort((p, q) => p.s - q.s || p.e - q.e);
  return raw.map((m, i) => ({ id: String.fromCharCode(65 + i), ...m }));
}

export const overlaps = (p: Meeting, q: Meeting) => p.s < q.e && q.s < p.e;

export function strategyOrder(ms: readonly Meeting[], st: Strategy): Meeting[] {
  const key = (m: Meeting) => (st === 'start' ? m.s : st === 'short' ? m.e - m.s : m.e);
  // ties broken by end time, then start time, so every strategy is deterministic
  return [...ms].sort((p, q) => key(p) - key(q) || p.e - q.e || p.s - q.s);
}

export interface MeetFrame {
  cur: string | null;
  chosen: string[];
  rejected: string[];
  /** Already chosen meeting that the current one collides with. */
  clash: string | null;
  note: string;
}

export function greedyMeetings(ms: readonly Meeting[], st: Strategy): { chosen: Meeting[]; frames: MeetFrame[] } {
  const order = strategyOrder(ms, st);
  const chosen: Meeting[] = [];
  const rejected: string[] = [];
  const keyText = (m: Meeting) => (st === 'start' ? `시작 ${slotTime(m.s)}` : st === 'short' ? `길이 ${(m.e - m.s) * 30}분` : `끝 ${slotTime(m.e)}`);
  const frames: MeetFrame[] = [{ cur: null, chosen: [], rejected: [], clash: null, note: `회의를 ${st === 'start' ? '시작 시각이 이른' : st === 'short' ? '길이가 짧은' : '끝나는 시각이 이른'} 순서로 줄 세웠습니다: ${order.map((m) => m.id).join(' ')}` }];
  for (const m of order) {
    const hit = chosen.find((c) => overlaps(c, m));
    if (hit) rejected.push(m.id);
    else chosen.push(m);
    frames.push({
      cur: m.id,
      chosen: chosen.map((c) => c.id),
      rejected: [...rejected],
      clash: hit ? hit.id : null,
      note: `회의 ${m.id} (${slotTime(m.s)}–${slotTime(m.e)}, ${keyText(m)}): ${hit ? `겹침 (이미 고른 회의 ${hit.id}) → 버림` : '고른 회의와 겹치지 않음 → 선택'}`,
    });
  }
  frames.push({ cur: null, chosen: chosen.map((c) => c.id), rejected: [...rejected], clash: null, note: `끝. 선택: ${chosen.map((c) => c.id).sort().join(', ')} → ${chosen.length}개` });
  return { chosen, frames };
}

/** Largest number of non-overlapping meetings, by trying every subset (only for small n). */
export function bruteForceMax(ms: readonly Meeting[]): number {
  const n = ms.length;
  let best = 0;
  for (let mask = 1; mask < 1 << n; mask++) {
    let cnt = 0;
    let ok = true;
    for (let i = 0; i < n && ok; i++) {
      if (!(mask & (1 << i))) continue;
      cnt++;
      for (let j = i + 1; j < n; j++) if (mask & (1 << j) && overlaps(ms[i], ms[j])) { ok = false; break; }
    }
    if (ok && cnt > best) best = cnt;
  }
  return best;
}

/* ─────────────── Huffman coding ─────────────── */

export interface HNode {
  id: number;
  w: number;
  ch?: string; // leaves only
  l?: number; // child ids
  r?: number;
}

export interface HuffFrame {
  /** Roots of the forest, in priority-queue order (smallest weight first). */
  roots: number[];
  merged: [number, number] | null; // the two roots just merged
  made: number | null; // the new parent
  note: string;
}

export interface Huffman {
  nodes: HNode[];
  frames: HuffFrame[];
  root: number;
  codes: { ch: string; w: number; code: string }[];
  bits: number;
}

export const showChar = (c: string) => (c === ' ' ? '␣' : c === '\n' ? '↵' : c);

/** Character frequencies, most frequent first (ties in order of first appearance). */
export function frequencies(text: string): { ch: string; w: number }[] {
  const m = new Map<string, number>();
  for (const c of chars(text)) m.set(c, (m.get(c) ?? 0) + 1);
  return [...m.entries()].map(([ch, w]) => ({ ch, w })).sort((p, q) => q.w - p.w);
}

/**
 * Build the tree by repeatedly merging the two lightest roots. The queue is a sorted array:
 * a new node goes after every root of equal weight, so ties are resolved by age.
 */
export function huffman(text: string): Huffman {
  const freq = frequencies(text);
  const nodes: HNode[] = [];
  // leaves enter the queue lightest first; equal weights keep the order of first appearance (sort is stable)
  const leaves = freq.map((f) => {
    const node: HNode = { id: nodes.length, w: f.w, ch: f.ch };
    nodes.push(node);
    return node.id;
  });
  let q = [...leaves].sort((p, r) => nodes[p].w - nodes[r].w);
  const label = (id: number) => (nodes[id].ch !== undefined ? `${showChar(nodes[id].ch!)}(${nodes[id].w})` : `[${nodes[id].w}]`);
  const frames: HuffFrame[] = [{ roots: [...q], merged: null, made: null, note: `글자마다 빈도를 센 잎 노드 ${q.length}개를 빈도가 작은 순서로 줄 세웠습니다.` }];
  while (q.length > 1) {
    const [a, b] = q;
    const node: HNode = { id: nodes.length, w: nodes[a].w + nodes[b].w, l: a, r: b };
    nodes.push(node);
    const rest = q.slice(2);
    let k = 0;
    while (k < rest.length && nodes[rest[k]].w <= node.w) k++;
    q = [...rest.slice(0, k), node.id, ...rest.slice(k)];
    frames.push({ roots: [...q], merged: [a, b], made: node.id, note: `가장 작은 두 개 ${label(a)} + ${label(b)} → 새 노드 [${node.w}]. 남은 나무 ${q.length}그루` });
  }
  const root = q[0] ?? -1;
  const codes: { ch: string; w: number; code: string }[] = [];
  const walk = (id: number, code: string) => {
    const nd = nodes[id];
    if (nd.ch !== undefined) codes.push({ ch: nd.ch, w: nd.w, code: code || '0' });
    else {
      walk(nd.l!, code + '0');
      walk(nd.r!, code + '1');
    }
  };
  if (root >= 0) walk(root, '');
  codes.sort((p, r) => r.w - p.w || p.code.length - r.code.length || (p.code < r.code ? -1 : 1));
  const bits = codes.reduce((s, c) => s + c.w * c.code.length, 0);
  if (root >= 0) frames[frames.length - 1].note += frames.length > 1 ? ' → 나무가 하나로 합쳐졌습니다. 왼쪽 가지는 0, 오른쪽 가지는 1입니다.' : '';
  return { nodes, frames, root, codes, bits };
}

/** Bits per symbol for a fixed-length code over k distinct symbols. */
export const fixedBits = (k: number) => (k <= 1 ? 1 : Math.ceil(Math.log2(k)));

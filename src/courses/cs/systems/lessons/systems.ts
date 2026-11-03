/* Pure logic for the 일관된 해싱 and diff lessons: hash rings, load statistics, LCS diff, Myers. Checked outside the browser. */

/* ─────────────── Hashing onto a 32-bit ring ─────────────── */

/** Size of the hash space: positions are integers in [0, 2^32). */
export const RING = 2 ** 32;

/** FNV-1a followed by the MurmurHash3 finalizer, so near-identical names land far apart. Unsigned 32-bit. */
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export const SERVER_NAMES = 'ABCDEFGHIJ'.split('');

/** Hashes of the keys `key-0` … `key-(k-1)`. */
export function keyHashes(k: number, salt = 0): number[] {
  return Array.from({ length: k }, (_, i) => hash32(salt ? `key-${i}@${salt}` : `key-${i}`));
}

/** A ring: every point position, sorted, with the server that owns it. */
export interface Ring {
  pos: number[];
  owner: string[];
}

/** Ring point name for virtual node v of server s. */
export const vnodeName = (s: string, v: number, salt = 0) => (salt ? `${s}#${v}@${salt}` : `${s}#${v}`);

export function buildRing(servers: string[], vnodes: number, salt = 0): Ring {
  const pts: [number, string][] = [];
  for (const s of servers) for (let v = 0; v < vnodes; v++) pts.push([hash32(vnodeName(s, v, salt)), s]);
  pts.sort((x, y) => x[0] - y[0] || (x[1] < y[1] ? -1 : 1));
  return { pos: pts.map((p) => p[0]), owner: pts.map((p) => p[1]) };
}

/** Index of the first ring point at or after h going clockwise, wrapping to 0. Binary search. */
export function successor(ring: Ring, h: number): number {
  let lo = 0;
  let hi = ring.pos.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ring.pos[mid] < h) lo = mid + 1;
    else hi = mid;
  }
  return lo === ring.pos.length ? 0 : lo;
}

export const ringOwner = (ring: Ring, h: number) => ring.owner[successor(ring, h)];
export const modOwner = (h: number, servers: string[]) => servers[h % servers.length];

/** How many keys change owner between two assignments. */
export function movedCount(before: string[], after: string[]): number {
  let c = 0;
  for (let i = 0; i < before.length; i++) if (before[i] !== after[i]) c++;
  return c;
}

/** Share of the ring (0..1) each server owns: point i owns the arc from point i−1 (exclusive) up to point i. */
export function ringShares(ring: Ring, servers: string[]): number[] {
  const share = new Map<string, number>(servers.map((s) => [s, 0]));
  const n = ring.pos.length;
  for (let i = 0; i < n; i++) {
    const prev = i === 0 ? ring.pos[n - 1] - RING : ring.pos[i - 1];
    share.set(ring.owner[i], (share.get(ring.owner[i]) ?? 0) + (ring.pos[i] - prev) / RING);
  }
  return servers.map((s) => share.get(s) ?? 0);
}

export interface LoadStats {
  mean: number;
  max: number;
  min: number;
  /** population standard deviation */
  std: number;
  maxOverMean: number;
  /** std / mean */
  cv: number;
}

export function loadStats(xs: number[]): LoadStats {
  const n = xs.length;
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  const max = Math.max(...xs);
  const min = Math.min(...xs);
  const std = Math.sqrt(xs.reduce((a, x) => a + (x - mean) ** 2, 0) / n);
  return { mean, max, min, std, maxOverMean: max / mean, cv: std / mean };
}

/**
 * Replicas for a key: walk clockwise from its successor and keep the first r distinct servers
 * that are not down. `visited` lists every ring point looked at, with whether it was taken.
 */
export function replicas(ring: Ring, h: number, r: number, down: Set<string> = new Set()): { servers: string[]; visited: { idx: number; taken: boolean }[] } {
  const servers: string[] = [];
  const visited: { idx: number; taken: boolean }[] = [];
  const n = ring.pos.length;
  if (!n) return { servers, visited };
  const start = successor(ring, h);
  for (let step = 0; step < n && servers.length < r; step++) {
    const idx = (start + step) % n;
    const s = ring.owner[idx];
    const take = !down.has(s) && !servers.includes(s);
    if (take) servers.push(s);
    visited.push({ idx, taken: take });
  }
  return { servers, visited };
}

/** What a set of failed servers costs: keys with no copy left, copies to re-create, servers receiving them. */
export function failureImpact(ring: Ring, hashes: number[], r: number, down: Set<string>) {
  let lost = 0;
  let copies = 0;
  let affected = 0;
  const receivers = new Set<string>();
  for (const h of hashes) {
    const before = replicas(ring, h, r).servers;
    const alive = before.filter((s) => !down.has(s));
    if (alive.length === before.length) continue;
    affected++;
    if (!alive.length) {
      lost++;
      continue;
    }
    for (const s of replicas(ring, h, r, down).servers) {
      if (!before.includes(s)) {
        copies++;
        receivers.add(s);
      }
    }
  }
  return { lost, copies, affected, receivers: [...receivers].sort() };
}

/** The HashRing class shown in the lesson's code listing (same behaviour as buildRing + successor). */
export class HashRing {
  pos: number[] = [];
  owner: string[] = [];
  vnodes: number;
  constructor(vnodes = 100) {
    this.vnodes = vnodes;
  }
  add(server: string) {
    for (let v = 0; v < this.vnodes; v++) {
      const p = hash32(vnodeName(server, v));
      const i = this.search(p);
      this.pos.splice(i, 0, p);
      this.owner.splice(i, 0, server);
    }
  }
  remove(server: string) {
    const keep = this.owner.map((s) => s !== server);
    this.pos = this.pos.filter((_, i) => keep[i]);
    this.owner = this.owner.filter((_, i) => keep[i]);
  }
  get(keyHash: number): string | undefined {
    if (!this.pos.length) return undefined;
    const i = this.search(keyHash);
    return this.owner[i === this.pos.length ? 0 : i];
  }
  private search(h: number) {
    let lo = 0;
    let hi = this.pos.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.pos[mid] < h) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
}

/* ─────────────── Line diff: LCS by dynamic programming ─────────────── */

export type DiffKind = 'eq' | 'del' | 'ins';
/** One line of the edit script. `a`/`b` are 0-based line indices (−1 when the line is not in that file). */
export interface DiffOp {
  t: DiffKind;
  a: number;
  b: number;
}

/** L[i][j] = LCS length of a[i..] and b[j..] (suffix table, so the walk forward lists deletions before insertions). */
export function lcsSuffixTable<T>(a: T[], b: T[]): Int32Array[] {
  const n = a.length;
  const m = b.length;
  const L = Array.from({ length: n + 1 }, () => new Int32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
    }
  }
  return L;
}

export function lcsDiff<T>(a: T[], b: T[]): DiffOp[] {
  const L = lcsSuffixTable(a, b);
  const ops: DiffOp[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) ops.push({ t: 'eq', a: i++, b: j++ });
    else if (j >= b.length || (i < a.length && L[i + 1][j] >= L[i][j + 1])) ops.push({ t: 'del', a: i++, b: -1 });
    else ops.push({ t: 'ins', a: -1, b: j++ });
  }
  return ops;
}

export interface HunkLine {
  t: DiffKind;
  text: string;
  oldNo: number | null;
  newNo: number | null;
}
export interface Hunk {
  header: string;
  lines: HunkLine[];
}

/** `@@ -s,c` part: count 1 is omitted, an empty range names the line before it (as GNU diff and Git print it). */
function range(before: number, count: number): string {
  const start = count === 0 ? before : before + 1;
  return count === 1 ? String(start) : `${start},${count}`;
}

/** Group an edit script into unified-diff hunks with `context` unchanged lines around each change. */
export function unifiedHunks(a: string[], b: string[], ops: DiffOp[], context: number): Hunk[] {
  const change = ops.map((o) => o.t !== 'eq');
  const n = ops.length;
  // distance (in ops) to the nearest change on either side
  const near = new Array<boolean>(n).fill(false);
  let last = -Infinity;
  for (let p = 0; p < n; p++) {
    if (change[p]) last = p;
    if (p - last <= context) near[p] = true;
  }
  last = Infinity;
  for (let p = n - 1; p >= 0; p--) {
    if (change[p]) last = p;
    if (last - p <= context) near[p] = true;
  }
  const hunks: Hunk[] = [];
  let aSeen = 0;
  let bSeen = 0;
  let p = 0;
  while (p < n) {
    if (!near[p]) {
      if (ops[p].t !== 'ins') aSeen++;
      if (ops[p].t !== 'del') bSeen++;
      p++;
      continue;
    }
    const a0 = aSeen;
    const b0 = bSeen;
    const lines: HunkLine[] = [];
    while (p < n && near[p]) {
      const o = ops[p];
      if (o.t === 'eq') lines.push({ t: 'eq', text: a[o.a], oldNo: ++aSeen, newNo: ++bSeen });
      else if (o.t === 'del') lines.push({ t: 'del', text: a[o.a], oldNo: ++aSeen, newNo: null });
      else lines.push({ t: 'ins', text: b[o.b], oldNo: null, newNo: ++bSeen });
      p++;
    }
    hunks.push({ header: `@@ -${range(a0, aSeen - a0)} +${range(b0, bSeen - b0)} @@`, lines });
  }
  return hunks;
}

/* ─────────────── Myers: furthest-reaching D-paths ─────────────── */

export type Pt = [number, number]; // [x, y]: x lines of A and y lines of B consumed

/** One evaluation of diagonal k (= x − y) at cost d: one edit from `from` to `mid`, then a free slide to `end`. */
export interface MyersStep {
  d: number;
  k: number;
  from: Pt | null;
  mid: Pt;
  end: Pt;
  /** 'ins' = took a line of B (y + 1), 'del' = dropped a line of A (x + 1), null for the start */
  edit: 'ins' | 'del' | null;
}

export interface MyersResult {
  d: number;
  /** points touched: one per (d, k) evaluation plus every diagonal step slid */
  work: number;
  steps: MyersStep[];
  /** grid points of the final path from (0,0) to (N,M), every unit move */
  path: Pt[];
}

/**
 * Myers' greedy O((N+M)·D) shortest edit script, exactly as in the paper. Some evaluations land outside
 * the grid (x > N or y > M); those can never reach (N, M), so they are neither counted nor recorded.
 */
export function myers<T>(a: ArrayLike<T>, b: ArrayLike<T>, record = true): MyersResult {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  const off = max + 1;
  const V = new Int32Array(2 * max + 3);
  V[off + 1] = 0;
  const steps: MyersStep[] = [];
  const byDK = new Map<string, MyersStep>();
  let work = 0;
  for (let d = 0; d <= max; d++) {
    for (let k = -d; k <= d; k += 2) {
      let x: number;
      let edit: 'ins' | 'del';
      // from diagonal k+1 by taking a line of B (x stays), or from k−1 by dropping a line of A (x + 1)
      if (k === -d || (k !== d && V[off + k - 1] < V[off + k + 1])) {
        x = V[off + k + 1];
        edit = 'ins';
      } else {
        x = V[off + k - 1] + 1;
        edit = 'del';
      }
      let y = x - k;
      const inside = x <= n && y <= m;
      const mid: Pt = [x, y];
      if (inside) work++;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
        work++;
      }
      V[off + k] = x;
      if (record && inside) {
        const from: Pt | null = d === 0 ? null : edit === 'ins' ? [mid[0], mid[1] - 1] : [mid[0] - 1, mid[1]];
        const st: MyersStep = { d, k, from, mid, end: [x, y], edit: d === 0 ? null : edit };
        steps.push(st);
        byDK.set(`${d},${k}`, st);
      }
      if (x >= n && y >= m) {
        const path: Pt[] = [];
        if (record) {
          // walk back through the recorded steps
          let cur: MyersStep | undefined = byDK.get(`${d},${k}`);
          const rev: Pt[] = [];
          while (cur) {
            for (let s = cur.end[0]; s >= cur.mid[0]; s--) rev.push([s, s - cur.k]);
            if (!cur.edit) break;
            const pk = cur.edit === 'ins' ? cur.k + 1 : cur.k - 1;
            cur = byDK.get(`${cur.d - 1},${pk}`);
          }
          for (let s = rev.length - 1; s >= 0; s--) path.push(rev[s]);
        }
        return { d, work, steps, path };
      }
    }
  }
  return { d: max, work, steps, path: [] };
}

/** Edit script from a monotone grid path (unit moves only). */
export function pathOps(path: Pt[]): DiffOp[] {
  const ops: DiffOp[] = [];
  for (let s = 1; s < path.length; s++) {
    const [x0, y0] = path[s - 1];
    const [x1, y1] = path[s];
    if (x1 > x0 && y1 > y0) ops.push({ t: 'eq', a: x0, b: y0 });
    else if (x1 > x0) ops.push({ t: 'del', a: x0, b: -1 });
    else ops.push({ t: 'ins', a: -1, b: y0 });
  }
  return ops;
}

/** LCS length with two rows; also returns how many table cells it filled. */
export function lcsLength(a: ArrayLike<number>, b: ArrayLike<number>): { len: number; cells: number } {
  const n = a.length;
  const m = b.length;
  let prev = new Int32Array(m + 1);
  let cur = new Int32Array(m + 1);
  for (let i = 1; i <= n; i++) {
    const ai = a[i - 1];
    for (let j = 1; j <= m; j++) {
      cur[j] = ai === b[j - 1] ? prev[j - 1] + 1 : prev[j] > cur[j - 1] ? prev[j] : cur[j - 1];
    }
    const t = prev;
    prev = cur;
    cur = t;
  }
  return { len: prev[m], cells: (n + 1) * (m + 1) };
}

/**
 * A synthetic source file of n lines (as line ids; some lines repeat, like "}" and blank lines)
 * and a copy with `changes` edits at distinct places: each one modifies, deletes or inserts a line.
 */
export function editedFiles(n: number, changes: number, r: () => number): { a: Int32Array; b: Int32Array } {
  const a = new Int32Array(n);
  let fresh = 10;
  for (let i = 0; i < n; i++) {
    const u = r();
    a[i] = u < 0.1 ? 1 : u < 0.16 ? 2 : fresh++; // 1 = "}", 2 = blank line
  }
  const at = new Set<number>();
  const c = Math.min(changes, n);
  while (at.size < c) at.add(Math.floor(r() * n));
  const b: number[] = [];
  for (let i = 0; i < n; i++) {
    if (!at.has(i)) {
      b.push(a[i]);
      continue;
    }
    const u = r();
    if (u < 0.5) b.push(fresh++); // modify = delete + insert
    else if (u < 0.75) continue; // delete
    else b.push(fresh++, a[i]); // insert before
  }
  return { a, b: Int32Array.from(b) };
}

/* ─────────────── Presets for the line-diff figure ─────────────── */

export const DIFF_PRESETS: { value: string; label: string; file: string; a: string; b: string }[] = [
  {
    value: 'fn',
    label: '함수',
    file: 'total.js',
    a: `function total(items) {
  let sum = 0;
  for (let i = 0; i < items.length; i++) {
    sum += items[i].price;
  }
  return sum;
}`,
    b: `function total(items, taxRate = 0) {
  let sum = 0;
  for (const item of items) {
    sum += item.price * item.qty;
  }
  const tax = sum * taxRate;
  return sum + tax;
}`,
  },
  {
    value: 'config',
    label: '설정',
    file: 'config.yml',
    a: `port: 8080
host: localhost
debug: true
cache:
  size: 100
  ttl: 60
log: info`,
    b: `port: 8080
host: 0.0.0.0
cache:
  size: 500
  ttl: 60
  policy: lru
log: info`,
  },
  {
    value: 'move',
    label: '줄 옮기기',
    file: 'run.js',
    a: `import { a } from './a';
import { b } from './b';
import { c } from './c';

export function run() {
  a();
  b();
  c();
}`,
    b: `import { a } from './a';
import { b } from './b';
import { c } from './c';

export function run() {
  c();
  a();
  b();
}`,
  },
];

/** Text → lines; a final newline does not start an extra empty line. */
export function splitLines(s: string, maxLines = 40): string[] {
  if (!s.length) return [];
  const lines = s.split('\n');
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  return lines.slice(0, maxLines);
}

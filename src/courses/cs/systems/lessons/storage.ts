/* Pure logic for the "저장 구조" part: dynamic arrays (amortized analysis), B-trees and index cost models. */

/* ─────────────── Number formatting ─────────────── */

/** 1234 → "1,234", 3.2e5 → "32만", 6.2e10 → "625억" */
export function fmtKo(v: number): string {
  if (v < 1e4) return Math.round(v).toLocaleString('ko-KR');
  const unit = (d: number, u: string) => {
    const x = v / d;
    return `${x < 10 ? Math.round(x * 10) / 10 : Math.round(x).toLocaleString('ko-KR')}${u}`;
  };
  if (v < 1e8) return unit(1e4, '만');
  if (v < 1e12) return unit(1e8, '억');
  return unit(1e12, '조');
}

/* ─────────────── Dynamic array: growth policies ─────────────── */

export type Growth = { kind: 'mul'; f: number } | { kind: 'add'; k: number };

export const growthLabel = (g: Growth) => (g.kind === 'mul' ? `×${g.f}` : `+${g.k}`);

/** Every array in this lesson starts with room for one element. */
export const CAP0 = 1;

/** Capacity of the new block when a full block of `cap` slots must grow. Multiplicative growth rounds up, so it grows by at least the factor. */
export function grow(cap: number, g: Growth): number {
  return g.kind === 'mul' ? Math.max(cap + 1, Math.ceil(cap * g.f)) : cap + g.k;
}

export interface PushStep {
  size: number; // after this push
  cap: number; // after this push
  copies: number; // elements moved to a new block during this push
  cost: number; // 1 (write the new element) + copies
}

/** Push n elements one at a time into an empty array (capacity CAP0). */
export function pushTrace(n: number, g: Growth): PushStep[] {
  const out: PushStep[] = [];
  let cap = CAP0;
  for (let size = 0; size < n; size++) {
    let copies = 0;
    if (size === cap) {
      copies = size;
      cap = grow(cap, g);
    }
    out.push({ size: size + 1, cap, copies, cost: 1 + copies });
  }
  return out;
}

/**
 * The whole capacity sequence CAP0 = c0 < c1 < … up to nMax, with prefix sums, so that
 * "total copies after n pushes" is a binary search instead of n steps.
 * A block of capacity c is copied exactly when the (c+1)-th element arrives, so
 * copies(n) = Σ c_j over every c_j ≤ n − 1.
 */
export class GrowthCurve {
  caps: number[] = [];
  prefix: number[] = [0];
  constructor(g: Growth, nMax: number) {
    let c = CAP0;
    for (;;) {
      this.caps.push(c);
      this.prefix.push(this.prefix[this.prefix.length - 1] + c);
      if (c >= nMax) break;
      c = grow(c, g);
    }
  }
  /** number of caps ≤ x */
  private countLE(x: number): number {
    let lo = 0;
    let hi = this.caps.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.caps[mid] <= x) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
  copies(n: number): number {
    return this.prefix[this.countLE(n - 1)];
  }
  /** capacity after n ≥ 1 pushes: the first c_j ≥ n */
  cap(n: number): number {
    return this.caps[Math.min(this.caps.length - 1, this.countLE(n - 1))];
  }
  /** unused fraction of the block after n pushes */
  waste(n: number): number {
    const c = this.cap(n);
    return (c - n) / c;
  }
  /** largest unused fraction seen at any m in [from, n]; it peaks right after each grow, at m = c_j + 1 */
  peakWaste(n: number, from = 1): number {
    let best = Math.max(this.waste(n), this.waste(Math.max(1, Math.min(n, from))));
    for (let j = 0; j + 1 < this.caps.length && this.caps[j] + 1 <= n; j++) {
      if (this.caps[j] + 1 < from) continue;
      const c = this.caps[j + 1];
      best = Math.max(best, (c - this.caps[j] - 1) / c);
    }
    return best;
  }
}

/* ─────────────── Dynamic array: shrinking ─────────────── */

export type ShrinkRule = 'none' | 'half' | 'quarter';
export type OpPattern = 'alt' | 'random' | 'wave';

export interface OpStep {
  op: 'push' | 'pop';
  size: number; // after the op
  cap: number; // after the op
  copies: number;
  cost: number;
}

export const SHRINK_START = 64;

/**
 * Start with a full block (size = cap = 64), grow ×2 when full, and after each pop
 * shrink to half capacity when size ≤ cap/2 ('half') or size ≤ cap/4 ('quarter').
 */
export function shrinkSim(rule: ShrinkRule, pattern: OpPattern, ops: number, r: () => number): OpStep[] {
  let size = SHRINK_START;
  let cap = SHRINK_START;
  let dir: 'push' | 'pop' = 'pop'; // for the wave pattern
  const out: OpStep[] = [];
  for (let t = 0; t < ops; t++) {
    let op: 'push' | 'pop';
    if (pattern === 'alt') op = t % 2 === 0 ? 'push' : 'pop';
    else if (pattern === 'random') op = size === 0 || r() < 0.5 ? 'push' : 'pop';
    else {
      if (size <= 16) dir = 'push';
      else if (size >= SHRINK_START) dir = 'pop';
      op = dir;
    }
    let copies = 0;
    if (op === 'push') {
      if (size === cap) {
        copies = size;
        cap *= 2;
      }
      size++;
    } else {
      size--;
      const limit = rule === 'half' ? cap / 2 : rule === 'quarter' ? cap / 4 : -1;
      if (cap > 1 && size <= limit) {
        copies = size;
        cap /= 2;
      }
    }
    out.push({ op, size, cap, copies, cost: 1 + copies });
  }
  return out;
}

/* ─────────────── B-tree ─────────────── */

export interface BNode {
  keys: number[];
  kids: BNode[]; // empty for a leaf
}

/** child indices from the root */
export type Path = number[];

export type MarkRole = 'visit' | 'over' | 'split' | 'found' | 'miss';

export interface BFrame {
  tree: BNode | null;
  marks: { path: Path; role: MarkRole }[];
  key?: { path: Path; value: number }; // one key cell to highlight
  note: string;
}

export const cloneTree = (n: BNode): BNode => ({ keys: [...n.keys], kids: n.kids.map(cloneTree) });

const isLeaf = (n: BNode) => n.kids.length === 0;
const fmtKeys = (n: BNode) => `[${n.keys.join(' ')}]`;

/** first index i with keys[i] ≥ k (keys.length if none) */
function slot(keys: readonly number[], k: number): number {
  let i = 0;
  while (i < keys.length && keys[i] < k) i++;
  return i;
}

/** "a < k < b" for the gap i that k falls into */
function where(keys: readonly number[], i: number, k: number): string {
  if (i === 0) return `${k} < ${keys[0]}`;
  if (i === keys.length) return `${k} > ${keys[i - 1]}`;
  return `${keys[i - 1]} < ${k} < ${keys[i]}`;
}

export function nodeAt(root: BNode, p: Path): BNode {
  let n = root;
  for (const i of p) n = n.kids[i];
  return n;
}

export interface InsertResult {
  root: BNode;
  frames: BFrame[];
  visits: number;
  splits: number;
  added: boolean;
}

/** Insert k into a B-tree whose nodes hold at most `maxKeys` keys, splitting overfull nodes on the way back up. `root` is not modified. */
export function bInsert(root: BNode | null, k: number, maxKeys: number): InsertResult {
  if (!root) {
    const t = { keys: [k], kids: [] };
    return { root: t, frames: [{ tree: cloneTree(t), marks: [{ path: [], role: 'visit' }], key: { path: [], value: k }, note: `빈 트리 → 키 ${k} 하나로 루트(잎)를 만듦` }], visits: 1, splits: 0, added: true };
  }
  let top = cloneTree(root);
  const frames: BFrame[] = [];
  const snap = (marks: BFrame['marks'], note: string, key?: BFrame['key']) => frames.push({ tree: cloneTree(top), marks, key, note });
  const stack: BNode[] = [];
  const p: Path = [];
  let node = top;
  let visits = 0;
  for (;;) {
    stack.push(node);
    visits++;
    const i = slot(node.keys, k);
    if (node.keys[i] === k) {
      snap([{ path: [...p], role: 'found' }], `키 ${k} 이미 있음 → 넣지 않음`, { path: [...p], value: k });
      return { root, frames, visits, splits: 0, added: false };
    }
    if (isLeaf(node)) {
      node.keys.splice(i, 0, k);
      const over = node.keys.length > maxKeys;
      snap([{ path: [...p], role: over ? 'over' : 'visit' }], over ? `키 ${k} → 잎에 넣음. 키 ${node.keys.length}개로 최대 ${maxKeys}개를 넘음` : `키 ${k} → 잎에 넣음. 키 ${node.keys.length}개, 자리가 있으니 완료`, { path: [...p], value: k });
      break;
    }
    snap([{ path: [...p], role: 'visit' }], `노드 ${fmtKeys(node)}: ${where(node.keys, i, k)} → 자식 ${i + 1}번으로`);
    p.push(i);
    node = node.kids[i];
  }

  let splits = 0;
  for (let level = stack.length - 1; level >= 0 && stack[level].keys.length > maxKeys; level--) {
    const n = stack[level];
    const mid = Math.floor(n.keys.length / 2);
    const median = n.keys[mid];
    const left: BNode = { keys: n.keys.slice(0, mid), kids: n.kids.slice(0, mid + 1) };
    const right: BNode = { keys: n.keys.slice(mid + 1), kids: n.kids.slice(mid + 1) };
    splits++;
    if (level === 0) {
      top = { keys: [median], kids: [left, right] };
      snap(
        [
          { path: [0], role: 'split' },
          { path: [1], role: 'split' },
          { path: [], role: 'visit' },
        ],
        `루트가 넘침 → 가운데 키 ${median} 하나로 새 루트를 만듦. 트리가 한 층 높아짐`,
        { path: [], value: median },
      );
      break;
    }
    const parent = stack[level - 1];
    const pp = p.slice(0, level - 1);
    const j = p[level - 1];
    parent.keys.splice(j, 0, median);
    parent.kids.splice(j, 1, left, right);
    const over = parent.keys.length > maxKeys;
    snap(
      [
        { path: [...pp, j], role: 'split' },
        { path: [...pp, j + 1], role: 'split' },
        { path: pp, role: over ? 'over' : 'visit' },
      ],
      `둘로 나누고 가운데 키 ${median} → 부모로 올림. 부모 키 ${parent.keys.length}개` + (over ? `, 부모도 넘침` : ', 완료'),
      { path: pp, value: median },
    );
  }
  return { root: top, frames, visits, splits, added: true };
}

export interface SearchResult {
  frames: BFrame[];
  visits: number;
  found: boolean;
}

export function bSearch(root: BNode | null, k: number): SearchResult {
  if (!root) return { frames: [{ tree: null, marks: [], note: '트리가 비어 있음' }], visits: 0, found: false };
  const frames: BFrame[] = [];
  const tree = cloneTree(root);
  const p: Path = [];
  let node = root;
  let visits = 0;
  for (;;) {
    visits++;
    const i = slot(node.keys, k);
    if (node.keys[i] === k) {
      frames.push({ tree, marks: [{ path: [...p], role: 'found' }], key: { path: [...p], value: k }, note: `노드 ${fmtKeys(node)}: 키 ${k} 찾음 (읽은 노드 ${visits}개)` });
      return { frames, visits, found: true };
    }
    if (isLeaf(node)) {
      frames.push({ tree, marks: [{ path: [...p], role: 'miss' }], note: `잎 ${fmtKeys(node)}: 키 ${k} 없음 → 찾는 값이 트리에 없음 (읽은 노드 ${visits}개)` });
      return { frames, visits, found: false };
    }
    frames.push({ tree, marks: [{ path: [...p], role: 'visit' }], note: `노드 ${fmtKeys(node)}: ${where(node.keys, i, k)} → 자식 ${i + 1}번으로 (읽은 노드 ${visits}개)` });
    p.push(i);
    node = node.kids[i];
  }
}

export function bBuild(keys: readonly number[], maxKeys: number): BNode | null {
  let t: BNode | null = null;
  for (const k of keys) t = bInsert(t, k, maxKeys).root;
  return t;
}

export function bHeight(n: BNode | null): number {
  let h = 0;
  while (n) {
    h++;
    n = n.kids.length ? n.kids[0] : null;
  }
  return h;
}

export function bCount(n: BNode | null): { nodes: number; keys: number } {
  if (!n) return { nodes: 0, keys: 0 };
  let nodes = 1;
  let keys = n.keys.length;
  for (const c of n.kids) {
    const r = bCount(c);
    nodes += r.nodes;
    keys += r.keys;
  }
  return { nodes, keys };
}

/** In-order keys. */
export function bKeys(n: BNode | null, out: number[] = []): number[] {
  if (!n) return out;
  n.keys.forEach((k, i) => {
    if (n.kids.length) bKeys(n.kids[i], out);
    out.push(k);
  });
  if (n.kids.length) bKeys(n.kids[n.kids.length - 1], out);
  return out;
}

/** B-tree invariants: sorted keys, ≤ maxKeys per node, ≥ 1 key in non-root nodes, kids = keys + 1, all leaves at one depth. */
export function bValid(root: BNode | null, maxKeys: number): boolean {
  if (!root) return true;
  const ks = bKeys(root);
  for (let i = 1; i < ks.length; i++) if (ks[i - 1] >= ks[i]) return false;
  const minKeys = Math.ceil((maxKeys + 1) / 2) - 1;
  let leafDepth = -1;
  const walk = (n: BNode, d: number, isRoot: boolean): boolean => {
    if (n.keys.length > maxKeys || n.keys.length < (isRoot ? 1 : minKeys)) return false;
    if (n.kids.length && n.kids.length !== n.keys.length + 1) return false;
    if (!n.kids.length) {
      if (leafDepth < 0) leafDepth = d;
      return leafDepth === d;
    }
    return n.kids.every((c) => walk(c, d + 1, false));
  };
  return walk(root, 0, true);
}

export interface LaidNode {
  node: BNode;
  path: Path;
  depth: number;
  x: number; // left edge, in key-cell units
  w: number; // width in key-cell units
}

/** Leaves side by side (a small gap between siblings, a bigger one between families), parents centred over their children. */
export function bLayout(root: BNode, gap = 0.5, familyGap = 0.9): { nodes: LaidNode[]; width: number } {
  const nodes: LaidNode[] = [];
  let cursor = 0;
  let lastParent: BNode | null = null;
  const place = (n: BNode, path: Path, depth: number, parent: BNode | null): LaidNode => {
    const w = Math.max(1, n.keys.length);
    let x: number;
    if (!n.kids.length) {
      if (nodes.some((m) => !m.node.kids.length)) cursor += parent === lastParent ? gap : familyGap;
      lastParent = parent;
      x = cursor;
      cursor += w;
    } else {
      const kids = n.kids.map((c, i) => place(c, [...path, i], depth + 1, n));
      const a = kids[0].x;
      const b = kids[kids.length - 1].x + kids[kids.length - 1].w;
      x = (a + b) / 2 - w / 2;
    }
    const laid = { node: n, path, depth, x, w };
    nodes.push(laid);
    return laid;
  };
  place(root, [], 0, null);
  return { nodes, width: cursor };
}

export const samePath = (a: Path, b: Path) => a.length === b.length && a.every((v, i) => v === b[i]);

/* ─────────────── Tree heights ─────────────── */

/** Levels of a perfectly balanced binary search tree holding n keys: smallest L with 2^L − 1 ≥ n. */
export function binaryLevels(n: number): number {
  let L = 0;
  let cap = 0;
  while (cap < n) {
    cap = cap * 2 + 1;
    L++;
  }
  return L;
}

/** Levels of a B+tree whose every page holds up to f entries: smallest L with f^L ≥ n. */
export function bplusLevels(n: number, f: number): number {
  let L = 1;
  let cap = f;
  while (cap < n) {
    cap *= f;
    L++;
  }
  return L;
}

/* ─────────────── Index vs full scan: page reads ─────────────── */

export interface IndexCost {
  scan: number; // pages read by a full table scan (sequential)
  descend: number; // index pages read on the way down from the root
  leaves: number; // further index leaf pages walked along the linked list
  heap: number; // pages that hold the matching rows
  index: number; // descend + leaves + heap
}

/**
 * A table of N rows, `rowsPerPage` per page, with a B+tree index whose pages hold `keysPerPage` entries.
 * The query matches `matches` rows that are adjacent in key order.
 * - not clustered: the index leaves hold (key, row location) and the rows sit in a separate, unordered table.
 *   Descend to the first leaf, walk the leaves, and fetch each matching row; each row is assumed to be on a
 *   different page and nothing is cached.
 * - clustered: the rows themselves live in the leaves in key order (like InnoDB's primary key), so after the
 *   internal pages the matching rows fill consecutive leaf pages.
 */
export function indexCost(N: number, matches: number, clustered: boolean, rowsPerPage = 100, keysPerPage = 500): IndexCost {
  const scan = Math.ceil(N / rowsPerPage);
  if (clustered) {
    const descend = scan > 1 ? bplusLevels(scan, keysPerPage) : 0;
    const heap = Math.max(1, Math.ceil(matches / rowsPerPage));
    return { scan, descend, leaves: 0, heap, index: descend + heap };
  }
  const descend = bplusLevels(N, keysPerPage);
  const leaves = Math.max(0, Math.ceil(matches / keysPerPage) - 1);
  const heap = matches;
  return { scan, descend, leaves, heap, index: descend + leaves + heap };
}

/**
 * Cost with PostgreSQL-style weights: a sequential page read costs 1 and a random one `random`
 * (PostgreSQL's defaults are seq_page_cost = 1, random_page_cost = 4).
 * The full scan is sequential; walking down the index and fetching scattered rows are random;
 * in a clustered index the matching leaf pages are read one after another, so they count as sequential.
 */
export function weighted(c: IndexCost, clustered: boolean, random: number): { scan: number; index: number } {
  return { scan: c.scan, index: (c.descend + c.leaves) * random + c.heap * (clustered ? 1 : random) };
}

/** Smallest number of matching rows at which the index costs at least as much as a full scan (N + 1 if never). */
export function crossover(N: number, clustered: boolean, random: number): number {
  const worse = (m: number) => {
    const w = weighted(indexCost(N, m, clustered), clustered, random);
    return w.index >= w.scan;
  };
  if (!worse(N)) return N + 1;
  let lo = 1;
  let hi = N;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (worse(mid)) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/* Pure logic for the union-find / MST and topological-sort lessons, kept apart from the figures so it can be checked outside the browser. */

import { rng } from '../../../../lib/math';

/* ─────────────── Union-find ─────────────── */

export type UFOp = { kind: 'union'; a: number; b: number } | { kind: 'find'; x: number };
export interface UFOptions {
  compress: boolean;
  bySize: boolean;
}

/** One find walk: the parent array it walked on and the path node → … → root. */
export interface UFWalk {
  parent: number[];
  path: number[];
}

export interface UFState {
  parent: number[];
  size: number[]; // meaningful at roots only
  hops: number; // pointer hops over every op so far
  last: null | { op: UFOp; walks: UFWalk[]; steps: number; note: string };
}

export const ufInit = (n: number): UFState => ({ parent: Array.from({ length: n }, (_, i) => i), size: Array(n).fill(1), hops: 0, last: null });

/** node, parent[node], …, root */
export function ufPath(parent: readonly number[], x: number): number[] {
  const p = [x];
  while (parent[x] !== x) {
    x = parent[x];
    p.push(x);
  }
  return p;
}

export const ufRoot = (parent: readonly number[], x: number) => {
  while (parent[x] !== x) x = parent[x];
  return x;
};

/** Find with optional path compression. Mutates `parent`; returns the walk (taken before compression). */
function find(parent: number[], x: number, compress: boolean): { root: number; walk: UFWalk; moved: number } {
  const walk = { parent: [...parent], path: ufPath(parent, x) };
  const root = walk.path[walk.path.length - 1];
  let moved = 0;
  if (compress)
    for (const v of walk.path)
      if (parent[v] !== root) {
        parent[v] = root;
        moved++;
      }
  return { root, walk, moved };
}

const squash = (moved: number) => (moved ? ` · 경로 압축: 노드 ${moved}개가 루트를 바로 가리키게 됨` : '');

export function ufApply(st: UFState, op: UFOp, o: UFOptions): UFState {
  const parent = [...st.parent];
  const size = [...st.size];
  if (op.kind === 'find') {
    const f = find(parent, op.x, o.compress);
    const steps = f.walk.path.length - 1;
    const note = `find(${op.x}): ${f.walk.path.join(' → ')} · 포인터 ${steps}번 따라감${squash(f.moved)}`;
    return { parent, size, hops: st.hops + steps, last: { op, walks: [f.walk], steps, note } };
  }
  const fa = find(parent, op.a, o.compress);
  const fb = find(parent, op.b, o.compress);
  const steps = fa.walk.path.length - 1 + (fb.walk.path.length - 1);
  const head = `union(${op.a}, ${op.b}): 루트 ${fa.root}, ${fb.root}`;
  const moved = squash(fa.moved + fb.moved);
  let note: string;
  if (fa.root === fb.root) note = `${head} → 이미 같은 그룹, 그대로 둠${moved}`;
  else {
    const sa = size[fa.root];
    const sb = size[fb.root];
    // naive: a's root always goes under b's root; by size: the smaller tree goes under (ties as naive)
    let child = fa.root;
    let top = fb.root;
    if (o.bySize && sa > sb) [child, top] = [fb.root, fa.root];
    parent[child] = top;
    size[top] += size[child];
    note = o.bySize
      ? `${head} · 크기 ${sa}, ${sb} → ${sa === sb ? '크기가 같으니 첫째 루트를' : '작은 쪽 루트를'} 아래에: parent[${child}] = ${top}${moved}`
      : `${head} → 첫째 루트를 둘째 루트 아래에: parent[${child}] = ${top}${moved}`;
  }
  return { parent, size, hops: st.hops + steps, last: { op, walks: [fa.walk, fb.walk], steps, note } };
}

export function ufReplay(n: number, ops: readonly UFOp[], o: UFOptions): UFState {
  let st = ufInit(n);
  for (const op of ops) st = ufApply(st, op, o);
  return st;
}

/** Longest root-to-node distance over the whole forest. */
export const ufHeight = (parent: readonly number[]) => Math.max(0, ...parent.map((_, i) => ufPath(parent, i).length - 1));
export const ufGroups = (parent: readonly number[]) => parent.filter((p, i) => p === i).length;

export interface UFFrame {
  parent: number[];
  hot: number[]; // nodes on the walk so far
  root: number | null; // reached root, once the walk is complete
  note: string;
}

/** Frames that walk each find path one pointer at a time, then show the forest after the op. */
export function ufFrames(st: UFState): UFFrame[] {
  if (!st.last) return [{ parent: st.parent, hot: [], root: null, note: '두 원소를 골라 합치거나, 노드를 눌러 find를 해 보세요.' }];
  const out: UFFrame[] = [];
  for (const w of st.last.walks)
    for (let k = 1; k <= w.path.length; k++)
      out.push({ parent: w.parent, hot: w.path.slice(0, k), root: k === w.path.length ? w.path[k - 1] : null, note: `${w.path[0]}에서 출발해 부모를 따라 올라감: ${w.path.slice(0, k).join(' → ')}${k === w.path.length ? ' (루트)' : ''}` });
  const allHot = [...new Set(st.last.walks.flatMap((w) => w.path))];
  const op = st.last.op;
  out.push({ parent: st.parent, hot: allHot, root: ufRoot(st.parent, op.kind === 'find' ? op.x : op.a), note: st.last.note });
  return out;
}

/* ─────────────── Weighted graphs in the plane ─────────────── */

export const LETTERS = 'ABCDEFGHIJKLMNOP';

export interface WEdge {
  u: number;
  v: number;
  w: number;
}
export interface WGraph {
  pts: [number, number][];
  edges: WEdge[];
  W: number;
  H: number;
}

export const edgeName = (e: WEdge) => `${LETTERS[e.u]}–${LETTERS[e.v]}`;

function cross(a: [number, number], b: [number, number], c: [number, number], d: [number, number]): boolean {
  const o = (p: [number, number], q: [number, number], r: [number, number]) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
}

/** Disjoint-set forest used by the graph builders below (size + path compression). */
export class DSU {
  p: number[];
  s: number[];
  constructor(n: number) {
    this.p = Array.from({ length: n }, (_, i) => i);
    this.s = Array(n).fill(1);
  }
  find(x: number): number {
    while (this.p[x] !== x) {
      this.p[x] = this.p[this.p[x]];
      x = this.p[x];
    }
    return x;
  }
  union(a: number, b: number): boolean {
    let ra = this.find(a);
    let rb = this.find(b);
    if (ra === rb) return false;
    if (this.s[ra] < this.s[rb]) [ra, rb] = [rb, ra];
    this.p[rb] = ra;
    this.s[ra] += this.s[rb];
    return true;
  }
}

/**
 * n random points in a W×H box, joined to their nearest neighbours without crossings, made connected.
 * Weight = rounded distance, bumped by 1 where needed so that all weights are distinct (the MST is then unique).
 */
export function makeWGraph(seed: number, n = 10, W = 100, H = 56): WGraph {
  const r = rng(seed);
  const pts: [number, number][] = [];
  for (let tries = 0; pts.length < n && tries < 5000; tries++) {
    const p: [number, number] = [4 + r() * (W - 8), 4 + r() * (H - 8)];
    if (pts.every((q) => Math.hypot(p[0] - q[0], p[1] - q[1]) > 15)) pts.push(p);
  }
  const d = (i: number, j: number) => Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]);
  const all: [number, number][] = [];
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) all.push([i, j]);
  all.sort((a, b) => d(...a) - d(...b));
  const near = pts.map((_, i) =>
    pts
      .map((_, j) => j)
      .filter((j) => j !== i)
      .sort((a, b) => d(i, a) - d(i, b))
      .slice(0, 3),
  );
  // distance from point p to segment a–b
  const segDist = (p: [number, number], a: [number, number], b: [number, number]) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
    return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
  };
  const chosen: [number, number][] = [];
  // no crossings, and no edge grazing a third node (it would look like it ends there)
  const ok = ([a, b]: [number, number]) =>
    pts.every((p, i) => i === a || i === b || segDist(p, pts[a], pts[b]) > 6) && chosen.every(([c, e]) => a === c || a === e || b === c || b === e || !cross(pts[a], pts[b], pts[c], pts[e]));
  for (const pr of all) if ((near[pr[0]].includes(pr[1]) || near[pr[1]].includes(pr[0])) && ok(pr)) chosen.push(pr);
  // join leftover components with the shortest edge that fits
  const ds = new DSU(pts.length);
  for (const [a, b] of chosen) ds.union(a, b);
  for (const pr of all)
    if (ds.find(pr[0]) !== ds.find(pr[1]) && ok(pr)) {
      chosen.push(pr);
      ds.union(...pr);
    }
  // in the rare case nothing fits, connect anyway
  for (const pr of all)
    if (ds.find(pr[0]) !== ds.find(pr[1])) {
      chosen.push(pr);
      ds.union(...pr);
    }
  chosen.sort((a, b) => d(...a) - d(...b));
  const used = new Set<number>();
  const edges = chosen.map(([u, v]) => {
    let w = Math.max(1, Math.round(d(u, v)));
    while (used.has(w)) w++;
    used.add(w);
    return { u, v, w };
  });
  return { pts, edges, W, H };
}

/* ─────────────── Kruskal ─────────────── */

export type EStatus = 'wait' | 'cur' | 'take' | 'skip' | 'unused';

export interface KFrame {
  cur: number; // position in `order` of the edge being looked at, -1 if none
  status: EStatus[]; // per position in `order`
  color: number[]; // per node: colour slot of its group, -1 while alone
  taken: number;
  total: number;
  note: string;
}

export function kruskalFrames(n: number, edges: readonly WEdge[]): { order: number[]; frames: KFrame[] } {
  const order = edges.map((_, i) => i).sort((a, b) => edges[a].w - edges[b].w || a - b);
  const ds = new DSU(n);
  const slot = Array(n).fill(-1); // colour slot per root
  const status: EStatus[] = order.map(() => 'wait');
  let taken = 0;
  let total = 0;
  const colors = () => Array.from({ length: n }, (_, v) => slot[ds.find(v)]);
  const frames: KFrame[] = [{ cur: -1, status: [...status], color: colors(), taken, total, note: `간선 ${edges.length}개를 가중치 순으로 정렬했습니다. 가장 가벼운 것부터 봅니다.` }];
  for (let k = 0; k < order.length; k++) {
    if (taken === n - 1) {
      for (let j = k; j < order.length; j++) status[j] = 'unused';
      frames.push({ cur: -1, status: [...status], color: colors(), taken, total, note: `고른 간선 ${taken}개 = V − 1 → 끝. 남은 간선 ${order.length - k}개는 볼 필요가 없습니다.` });
      return { order, frames };
    }
    const e = edges[order[k]];
    const ra = ds.find(e.u);
    const rb = ds.find(e.v);
    status[k] = 'cur';
    if (ra === rb) {
      status[k] = 'skip';
      frames.push({ cur: k, status: [...status], color: colors(), taken, total, note: `간선 ${edgeName(e)} (${e.w}): 양 끝이 이미 같은 그룹 → 버림. 고르면 순환이 생깁니다.` });
      continue;
    }
    const sa = slot[ra];
    const sb = slot[rb];
    // the merged group keeps the colour of the larger group, so colours stay put as groups grow
    const bigger = ds.s[ra] >= ds.s[rb] ? sa : sb;
    let c = sa < 0 && sb < 0 ? -1 : sa < 0 ? sb : sb < 0 ? sa : bigger;
    if (c < 0) {
      const busy = new Set(slot.filter((x, v) => x >= 0 && ds.find(v) === v));
      c = 0;
      while (busy.has(c)) c++;
    }
    ds.union(e.u, e.v);
    const root = ds.find(e.u);
    slot[ra] = slot[rb] = -1;
    slot[root] = c;
    status[k] = 'take';
    taken++;
    total += e.w;
    const join = sa < 0 && sb < 0 ? '외톨이 두 노드가 새 그룹이 됨' : sa < 0 || sb < 0 ? '외톨이 노드가 그룹에 들어감' : '두 그룹이 하나로 합쳐짐';
    frames.push({ cur: k, status: [...status], color: colors(), taken, total, note: `간선 ${edgeName(e)} (${e.w}): 양 끝이 다른 그룹 → 고름. ${join}.` });
  }
  frames.push({ cur: -1, status: [...status], color: colors(), taken, total, note: taken === n - 1 ? `모든 간선을 봤습니다. 고른 간선 ${taken}개 = V − 1 → 끝.` : '그래프가 끊어져 있어 신장 트리가 없습니다.' });
  return { order, frames };
}

/* ─────────────── Prim (lazy, with a binary heap of edges) ─────────────── */

export interface PFrame {
  inTree: boolean[];
  tree: number[]; // edge ids chosen so far
  heap: number[]; // candidate edge ids, cheapest first (for display)
  cur: number; // edge id just popped, -1 if none
  curTake: boolean;
  taken: number;
  total: number;
  note: string;
}

class EdgeHeap {
  a: number[] = [];
  key: (id: number) => number;
  constructor(key: (id: number) => number) {
    this.key = key;
  }
  private less(i: number, j: number) {
    const ki = this.key(this.a[i]);
    const kj = this.key(this.a[j]);
    return ki < kj || (ki === kj && this.a[i] < this.a[j]);
  }
  push(x: number) {
    const a = this.a;
    a.push(x);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(i, p)) break;
      [a[i], a[p]] = [a[p], a[i]];
      i = p;
    }
  }
  pop(): number | undefined {
    const a = this.a;
    if (!a.length) return undefined;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= a.length) break;
        let c = l;
        if (l + 1 < a.length && this.less(l + 1, l)) c = l + 1;
        if (!this.less(c, i)) break;
        [a[i], a[c]] = [a[c], a[i]];
        i = c;
      }
    }
    return top;
  }
  get size() {
    return this.a.length;
  }
}

export function primFrames(n: number, edges: readonly WEdge[], start: number): PFrame[] {
  const adj: number[][] = Array.from({ length: n }, () => []);
  edges.forEach((e, i) => {
    adj[e.u].push(i);
    adj[e.v].push(i);
  });
  const key = (id: number) => edges[id].w;
  const heap = new EdgeHeap(key);
  const inTree = Array(n).fill(false);
  const tree: number[] = [];
  let total = 0;
  const shown = () => [...heap.a].sort((a, b) => key(a) - key(b) || a - b);
  const frames: PFrame[] = [];
  const snap = (cur: number, curTake: boolean, note: string) => frames.push({ inTree: [...inTree], tree: [...tree], heap: shown(), cur, curTake, taken: tree.length, total, note });
  inTree[start] = true;
  for (const id of adj[start]) heap.push(id);
  snap(-1, false, `시작 노드 ${LETTERS[start]} → 트리에 넣고, 닿은 간선 ${adj[start].length}개를 후보 힙에 넣음`);
  while (heap.size && tree.length < n - 1) {
    const id = heap.pop()!;
    const e = edges[id];
    const out = inTree[e.u] ? e.v : e.u;
    if (inTree[e.u] && inTree[e.v]) {
      snap(id, false, `후보 중 가장 싼 ${edgeName(e)} (${e.w}): 양 끝 모두 이미 트리 안 → 버림`);
      continue;
    }
    inTree[out] = true;
    tree.push(id);
    total += e.w;
    let added = 0;
    for (const j of adj[out]) {
      const f = edges[j];
      if (!inTree[f.u] || !inTree[f.v]) {
        heap.push(j);
        added++;
      }
    }
    snap(id, true, `후보 중 가장 싼 ${edgeName(e)} (${e.w}): ${LETTERS[out]} 아직 트리 밖 → 고름. ${added ? `새 후보 간선 ${added}개 추가` : '새 후보 없음'}`);
  }
  snap(-1, false, tree.length === n - 1 ? `트리에 노드 ${n}개, 간선 ${tree.length}개 = V − 1 → 끝${heap.size ? `. 힙에 남은 후보 ${heap.size}개는 볼 필요가 없습니다` : ''}.` : '그래프가 끊어져 있어 신장 트리가 없습니다.');
  return frames;
}

/* ─────────────── Clustering: cut the longest MST edges ─────────────── */

/** Points in 3–4 blobs of different sizes (uniform in a disc, so there are no stray outliers). */
export function makeBlobs(seed: number, W = 100, H = 56): [number, number][] {
  const r = rng(seed);
  const k = 3 + Math.floor(r() * 2);
  const centers: [number, number][] = [];
  const radii: number[] = [];
  for (let t = 0; centers.length < k && t < 5000; t++) {
    const rad = 6 + r() * 5;
    const c: [number, number] = [rad + 3 + r() * (W - 2 * rad - 6), rad + 3 + r() * (H - 2 * rad - 6)];
    if (centers.every((q, i) => Math.hypot(c[0] - q[0], c[1] - q[1]) > rad + radii[i] + 8)) {
      centers.push(c);
      radii.push(rad);
    }
  }
  const pts: [number, number][] = [];
  centers.forEach((c, i) => {
    const m = 7 + Math.floor(r() * 7);
    for (let j = 0; j < m; j++) {
      const a = 2 * Math.PI * r();
      const d = radii[i] * Math.sqrt(r());
      pts.push([c[0] + d * Math.cos(a), c[1] + d * Math.sin(a)]);
    }
  });
  return pts;
}

/** MST of the complete graph on the points (Kruskal), with exact Euclidean weights. */
export function mstOfPoints(pts: readonly [number, number][]): WEdge[] {
  const all: WEdge[] = [];
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) all.push({ u: i, v: j, w: Math.hypot(pts[i][0] - pts[j][0], pts[i][1] - pts[j][1]) });
  all.sort((a, b) => a.w - b.w);
  const ds = new DSU(pts.length);
  return all.filter((e) => ds.union(e.u, e.v));
}

/** Cut the k−1 heaviest MST edges. `spacing` = shortest distance between two points in different clusters. */
export function cutClusters(n: number, mst: readonly WEdge[], k: number): { label: number[]; cut: WEdge[]; keep: WEdge[]; spacing: number } {
  const byW = [...mst].sort((a, b) => b.w - a.w);
  const cut = byW.slice(0, Math.max(0, k - 1));
  const keep = byW.slice(Math.max(0, k - 1));
  const ds = new DSU(n);
  for (const e of keep) ds.union(e.u, e.v);
  // number clusters by their smallest point index so colours stay put as k changes
  const ids = new Map<number, number>();
  const label = Array.from({ length: n }, (_, v) => {
    const r = ds.find(v);
    if (!ids.has(r)) ids.set(r, ids.size);
    return ids.get(r)!;
  });
  return { label, cut, keep, spacing: cut.length ? Math.min(...cut.map((e) => e.w)) : Infinity };
}

/* ─────────────── Topological sort ─────────────── */

export type Edge = [number, number];

/** The web-app build used throughout the topological-sort lesson. Durations are in minutes. */
export const BUILD = {
  names: ['설치', '이미지', '린트', '타입 검사', '테스트', '번들', 'E2E', '배포'],
  dur: [3, 2, 1, 2, 4, 3, 5, 1],
  edges: [
    [0, 2],
    [0, 3],
    [0, 4],
    [0, 5],
    [1, 5],
    [5, 6],
    [2, 7],
    [3, 7],
    [4, 7],
    [6, 7],
  ] as Edge[],
  /** Extra dependencies the reader can switch on in the cycle figure; `bend`: 0 straight, otherwise how far (×30px) and to which side the arc bulges. */
  extra: [
    { e: [2, 3] as Edge, bend: 0 },
    { e: [6, 5] as Edge, bend: 1.3 },
    { e: [4, 5] as Edge, bend: 0 },
    { e: [7, 1] as Edge, bend: -0.35 },
  ],
};

export interface KahnFrame {
  indeg: number[]; // remaining in-degree per node
  ready: number[]; // queue / stack contents, in container order
  out: number[];
  cur: number | null; // node just taken out
  note: string;
  stuck: boolean; // finished with nodes left over (a cycle)
}

const listNames = (ids: readonly number[], names: readonly string[]) => ids.map((i) => names[i]).join(', ');

/** Kahn's algorithm. `mode` decides which ready node goes first: oldest (queue) or newest (stack). */
export function kahnFrames(n: number, edges: readonly Edge[], names: readonly string[], mode: 'queue' | 'stack'): KahnFrame[] {
  const out: number[] = [];
  const indeg = Array(n).fill(0);
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (const [u, v] of edges) {
    adj[u].push(v);
    indeg[v]++;
  }
  for (const a of adj) a.sort((x, y) => x - y);
  let ready = indeg.flatMap((d, i) => (d === 0 ? [i] : []));
  const frames: KahnFrame[] = [];
  const snap = (cur: number | null, note: string, stuck = false) => frames.push({ indeg: [...indeg], ready: [...ready], out: [...out], cur, note, stuck });
  snap(null, `진입 차수 0인 작업 → ${mode === 'queue' ? '큐' : '스택'}에 넣음: ${listNames(ready, names) || '없음'}`);
  while (ready.length) {
    const u = mode === 'queue' ? ready[0] : ready[ready.length - 1];
    ready = mode === 'queue' ? ready.slice(1) : ready.slice(0, -1);
    out.push(u);
    const freed: number[] = [];
    for (const v of adj[u]) {
      indeg[v]--;
      if (indeg[v] === 0) freed.push(v);
    }
    ready = [...ready, ...freed];
    const gone = adj[u].length ? `나가는 간선 ${adj[u].length}개 지움` : '나가는 간선 없음';
    snap(u, `${names[u]} 꺼냄 → 순서에 추가. ${gone}${freed.length ? ` → 진입 차수 0이 된 ${listNames(freed, names)} 추가` : ''}`);
  }
  if (out.length < n) snap(null, `${mode === 'queue' ? '큐' : '스택'}가 비었는데 작업 ${n - out.length}개가 남음 → 순환이 있어서 순서를 정할 수 없음`, true);
  else snap(null, `작업 ${n}개가 모두 순서에 들어감 → 완료`);
  return frames;
}

/** State after the reader has picked `chosen` in that order (each pick must have had in-degree 0). */
export function kahnPicked(n: number, edges: readonly Edge[], chosen: readonly number[]): { indeg: number[]; ready: number[] } {
  const indeg = Array(n).fill(0);
  for (const [, v] of edges) indeg[v]++;
  const done = new Set(chosen);
  for (const u of chosen) for (const [a, b] of edges) if (a === u) indeg[b]--;
  return { indeg, ready: indeg.flatMap((d, i) => (d === 0 && !done.has(i) ? [i] : [])) };
}

/** Is `order` a permutation of 0..n−1 in which every edge points forward? */
export function isTopoOrder(n: number, edges: readonly Edge[], order: readonly number[]): boolean {
  if (order.length !== n || new Set(order).size !== n) return false;
  const at = Array(n);
  order.forEach((v, i) => (at[v] = i));
  return edges.every(([u, v]) => at[u] < at[v]);
}

/** A directed cycle inside the given node set (DFS with three colours), as a node list v0 → … → vk (→ v0), or null. */
export function findCycle(n: number, edges: readonly Edge[], among?: readonly number[]): number[] | null {
  const inSet = Array(n).fill(among ? false : true);
  if (among) for (const v of among) inSet[v] = true;
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (const [u, v] of edges) if (inSet[u] && inSet[v]) adj[u].push(v);
  const color = Array(n).fill(0); // 0 new, 1 on the stack, 2 done
  const stack: number[] = [];
  let found: number[] | null = null;
  const dfs = (u: number) => {
    color[u] = 1;
    stack.push(u);
    for (const v of adj[u]) {
      if (found) return;
      if (color[v] === 1) {
        found = stack.slice(stack.indexOf(v));
        return;
      }
      if (color[v] === 0) dfs(v);
    }
    stack.pop();
    color[u] = 2;
  };
  for (let v = 0; v < n && !found; v++) if (inSet[v] && color[v] === 0) dfs(v);
  return found;
}

/** DFS topological order: reverse post-order. Returns null if there is a cycle. */
export function dfsTopo(n: number, edges: readonly Edge[]): number[] | null {
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (const [u, v] of edges) adj[u].push(v);
  const color = Array(n).fill(0);
  const post: number[] = [];
  let cyclic = false;
  const dfs = (u: number) => {
    color[u] = 1;
    for (const v of adj[u]) {
      if (color[v] === 1) cyclic = true;
      else if (color[v] === 0) dfs(v);
    }
    color[u] = 2;
    post.push(u);
  };
  for (let v = 0; v < n; v++) if (color[v] === 0) dfs(v);
  return cyclic ? null : post.reverse();
}

/* ─────────────── Critical path ─────────────── */

export interface CPResult {
  order: number[];
  es: number[]; // earliest start
  ef: number[]; // earliest finish
  ls: number[]; // latest start that keeps the project length
  slack: number[];
  total: number;
  critEdge: boolean[]; // per edge
  paths: number[][]; // every critical path, source to sink
}

export function criticalPath(n: number, edges: readonly Edge[], dur: readonly number[]): CPResult {
  const kf = kahnFrames(n, edges, Array(n).fill(''), 'queue');
  const order = kf[kf.length - 1].out;
  const es = Array(n).fill(0);
  for (const u of order) for (const [a, b] of edges) if (a === u) es[b] = Math.max(es[b], es[u] + dur[u]);
  const ef = es.map((s, i) => s + dur[i]);
  const total = Math.max(0, ...ef);
  const lf = Array(n).fill(total);
  for (const u of [...order].reverse()) for (const [a, b] of edges) if (a === u) lf[u] = Math.min(lf[u], lf[b] - dur[b]);
  const ls = lf.map((f, i) => f - dur[i]);
  const slack = ls.map((s, i) => s - es[i]);
  const critEdge = edges.map(([u, v]) => slack[u] === 0 && slack[v] === 0 && ef[u] === es[v]);
  const paths: number[][] = [];
  const hasIn = Array(n).fill(false);
  edges.forEach(([, v], i) => critEdge[i] && (hasIn[v] = true));
  const walk = (u: number, acc: number[]) => {
    const next = edges.flatMap(([a, b], i) => (a === u && critEdge[i] ? [b] : []));
    if (!next.length) {
      if (ef[u] === total) paths.push([...acc, u]);
      return;
    }
    for (const v of next) walk(v, [...acc, u]);
  };
  for (let v = 0; v < n; v++) if (slack[v] === 0 && es[v] === 0 && !hasIn[v]) walk(v, []);
  return { order, es, ef, ls, slack, total, critEdge, paths };
}

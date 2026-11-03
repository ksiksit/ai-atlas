/** Grid path-finding used by the graph lesson and the course cover. */

export const WALL = 1;
export const MUD = 2;
/** Cost of stepping onto a cell: mud is slow. */
export const cost = (cell: number) => (cell === MUD ? 5 : 1);

export interface Grid {
  w: number;
  h: number;
  cells: Uint8Array;
  start: number;
  goal: number;
}

export type Search = 'bfs' | 'dfs' | 'dijkstra' | 'astar';

export interface SearchResult {
  /** Cells in the order they were taken out of the frontier (visited). */
  order: number[];
  /** Start → goal, or empty when the goal is unreachable. */
  path: number[];
  cost: number;
}

const DIRS = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

function neighbors(g: Grid, i: number): number[] {
  const x = i % g.w;
  const y = Math.floor(i / g.w);
  const out: number[] = [];
  for (const [dx, dy] of DIRS) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= g.w || ny >= g.h) continue;
    const j = ny * g.w + nx;
    if (g.cells[j] !== WALL) out.push(j);
  }
  return out;
}

/** Minimal binary min-heap keyed by priority. */
class Heap {
  private items: [number, number, number][] = []; // [priority, tie-breaker, value]
  private seq = 0;
  get size() {
    return this.items.length;
  }
  push(p: number, v: number) {
    const a = this.items;
    a.push([p, this.seq++, v]);
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.less(a[i], a[parent])) {
        [a[i], a[parent]] = [a[parent], a[i]];
        i = parent;
      } else break;
    }
  }
  pop(): [number, number] {
    const a = this.items;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && this.less(a[l], a[m])) m = l;
        if (r < a.length && this.less(a[r], a[m])) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return [top[0], top[2]];
  }
  private less(x: [number, number, number], y: [number, number, number]) {
    return x[0] < y[0] || (x[0] === y[0] && x[1] < y[1]);
  }
}

export function search(g: Grid, alg: Search): SearchResult {
  const n = g.w * g.h;
  const prev = new Int32Array(n).fill(-1);
  const seen = new Uint8Array(n);
  const order: number[] = [];
  const gx = g.goal % g.w;
  const gy = Math.floor(g.goal / g.w);
  const h = (i: number) => Math.abs((i % g.w) - gx) + Math.abs(Math.floor(i / g.w) - gy);

  if (alg === 'bfs') {
    const q = [g.start];
    seen[g.start] = 1;
    for (let head = 0; head < q.length; head++) {
      const u = q[head];
      order.push(u);
      if (u === g.goal) break;
      for (const v of neighbors(g, u)) {
        if (seen[v]) continue;
        seen[v] = 1;
        prev[v] = u;
        q.push(v);
      }
    }
  } else if (alg === 'dfs') {
    const stack: [number, number][] = [[g.start, -1]];
    while (stack.length) {
      const [u, from] = stack.pop()!;
      if (seen[u]) continue;
      seen[u] = 1;
      prev[u] = from;
      order.push(u);
      if (u === g.goal) break;
      // push in reverse so the first direction (right) is explored first
      const ns = neighbors(g, u);
      for (let k = ns.length - 1; k >= 0; k--) if (!seen[ns[k]]) stack.push([ns[k], u]);
    }
  } else {
    const dist = new Float64Array(n).fill(Infinity);
    dist[g.start] = 0;
    const heap = new Heap();
    heap.push(alg === 'astar' ? h(g.start) : 0, g.start);
    while (heap.size) {
      const [, u] = heap.pop();
      if (seen[u]) continue;
      seen[u] = 1;
      order.push(u);
      if (u === g.goal) break;
      for (const v of neighbors(g, u)) {
        const d = dist[u] + cost(g.cells[v]);
        if (d < dist[v]) {
          dist[v] = d;
          prev[v] = u;
          heap.push(alg === 'astar' ? d + h(v) : d, v);
        }
      }
    }
  }

  const path: number[] = [];
  if (order[order.length - 1] === g.goal) {
    for (let v = g.goal; v !== -1; v = prev[v]) path.push(v);
    path.reverse();
  }
  const total = path.slice(1).reduce((s, i) => s + cost(g.cells[i]), 0);
  return { order, path, cost: total };
}

/** Perfect maze on an odd-sized grid (recursive backtracker), then a few extra openings. */
export function makeMaze(w: number, h: number, start: number, goal: number, r: () => number): Uint8Array {
  const cells = new Uint8Array(w * h).fill(WALL);
  const stack: [number, number][] = [[1, 1]];
  cells[w + 1] = 0;
  while (stack.length) {
    const [x, y] = stack[stack.length - 1];
    const opts = DIRS.map(([dx, dy]) => [x + dx * 2, y + dy * 2, dx, dy]).filter(([nx, ny]) => nx > 0 && ny > 0 && nx < w - 1 && ny < h - 1 && cells[ny * w + nx] === WALL);
    if (!opts.length) {
      stack.pop();
      continue;
    }
    const [nx, ny, dx, dy] = opts[Math.floor(r() * opts.length)];
    cells[(y + dy) * w + (x + dx)] = 0;
    cells[ny * w + nx] = 0;
    stack.push([nx, ny]);
  }
  // knock out some walls so there is more than one route
  for (let k = 0; k < (w * h) / 18; k++) {
    const x = 1 + Math.floor(r() * (w - 2));
    const y = 1 + Math.floor(r() * (h - 2));
    cells[y * w + x] = 0;
  }
  cells[start] = 0;
  cells[goal] = 0;
  return cells;
}

/**
 * The lesson's starting map: a mud field between start and goal with a dry corridor
 * along the top. Crossing the mud takes the fewest steps; going around costs less.
 */
export function defaultGrid(w: number, h: number): Grid {
  const cells = new Uint8Array(w * h);
  const set = (x: number, y: number, v: number) => (cells[y * w + x] = v);
  const midY = Math.floor(h / 2);
  for (let x = Math.round(w * 0.38); x <= Math.round(w * 0.62); x++) for (let y = 2; y < h; y++) set(x, y, MUD);
  for (let y = h - 5; y < h; y++) {
    set(Math.round(w * 0.2), y, WALL);
    set(Math.round(w * 0.8), y, WALL);
  }
  return { w, h, cells, start: midY * w + 1, goal: midY * w + (w - 2) };
}

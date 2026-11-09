/*
 * 기초 알고리즘 · 미로 안에서 길 찾기: the walkable maze, collision against its walls,
 * and Ariadne's thread (the walker's own DFS stack). Free of DOM so the lesson's numbers can be checked.
 */
import { rng } from '../../../../lib/math';
import { WALL, makeMaze, search, type Grid, type Search } from './grid';

export const MW = 21;
export const MH = 21;
/** Width of one cell in world units. */
export const CELL = 1;
/** Radius of the walker's body for collisions. */
export const BODY = 0.22;

export const START = MW + 1;
export const GOAL = (MH - 2) * MW + (MW - 2);

export function mazeGrid(seed: number): Grid {
  return { w: MW, h: MH, cells: makeMaze(MW, MH, START, GOAL, rng(seed * 7 + 1)), start: START, goal: GOAL };
}

/** World (x, z) of a cell's centre. Cell column grows along +x, row along +z. */
export function cellCenter(i: number): [number, number] {
  return [((i % MW) - (MW - 1) / 2) * CELL, (Math.floor(i / MW) - (MH - 1) / 2) * CELL];
}

export function cellAt(x: number, z: number): number {
  const cx = Math.round(x / CELL + (MW - 1) / 2);
  const cy = Math.round(z / CELL + (MH - 1) / 2);
  if (cx < 0 || cy < 0 || cx >= MW || cy >= MH) return -1;
  return cy * MW + cx;
}

const isWall = (g: Grid, cx: number, cy: number) => cx < 0 || cy < 0 || cx >= g.w || cy >= g.h || g.cells[cy * g.w + cx] === WALL;

/** True when a body of radius BODY at (x, z) overlaps a wall cell. */
export function blocked(g: Grid, x: number, z: number): boolean {
  const fx = x / CELL + (MW - 1) / 2;
  const fz = z / CELL + (MH - 1) / 2;
  const cx = Math.round(fx);
  const cy = Math.round(fz);
  const r = BODY / CELL;
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) {
      const wx = cx + dx;
      const wy = cy + dy;
      if (!isWall(g, wx, wy)) continue;
      // nearest point of the wall square [wx ± ½] × [wy ± ½] to the body's centre
      const nx = Math.max(wx - 0.5, Math.min(wx + 0.5, fx));
      const ny = Math.max(wy - 0.5, Math.min(wy + 0.5, fz));
      if ((nx - fx) ** 2 + (ny - fz) ** 2 < r * r) return true;
    }
  return false;
}

/** Slide along walls: try the full move, then each axis alone. */
export function slide(g: Grid, x0: number, z0: number, x1: number, z1: number): [number, number] {
  if (!blocked(g, x1, z1)) return [x1, z1];
  if (!blocked(g, x1, z0)) return [x1, z0];
  if (!blocked(g, x0, z1)) return [x0, z1];
  return [x0, z0];
}

const adjacent = (a: number, b: number) => {
  const dx = Math.abs((a % MW) - (b % MW));
  const dy = Math.abs(Math.floor(a / MW) - Math.floor(b / MW));
  return dx + dy === 1;
};

/**
 * Ariadne's thread: the walker unrolls it on entering a new cell and winds it back up on
 * stepping back onto it. It is always a simple path from the start to where the walker stands,
 * exactly the stack of a depth-first search.
 */
export function moveThread(g: Grid, thread: number[], cell: number): number[] {
  const top = thread[thread.length - 1];
  if (cell === top || cell < 0) return thread;
  const out = thread.slice();
  const steps: number[] = [];
  if (adjacent(top, cell)) steps.push(cell);
  else {
    // crossed a corner diagonally within one update: go through whichever side cell is open
    const via = [(Math.floor(top / MW)) * MW + (cell % MW), Math.floor(cell / MW) * MW + (top % MW)].find((c) => g.cells[c] !== WALL && adjacent(top, c) && adjacent(c, cell));
    if (via === undefined) return thread;
    steps.push(via, cell);
  }
  for (const c of steps) {
    const at = out.indexOf(c);
    // back onto the thread: wind it up to that point (a loop closed by an extra opening is cut off too)
    if (at >= 0) out.length = at + 1;
    else out.push(c);
  }
  return out;
}

export interface Compare {
  alg: Search;
  visited: number;
  path: number;
}

/** What each search would have looked at going from `from` to the goal. */
export function compareSearches(g: Grid, from: number): Compare[] {
  return (['bfs', 'dfs', 'astar'] as Search[]).map((alg) => {
    const r = search({ ...g, start: from }, alg);
    return { alg, visited: r.order.length, path: Math.max(0, r.path.length - 1) };
  });
}

/** Distance in steps from `from` to every open cell (−1 if unreachable): the BFS layers. */
export function bfsLayers(g: Grid, from: number): Int32Array {
  const d = new Int32Array(g.w * g.h).fill(-1);
  d[from] = 0;
  const q = [from];
  for (let h = 0; h < q.length; h++) {
    const u = q[h];
    const x = u % g.w;
    const y = Math.floor(u / g.w);
    for (const [dx, dy] of [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
    ]) {
      if (isWall(g, x + dx, y + dy)) continue;
      const v = (y + dy) * g.w + x + dx;
      if (d[v] >= 0) continue;
      d[v] = d[u] + 1;
      q.push(v);
    }
  }
  return d;
}

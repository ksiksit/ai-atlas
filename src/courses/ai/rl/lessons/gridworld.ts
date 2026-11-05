/*
 * 강화학습: the grid worlds shared by the lessons (마르코프 결정 과정, 가치 반복, Q-러닝).
 *
 * States are cell indices s = y * w + x, with y = 0 the top row. Walls are cells too but are
 * never entered. Rewards belong to the cell you move INTO: a move from s that lands in s2 earns
 * rewards[s2]. Entering a goal ends the episode; entering a pit ends it too, unless the grid has
 * `pitReset` (the cliff), in which case the agent pays the pit's reward and goes back to the start.
 *
 * Pure logic plus one canvas helper, so node can run everything except drawGrid.
 */

import { alpha, type Palette } from '../../../../lib/theme';

export type Cell = 'empty' | 'wall' | 'goal' | 'pit' | 'start';

export interface Grid {
  w: number;
  h: number;
  cells: Cell[];
  /** Reward for moving into each cell. */
  rewards: number[];
  /** Probability that a move slips to one of the two perpendicular directions (half each). */
  slip: number;
  /** Pits send the agent back to the start instead of ending the episode (the cliff walk). */
  pitReset?: boolean;
}

export const ACTIONS = ['up', 'right', 'down', 'left'] as const;
export type Action = 0 | 1 | 2 | 3;
export const ACTION_KO = ['위', '오른쪽', '아래', '왼쪽'] as const;
export const ARROW = ['↑', '→', '↓', '←'] as const;
const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];

export const stateCount = (g: Grid) => g.w * g.h;
export const isWall = (g: Grid, s: number) => g.cells[s] === 'wall';
export const isTerminal = (g: Grid, s: number) => g.cells[s] === 'goal' || (g.cells[s] === 'pit' && !g.pitReset);
export const startState = (g: Grid) => Math.max(0, g.cells.indexOf('start'));
export const xy = (g: Grid, s: number): [number, number] => [s % g.w, Math.floor(s / g.w)];

/** Where action a would take the agent from s if it did not slip (bumping into walls/edges stays put). */
export function moveTo(g: Grid, s: number, a: number): number {
  const [x, y] = xy(g, s);
  const nx = x + DX[a], ny = y + DY[a];
  if (nx < 0 || ny < 0 || nx >= g.w || ny >= g.h) return s;
  const s2 = ny * g.w + nx;
  return isWall(g, s2) ? s : s2;
}

/** All outcomes of taking action a in state s, with probabilities summing to 1. */
export function transitions(g: Grid, s: number, a: Action | number): { p: number; s2: number; r: number; done: boolean }[] {
  if (isTerminal(g, s) || isWall(g, s)) return [{ p: 1, s2: s, r: 0, done: true }];
  const dirs: [number, number][] = g.slip > 0 ? [[a, 1 - g.slip], [(a + 1) % 4, g.slip / 2], [(a + 3) % 4, g.slip / 2]] : [[a, 1]];
  const out: { p: number; s2: number; r: number; done: boolean }[] = [];
  for (const [d, p] of dirs) {
    if (p <= 0) continue;
    let s2 = moveTo(g, s, d);
    const r = g.rewards[s2];
    let done = isTerminal(g, s2);
    if (g.cells[s2] === 'pit' && g.pitReset) {
      s2 = startState(g);
      done = false;
    }
    const same = out.find((o) => o.s2 === s2 && o.r === r && o.done === done);
    if (same) same.p += p;
    else out.push({ p, s2, r, done });
  }
  return out;
}

/** Sample one move. */
export function step(g: Grid, s: number, a: Action | number, rand: () => number): { s2: number; r: number; done: boolean } {
  const ts = transitions(g, s, a);
  let u = rand();
  for (const t of ts) {
    if (u < t.p) return { s2: t.s2, r: t.r, done: t.done };
    u -= t.p;
  }
  const t = ts[ts.length - 1];
  return { s2: t.s2, r: t.r, done: t.done };
}

/** States an agent can stand in (not walls, not terminal). */
export const liveStates = (g: Grid) => g.cells.map((_, s) => s).filter((s) => !isWall(g, s) && !isTerminal(g, s));

/** Expected value of taking a in s and then following values V: Σ p (r + γ V(s2)), terminal V = 0. */
export function qValue(g: Grid, V: number[], s: number, a: number, gamma: number): number {
  let q = 0;
  for (const t of transitions(g, s, a)) q += t.p * (t.r + (t.done ? 0 : gamma * V[t.s2]));
  return q;
}

/**
 * Iterative policy evaluation: V(s) = Σ p (r + γ V(s2)) for a fixed policy, swept until the
 * largest change is below tol. Returns the values and the number of sweeps.
 */
export function evaluatePolicy(g: Grid, policy: number[], gamma: number, tol = 1e-9, maxIter = 10000): { V: number[]; iters: number } {
  let V = new Array(stateCount(g)).fill(0);
  const live = liveStates(g);
  for (let it = 1; it <= maxIter; it++) {
    const N = V.slice();
    let delta = 0;
    for (const s of live) {
      N[s] = qValue(g, V, s, policy[s] ?? 0, gamma);
      delta = Math.max(delta, Math.abs(N[s] - V[s]));
    }
    V = N;
    if (delta < tol) return { V, iters: it };
  }
  return { V, iters: maxIter };
}

/* ───────── presets ───────── */

function build(rows: string[], step: number, special: Partial<Record<Cell, number>>, slip: number, pitReset = false): Grid {
  const h = rows.length, w = rows[0].length;
  const cells: Cell[] = [];
  const rewards: number[] = [];
  const kind: Record<string, Cell> = { '.': 'empty', '#': 'wall', G: 'goal', P: 'pit', S: 'start' };
  for (const row of rows)
    for (const ch of row) {
      const c = kind[ch];
      cells.push(c);
      rewards.push(c === 'goal' || c === 'pit' ? special[c] ?? 0 : step);
    }
  return { w, h, cells, rewards, slip, pitReset };
}

export const presets: Record<'classic' | 'cliff' | 'maze', Grid> = {
  // Russell & Norvig's 4×3 world: one wall, +1 and −1 exits, −0.04 for every other step, 20% slip
  classic: build(['...G', '.#.P', 'S...'], -0.04, { goal: 1, pit: -1 }, 0.2),
  // Sutton & Barto's cliff walk: −1 per step, −100 and back to the start for stepping off the cliff
  cliff: build(['............', '............', '............', 'SPPPPPPPPPPG'], -1, { goal: -1, pit: -100 }, 0, true),
  // a small maze: −0.04 per step, +1 at the exit
  maze: build(['S.#...', '.##.#.', '....#.', '#.#...', '..#.##', '.....G'], -0.04, { goal: 1 }, 0),
};

/** A copy of a preset with a different slip probability and/or step reward. */
export function variant(g: Grid, opts: { slip?: number; stepReward?: number }): Grid {
  return {
    ...g,
    cells: g.cells.slice(),
    slip: opts.slip ?? g.slip,
    rewards: g.cells.map((c, s) => (opts.stepReward !== undefined && c !== 'goal' && c !== 'pit' ? opts.stepReward : g.rewards[s])),
  };
}

/* ───────── drawing ───────── */

export interface GridLayout {
  x: number;
  y: number;
  /** Side of one cell in CSS pixels. */
  cell: number;
}

/** Largest square cells that fit the grid in a w × h box with `pad` around, centred. */
export function gridLayout(g: Grid, w: number, h: number, pad = 8): GridLayout {
  const cell = Math.max(8, Math.floor(Math.min((w - 2 * pad) / g.w, (h - 2 * pad) / g.h)));
  return { cell, x: Math.round((w - cell * g.w) / 2), y: Math.round((h - cell * g.h) / 2) };
}

/** The cell under a point, or −1. */
export function cellAt(g: Grid, L: GridLayout, px: number, py: number): number {
  const x = Math.floor((px - L.x) / L.cell), y = Math.floor((py - L.y) / L.cell);
  if (x < 0 || y < 0 || x >= g.w || y >= g.h) return -1;
  return y * g.w + x;
}

export interface DrawOpts {
  /** Per-state values shown as a heat tint (green above 0, red below). */
  values?: number[];
  /** Absolute value that maps to full colour; defaults to the largest |value|. */
  vScale?: number;
  /** Print the value in each cell. */
  showNumbers?: boolean;
  /** Decimals for printed values. */
  digits?: number;
  /** Per-state action to draw as an arrow (null/undefined: none). */
  policy?: (number | null | undefined)[];
  /** Per-state, per-action values: draws four small triangles per cell instead of one heat colour. */
  q?: number[][];
  /** Cell to draw the agent in. */
  agent?: number;
  /** Cell to outline. */
  highlight?: number;
  /** Trail of visited cells, drawn as a faint path. */
  trail?: number[];
}

const fmtNum = (v: number, d: number) => (Math.abs(v) < 0.5 * 10 ** -d ? (0).toFixed(d) : v.toFixed(d)).replace('-', '−');

export function drawGrid(ctx: CanvasRenderingContext2D, P: Palette, g: Grid, L: GridLayout, opts: DrawOpts = {}) {
  const { values, showNumbers, digits = 2, policy, q, agent, highlight, trail } = opts;
  const c = L.cell;
  const scale = opts.vScale ?? Math.max(1e-9, ...(values ?? q?.flat() ?? [0]).map((v) => Math.abs(v)).filter((v) => isFinite(v)));
  const heat = (v: number) => (v >= 0 ? alpha(P.good, Math.min(1, v / scale) * 0.55) : alpha(P.bad, Math.min(1, -v / scale) * 0.55));

  for (let s = 0; s < g.w * g.h; s++) {
    const [gx, gy] = xy(g, s);
    const x = L.x + gx * c, y = L.y + gy * c;
    const kind = g.cells[s];
    ctx.fillStyle = kind === 'wall' ? P.ink2 : P.surface;
    ctx.fillRect(x, y, c, c);
    if (kind === 'wall') continue;
    if (kind === 'goal' || (kind === 'pit' && !g.pitReset)) {
      ctx.fillStyle = alpha(kind === 'goal' ? P.good : P.bad, 0.85);
      ctx.fillRect(x + 1, y + 1, c - 2, c - 2);
      ctx.fillStyle = P.surface;
      ctx.font = `700 ${Math.round(c * 0.26)}px ${P.fontMono}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(fmtNum(g.rewards[s], g.rewards[s] % 1 === 0 ? 0 : 2).replace(/^(\d)/, '+$1'), x + c / 2, y + c / 2);
      continue;
    }
    if (kind === 'pit') {
      // the cliff: a hatched strip
      ctx.fillStyle = alpha(P.bad, 0.22);
      ctx.fillRect(x + 1, y + 1, c - 2, c - 2);
      ctx.save();
      ctx.beginPath();
      ctx.rect(x + 1, y + 1, c - 2, c - 2);
      ctx.clip();
      ctx.strokeStyle = alpha(P.bad, 0.6);
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let k = -c; k < c; k += 6) {
        ctx.moveTo(x + k, y + c);
        ctx.lineTo(x + k + c, y);
      }
      ctx.stroke();
      ctx.restore();
      continue;
    }
    if (q) {
      // four triangles meeting in the centre, one per action
      const cx = x + c / 2, cy = y + c / 2;
      const corners: [number, number][] = [[x, y], [x + c, y], [x + c, y + c], [x, y + c]];
      for (let a = 0; a < 4; a++) {
        const [p1, p2] = [corners[a], corners[(a + 1) % 4]];
        ctx.fillStyle = heat(q[s]?.[a] ?? 0);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(p1[0], p1[1]);
        ctx.lineTo(p2[0], p2[1]);
        ctx.closePath();
        ctx.fill();
      }
    } else if (values) {
      ctx.fillStyle = heat(values[s] ?? 0);
      ctx.fillRect(x, y, c, c);
    }
    if (kind === 'start') {
      ctx.fillStyle = P.ink3;
      ctx.font = `600 ${Math.max(9, Math.round(c * 0.16))}px ${P.fontBody}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('출발', x + 4, y + 3);
    }
    if (showNumbers && values && !isTerminal(g, s)) {
      ctx.fillStyle = P.ink;
      ctx.font = `600 ${Math.max(9, Math.round(c * (digits > 2 ? 0.17 : 0.2)))}px ${P.fontMono}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(fmtNum(values[s] ?? 0, digits), x + c / 2, y + c - 3);
    }
  }

  // grid lines
  ctx.strokeStyle = P.lineStrong;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= g.w; i++) {
    ctx.moveTo(L.x + i * c + 0.5, L.y);
    ctx.lineTo(L.x + i * c + 0.5, L.y + g.h * c);
  }
  for (let j = 0; j <= g.h; j++) {
    ctx.moveTo(L.x, L.y + j * c + 0.5);
    ctx.lineTo(L.x + g.w * c, L.y + j * c + 0.5);
  }
  ctx.stroke();

  if (trail && trail.length > 1) {
    ctx.strokeStyle = alpha(P.accent, 0.55);
    ctx.lineWidth = Math.max(2, c * 0.06);
    ctx.lineJoin = 'round';
    ctx.beginPath();
    trail.forEach((s, i) => {
      const [gx, gy] = xy(g, s);
      const px = L.x + (gx + 0.5) * c, py = L.y + (gy + 0.5) * c;
      if (i) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    });
    ctx.stroke();
  }

  if (policy) {
    for (let s = 0; s < g.w * g.h; s++) {
      const a = policy[s];
      if (a === null || a === undefined || isWall(g, s) || isTerminal(g, s) || g.cells[s] === 'pit') continue;
      const [gx, gy] = xy(g, s);
      const cx = L.x + (gx + 0.5) * c, cy = L.y + (gy + (showNumbers ? 0.4 : 0.5)) * c;
      const len = c * 0.22;
      const dx = DX[a], dy = DY[a];
      ctx.strokeStyle = P.ink;
      ctx.fillStyle = P.ink;
      ctx.lineWidth = Math.max(1.5, c * 0.04);
      ctx.beginPath();
      ctx.moveTo(cx - dx * len, cy - dy * len);
      ctx.lineTo(cx + dx * len * 0.55, cy + dy * len * 0.55);
      ctx.stroke();
      const hx = cx + dx * len, hy = cy + dy * len;
      const hw = c * 0.1;
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(hx - dx * hw * 1.4 - dy * hw, hy - dy * hw * 1.4 + dx * hw);
      ctx.lineTo(hx - dx * hw * 1.4 + dy * hw, hy - dy * hw * 1.4 - dx * hw);
      ctx.closePath();
      ctx.fill();
    }
  }

  if (highlight !== undefined && highlight >= 0) {
    const [gx, gy] = xy(g, highlight);
    ctx.strokeStyle = P.hl;
    ctx.lineWidth = 3;
    ctx.strokeRect(L.x + gx * c + 1.5, L.y + gy * c + 1.5, c - 3, c - 3);
  }

  if (agent !== undefined && agent >= 0) {
    const [gx, gy] = xy(g, agent);
    ctx.beginPath();
    ctx.arc(L.x + (gx + 0.5) * c, L.y + (gy + 0.5) * c, c * 0.2, 0, Math.PI * 2);
    ctx.fillStyle = P.accent;
    ctx.fill();
    ctx.strokeStyle = P.surface;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
}

/**
 * Optimal values and a greedy policy by value iteration (used as a black box by the
 * 마르코프 결정 과정 lesson; the next lesson builds it step by step).
 */
export function solveOptimal(g: Grid, gamma: number, tol = 1e-9, maxIter = 100000): { V: number[]; policy: (number | null)[]; iters: number } {
  let V = new Array(stateCount(g)).fill(0);
  const live = liveStates(g);
  let iters = 0;
  for (; iters < maxIter; iters++) {
    const N = V.slice();
    let delta = 0;
    for (const s of live) {
      let best = -Infinity;
      for (let a = 0; a < 4; a++) best = Math.max(best, qValue(g, V, s, a, gamma));
      N[s] = best;
      delta = Math.max(delta, Math.abs(N[s] - V[s]));
    }
    V = N;
    if (delta < tol) break;
  }
  const policy: (number | null)[] = V.map(() => null);
  for (const s of live) {
    let best = -Infinity, arg = 0;
    for (let a = 0; a < 4; a++) {
      const q = qValue(g, V, s, a, gamma);
      if (q > best + 1e-12) {
        best = q;
        arg = a;
      }
    }
    policy[s] = arg;
  }
  return { V, policy, iters: iters + 1 };
}

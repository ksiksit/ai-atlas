/* 강화학습 · 보상 설계: tabular Q-learning on small grids with different reward functions. */

import { rng } from '../../../../lib/math';

export type Pos = [number, number]; // [x, y], y down
export const DIRS: Pos[] = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // up, right, down, left
export const DIR_ARROW = ['↑', '→', '↓', '←'];

const argmaxRandom = (q: number[], u: () => number) => {
  const m = Math.max(...q);
  const best = q.map((v, i) => (v === m ? i : -1)).filter((i) => i >= 0);
  return best[Math.floor(u() * best.length)];
};

/* ───────── 1. sparse, potential-shaped and naively shaped rewards ───────── */

export const OPEN = { w: 7, h: 7, start: [0, 6] as Pos, goal: [6, 0] as Pos, gamma: 0.95, maxT: 100 };
export const OPEN_BEST = Math.abs(OPEN.goal[0] - OPEN.start[0]) + Math.abs(OPEN.goal[1] - OPEN.start[1]); // 12 moves

export type Shaping = 'sparse' | 'potential' | 'progress';
export const SHAPING_KO: Record<Shaping, string> = { sparse: '도착할 때만 +1', potential: '퍼텐셜 기반 다듬기', progress: '가까워지면 +0.2' };
export const BONUS = 0.2;
/** Scale of the potential Φ(s) = POT_SCALE · (1 − distance / 12). */
export const POT_SCALE = 0.5;

const dist = (p: Pos) => Math.abs(p[0] - OPEN.goal[0]) + Math.abs(p[1] - OPEN.goal[1]);

/** Reward for moving from p to q (q may equal p when bumping a wall). */
export function shapedReward(kind: Shaping, p: Pos, q: Pos): number {
  const goal = q[0] === OPEN.goal[0] && q[1] === OPEN.goal[1] ? 1 : 0;
  if (kind === 'sparse') return goal;
  if (kind === 'progress') return goal + (dist(q) < dist(p) ? BONUS : 0);
  // F = γΦ(q) − Φ(p) with Φ(s) = 0.5 · (1 − distance / 12), a rough guess of how close s is
  // to the goal. The goal is terminal, so Φ(goal) counts as 0 (Ng, Harada & Russell 1999).
  const phi = (s: Pos) => POT_SCALE * (1 - dist(s) / OPEN_BEST);
  return goal + OPEN.gamma * (goal ? 0 : phi(q)) - phi(p);
}

export interface OpenRun {
  /** Moves taken in each training episode (maxT if it never arrived). */
  steps: number[];
  q: Float64Array;
  /** The greedy path after training, and whether it reaches the goal within maxT moves. */
  path: Pos[];
  arrives: boolean;
}

const sid = (p: Pos) => p[1] * OPEN.w + p[0];
const move = (p: Pos, a: number, w: number, h: number): Pos => {
  const x = p[0] + DIRS[a][0], y = p[1] + DIRS[a][1];
  return x < 0 || y < 0 || x >= w || y >= h ? p : [x, y];
};

export function trainOpen(kind: Shaping, episodes: number, seed: number, alpha = 0.5, eps = 0.1): OpenRun {
  const u = rng(seed);
  const q = new Float64Array(OPEN.w * OPEN.h * 4);
  const steps: number[] = [];
  for (let e = 0; e < episodes; e++) {
    let p: Pos = [...OPEN.start] as Pos;
    let t = 0;
    for (; t < OPEN.maxT; t++) {
      const s = sid(p);
      const qs = Array.from(q.subarray(s * 4, s * 4 + 4));
      const a = u() < eps ? Math.floor(u() * 4) : argmaxRandom(qs, u);
      const p2 = move(p, a, OPEN.w, OPEN.h);
      const r = shapedReward(kind, p, p2);
      const done = p2[0] === OPEN.goal[0] && p2[1] === OPEN.goal[1];
      const s2 = sid(p2);
      const next = done ? 0 : Math.max(q[s2 * 4], q[s2 * 4 + 1], q[s2 * 4 + 2], q[s2 * 4 + 3]);
      q[s * 4 + a] += alpha * (r + OPEN.gamma * next - q[s * 4 + a]);
      p = p2;
      if (done) {
        t++;
        break;
      }
    }
    steps.push(t);
  }
  const path = greedyOpen(q);
  const last = path[path.length - 1];
  return { steps, q, path, arrives: last[0] === OPEN.goal[0] && last[1] === OPEN.goal[1] };
}

/** Follow the highest Q-value (ties: the first) for at most maxT moves. */
export function greedyOpen(q: Float64Array): Pos[] {
  let p: Pos = [...OPEN.start] as Pos;
  const path: Pos[] = [p];
  for (let t = 0; t < OPEN.maxT; t++) {
    const s = sid(p);
    const qs = Array.from(q.subarray(s * 4, s * 4 + 4));
    const a = qs.indexOf(Math.max(...qs));
    p = move(p, a, OPEN.w, OPEN.h);
    path.push(p);
    if (p[0] === OPEN.goal[0] && p[1] === OPEN.goal[1]) break;
  }
  return path;
}

export interface OpenSummary {
  /** Mean moves per episode over all seeds. */
  curve: number[];
  /** First episode from which the 10-episode average stays within 1.5× the shortest path (−1: never). */
  learnedAt: number;
  /** Seeds whose greedy policy reaches the goal after training. */
  arrive: number;
  seeds: number;
  /** The greedy path of the first seed. */
  path: Pos[];
}

export function summarizeOpen(kind: Shaping, episodes: number, seeds: number, seed0 = 1): OpenSummary {
  const curve = new Array(episodes).fill(0);
  let arrive = 0;
  let path: Pos[] = [];
  for (let k = 0; k < seeds; k++) {
    const run = trainOpen(kind, episodes, seed0 + k);
    run.steps.forEach((s, i) => (curve[i] += s / seeds));
    if (run.arrives) arrive++;
    if (k === 0) path = run.path;
  }
  const win = 10;
  const avg = curve.map((_, i) => {
    const lo = Math.max(0, i - win + 1);
    const xs = curve.slice(lo, i + 1);
    return xs.reduce((a, b) => a + b, 0) / xs.length;
  });
  let learnedAt = -1;
  for (let i = win - 1; i < episodes; i++) {
    if (avg.slice(i).every((v) => v <= 1.5 * OPEN_BEST)) {
      learnedAt = i;
      break;
    }
  }
  return { curve, learnedAt, arrive, seeds, path };
}

/* ───────── 2. a race with a bonus pad that keeps coming back ───────── */

/**
 * A 3-row track. The boat starts at the left; any cell in the last column is the finish line
 * (ends the episode with FINISH points). The pad P gives 1 point when the boat moves onto it and
 * then switches off for PAD_OFF moves. The state includes the pad's timer, so the problem
 * stays Markov.
 */
export const RACE = { w: 7, h: 3, start: [0, 1] as Pos, pad: [2, 0] as Pos, padOff: 3, gamma: 0.95, maxT: 40 };

export interface RaceStep {
  p: Pos;
  timer: number;
  reward: number;
  /** Total points so far, and whether the boat has crossed the finish line. */
  score: number;
  finished: boolean;
}

const raceSid = (p: Pos, timer: number) => (timer * RACE.h + p[1]) * RACE.w + p[0];

function raceStep(p: Pos, timer: number, a: number, finish: number): { p: Pos; timer: number; r: number; done: boolean } {
  const p2 = move(p, a, RACE.w, RACE.h);
  let t2 = Math.max(0, timer - 1);
  let r = 0;
  // the pad pays only when the boat arrives on it from another cell
  if (p2[0] === RACE.pad[0] && p2[1] === RACE.pad[1] && !(p[0] === p2[0] && p[1] === p2[1]) && timer === 0) {
    r += 1;
    t2 = RACE.padOff;
  }
  const done = p2[0] === RACE.w - 1;
  if (done) r += finish;
  return { p: p2, timer: t2, r, done };
}

export interface RaceRun {
  q: Float64Array;
  /** Greedy episode after training. */
  trace: RaceStep[];
  pads: number;
  finished: boolean;
  /** Share of the last 200 training episodes that crossed the finish line. */
  finishRate: number;
}

export function trainRace(finish: number, episodes: number, seed: number, alpha = 0.3, eps = 0.2): RaceRun {
  const u = rng(seed);
  const q = new Float64Array(RACE.w * RACE.h * (RACE.padOff + 1) * 4);
  let finishes = 0;
  for (let e = 0; e < episodes; e++) {
    let p: Pos = [...RACE.start] as Pos;
    let timer = 0;
    let done = false;
    for (let t = 0; t < RACE.maxT && !done; t++) {
      const s = raceSid(p, timer);
      const qs = Array.from(q.subarray(s * 4, s * 4 + 4));
      const a = u() < eps ? Math.floor(u() * 4) : argmaxRandom(qs, u);
      const nx = raceStep(p, timer, a, finish);
      const s2 = raceSid(nx.p, nx.timer);
      const next = nx.done ? 0 : Math.max(q[s2 * 4], q[s2 * 4 + 1], q[s2 * 4 + 2], q[s2 * 4 + 3]);
      q[s * 4 + a] += alpha * (nx.r + RACE.gamma * next - q[s * 4 + a]);
      p = nx.p;
      timer = nx.timer;
      done = nx.done;
    }
    if (done && e >= episodes - 200) finishes++;
  }
  // the greedy episode
  let p: Pos = [...RACE.start] as Pos;
  let timer = 0;
  let score = 0;
  let pads = 0;
  let finished = false;
  const trace: RaceStep[] = [{ p, timer, reward: 0, score, finished }];
  for (let t = 0; t < RACE.maxT && !finished; t++) {
    const s = raceSid(p, timer);
    const qs = Array.from(q.subarray(s * 4, s * 4 + 4));
    const a = qs.indexOf(Math.max(...qs));
    const nx = raceStep(p, timer, a, finish);
    if (nx.r >= 1 && !nx.done) pads++;
    if (nx.done && nx.r > finish) pads++;
    score += nx.r;
    finished = nx.done;
    p = nx.p;
    timer = nx.timer;
    trace.push({ p, timer, reward: nx.r, score, finished });
  }
  return { q, trace, pads, finished, finishRate: finishes / 200 };
}

/* ───────── 3. learning a reward from preferences (Bradley–Terry) ───────── */

/** Features of a trajectory on the preference grid. */
export const FEATURES = ['도착', '걸음 수', '물웅덩이', '동전'];
export interface Traj {
  path: Pos[];
  f: number[]; // [arrived 0/1, moves / 10, puddles stepped, coins taken]
}

export const PREF = { w: 5, h: 5, start: [0, 4] as Pos, goal: [4, 0] as Pos, puddles: [[1, 2], [2, 2], [3, 3]] as Pos[], coins: [[0, 1], [4, 3]] as Pos[] };
/** The hidden preferences of the simulated rater: arriving matters most, puddles are bad. */
export const TRUE_W = [3, -1, -1.5, 0.6];

const same = (a: Pos, b: Pos) => a[0] === b[0] && a[1] === b[1];

/** A pool of varied trajectories: random walks that lean toward the goal by different amounts. */
export function trajectoryPool(n: number, seed: number): Traj[] {
  const u = rng(seed);
  const pool: Traj[] = [];
  while (pool.length < n) {
    const lean = u();
    let p: Pos = [...PREF.start] as Pos;
    const path: Pos[] = [p];
    const maxT = 6 + Math.floor(u() * 10);
    for (let t = 0; t < maxT; t++) {
      // lean: chance of a move that brings the goal closer (up or right)
      const a = u() < lean ? (u() < 0.5 ? 0 : 1) : Math.floor(u() * 4);
      p = move(p, a, PREF.w, PREF.h);
      path.push(p);
      if (same(p, PREF.goal)) break;
    }
    const arrived = same(path[path.length - 1], PREF.goal) ? 1 : 0;
    const puddles = path.filter((q) => PREF.puddles.some((d) => same(d, q))).length;
    const coins = PREF.coins.filter((c) => path.some((q) => same(q, c))).length;
    pool.push({ path, f: [arrived, (path.length - 1) / 10, puddles, coins] });
  }
  return pool;
}

export const dotw = (w: number[], f: number[]) => w.reduce((a, wi, i) => a + wi * f[i], 0);
const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

/** Pairs to show, in a fixed order: indices into the pool, skipping pairs with equal features. */
export function pairOrder(pool: Traj[], n: number, seed: number): [number, number][] {
  const u = rng(seed);
  const out: [number, number][] = [];
  while (out.length < n) {
    const i = Math.floor(u() * pool.length), j = Math.floor(u() * pool.length);
    if (i === j || pool[i].f.every((v, k) => v === pool[j].f[k])) continue;
    out.push([i, j]);
  }
  return out;
}

/** Does the simulated rater prefer the first trajectory of the pair? (Deterministic: higher true reward.) */
export const raterPrefersFirst = (pool: Traj[], [i, j]: [number, number]) => dotw(TRUE_W, pool[i].f) >= dotw(TRUE_W, pool[j].f);

/**
 * Fit reward weights to choices by maximizing Σ log σ(w·(f_win − f_lose)) − λ|w|² with
 * gradient ascent. `choices` holds [winner, loser] pool indices.
 */
export function fitBT(pool: Traj[], choices: [number, number][], lambda = 0.05, iters = 400, lr = 0.5): number[] {
  const w = [0, 0, 0, 0];
  if (!choices.length) return w;
  for (let it = 0; it < iters; it++) {
    const g = w.map((wi) => -2 * lambda * wi);
    for (const [a, b] of choices) {
      const d = pool[a].f.map((v, k) => v - pool[b].f[k]);
      const p = sigmoid(dotw(w, d));
      for (let k = 0; k < 4; k++) g[k] += (1 - p) * d[k];
    }
    for (let k = 0; k < 4; k++) w[k] += (lr * g[k]) / choices.length;
  }
  return w;
}

/** Share of all pool pairs (with different true rewards) that weights w order the same way as the rater. */
export function agreement(pool: Traj[], w: number[]): number {
  let n = 0, ok = 0;
  for (let i = 0; i < pool.length; i++)
    for (let j = i + 1; j < pool.length; j++) {
      const t = dotw(TRUE_W, pool[i].f) - dotw(TRUE_W, pool[j].f);
      if (Math.abs(t) < 1e-9) continue;
      n++;
      const m = dotw(w, pool[i].f) - dotw(w, pool[j].f);
      if (Math.sign(m) === Math.sign(t)) ok++;
    }
  return n ? ok / n : 0;
}

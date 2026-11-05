/*
 * 강화학습 · Q-러닝과 시간차 학습: learning from sampled experience.
 * Uses the same tabular Model as dp.ts, but only to sample transitions, never to read them.
 */

import type { Model } from './dp';
import { argmax } from './dp';

/** Sample one outcome of (s, a) from the model. */
export function sample(m: Model, s: number, a: number, rand: () => number): { s2: number; r: number } {
  const os = m.trans(s, a);
  let u = rand();
  for (const o of os) {
    u -= o.p;
    if (u <= 0) return { s2: o.s2, r: o.r };
  }
  const last = os[os.length - 1];
  return { s2: last.s2, r: last.r };
}

/** ε-greedy choice over Q[s·nA … s·nA + nA − 1]; ties are broken at random. */
export function egreedy(Q: Float64Array, nA: number, s: number, eps: number, rand: () => number): number {
  if (rand() < eps) return Math.floor(rand() * nA);
  let best = -Infinity;
  const ties: number[] = [];
  for (let a = 0; a < nA; a++) {
    const q = Q[s * nA + a];
    if (q > best + 1e-12) {
      best = q;
      ties.length = 0;
      ties.push(a);
    } else if (Math.abs(q - best) <= 1e-12) ties.push(a);
  }
  return ties.length === 1 ? ties[0] : ties[Math.floor(rand() * ties.length)];
}

export const maxQ = (Q: Float64Array, nA: number, s: number) => {
  let b = -Infinity;
  for (let a = 0; a < nA; a++) b = Math.max(b, Q[s * nA + a]);
  return b;
};

export type Method = 'q' | 'sarsa';

export interface Params {
  alpha: number;
  gamma: number;
  eps: number;
  /** Episodes are cut off after this many steps (counts as ending there). */
  maxSteps: number;
}

/** A learning agent that can be advanced one environment step at a time. */
export interface Agent {
  method: Method;
  Q: Float64Array;
  s: number;
  /** Action already chosen for s (SARSA picks it one step ahead). */
  a: number;
  /** Reward collected in the current episode, and its length so far. */
  ret: number;
  len: number;
  /** Finished episodes: total reward each. */
  returns: number[];
  episodes: number;
  totalSteps: number;
  rand: () => number;
  /** Cells visited in the current episode (for drawing the trail). */
  trail: number[];
}

export function newAgent(m: Model, method: Method, start: number, rand: () => number, eps: number): Agent {
  const Q = new Float64Array(m.n * m.nA);
  return { method, Q, s: start, a: egreedy(Q, m.nA, start, eps, rand), ret: 0, len: 0, returns: [], episodes: 0, totalSteps: 0, rand, trail: [start] };
}

export interface StepEvent {
  s: number;
  a: number;
  r: number;
  s2: number;
  /** The TD target and the old and new Q(s, a). */
  target: number;
  before: number;
  after: number;
  /** True when this step ended an episode (terminal state or step cut-off). */
  ended: boolean;
}

/** One environment step with the agent's update rule. */
export function agentStep(m: Model, ag: Agent, p: Params, start: number): StepEvent {
  const { nA } = m;
  const s = ag.s;
  const a = ag.a;
  const { s2, r } = sample(m, s, a, ag.rand);
  const term = m.terminal(s2);
  let a2 = 0;
  let next = 0;
  if (!term) {
    a2 = egreedy(ag.Q, nA, s2, p.eps, ag.rand);
    next = ag.method === 'q' ? maxQ(ag.Q, nA, s2) : ag.Q[s2 * nA + a2];
  }
  const target = r + p.gamma * next;
  const before = ag.Q[s * nA + a];
  const after = before + p.alpha * (target - before);
  ag.Q[s * nA + a] = after;
  ag.ret += r;
  ag.len++;
  ag.totalSteps++;
  const ended = term || ag.len >= p.maxSteps;
  if (ended) {
    ag.returns.push(ag.ret);
    ag.episodes++;
    ag.ret = 0;
    ag.len = 0;
    ag.s = start;
    ag.a = egreedy(ag.Q, nA, start, p.eps, ag.rand);
    ag.trail = [start];
  } else {
    ag.s = s2;
    ag.a = a2;
    ag.trail.push(s2);
  }
  return { s, a, r, s2, target, before, after, ended };
}

/** Run whole episodes. */
export function runEpisodes(m: Model, ag: Agent, p: Params, start: number, episodes: number) {
  const goal = ag.episodes + episodes;
  while (ag.episodes < goal) agentStep(m, ag, p, start);
}

/** Greedy path from start under Q (stops at a terminal, a repeat, or after limit steps). */
export function greedyPath(m: Model, Q: Float64Array, start: number, limit = 200): number[] {
  const path = [start];
  const seen = new Set([start]);
  let s = start;
  for (let k = 0; k < limit && !m.terminal(s); k++) {
    const a = argmax(Q.subarray(s * m.nA, s * m.nA + m.nA));
    // follow the most likely outcome, which is the intended move in a slippery grid
    const os = m.trans(s, a).slice().sort((x, y) => y.p - x.p);
    s = os[0].s2;
    path.push(s);
    if (seen.has(s)) break;
    seen.add(s);
  }
  return path;
}

/** Moving average over a window (shorter at the start). */
export function smooth(xs: number[], win: number): number[] {
  const out: number[] = [];
  let acc = 0;
  for (let i = 0; i < xs.length; i++) {
    acc += xs[i];
    if (i >= win) acc -= xs[i - win];
    out.push(acc / Math.min(i + 1, win));
  }
  return out;
}

/* ───────── the random walk (Sutton & Barto, example 6.2) ───────── */

/**
 * Five states A..E between two terminals. Start in C, step left or right with equal chance;
 * reward 1 only when leaving on the right. True values are 1/6, 2/6, …, 5/6.
 */
export const WALK_TRUE = [1, 2, 3, 4, 5].map((k) => k / 6);

/** One episode of the walk: the visited states (0..4) and the final reward. */
export function walkEpisode(rand: () => number): { states: number[]; reward: number } {
  const states: number[] = [];
  let s = 2;
  for (;;) {
    states.push(s);
    s += rand() < 0.5 ? -1 : 1;
    if (s < 0) return { states, reward: 0 };
    if (s > 4) return { states, reward: 1 };
  }
}

const rms = (V: number[]) => Math.sqrt(V.reduce((t, v, i) => t + (v - WALK_TRUE[i]) ** 2, 0) / 5);

/**
 * RMS error of every-visit constant-α Monte Carlo and TD(0) after each episode, averaged over runs.
 * Both start from V = 0.5 and see exactly the same episodes.
 */
export function walkCompare(episodes: number, runs: number, alphaMC: number, alphaTD: number, seed: number, rng: (s: number) => () => number) {
  const mc = new Array(episodes + 1).fill(0);
  const td = new Array(episodes + 1).fill(0);
  for (let run = 0; run < runs; run++) {
    const rand = rng(seed + run * 7919);
    const Vm = [0.5, 0.5, 0.5, 0.5, 0.5];
    const Vt = [0.5, 0.5, 0.5, 0.5, 0.5];
    mc[0] += rms(Vm);
    td[0] += rms(Vt);
    for (let e = 1; e <= episodes; e++) {
      const { states, reward } = walkEpisode(rand);
      // Monte Carlo: every state visited moves toward the episode's final reward (γ = 1)
      for (const s of states) Vm[s] += alphaMC * (reward - Vm[s]);
      // TD(0): each state moves toward the next state's estimate (or the reward at the end)
      for (let i = 0; i < states.length; i++) {
        const s = states[i];
        const target = i + 1 < states.length ? Vt[states[i + 1]] : reward;
        Vt[s] += alphaTD * (target - Vt[s]);
      }
      mc[e] += rms(Vm);
      td[e] += rms(Vt);
    }
  }
  return { mc: mc.map((x) => x / runs), td: td.map((x) => x / runs) };
}

/*
 * 강화학습: Bernoulli multi-armed bandits and four ways to play them.
 * Pure logic (no DOM), so node can run it.
 */

import { gauss, rng } from '../../../../lib/math';

export type Algo = 'greedy' | 'egreedy' | 'ucb' | 'thompson';
export const ALGO_KO: Record<Algo, string> = { greedy: '탐욕', egreedy: 'ε-탐욕', ucb: 'UCB1', thompson: '톰슨 샘플링' };

/** Hidden win probabilities of k machines, from a seed. */
export function makeArms(k: number, seed: number): number[] {
  const r = rng(seed * 7919 + 13);
  return Array.from({ length: k }, () => Math.round((0.15 + r() * 0.65) * 100) / 100);
}

/** Gamma(shape, 1) by Marsaglia–Tsang (shape ≥ 1; boosted for shape < 1). */
function gammaSample(shape: number, r: () => number): number {
  if (shape < 1) return gammaSample(shape + 1, r) * Math.pow(r(), 1 / shape);
  const d = shape - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number, v: number;
    do {
      x = gauss(r);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = r();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}
export function betaSample(a: number, b: number, r: () => number): number {
  const x = gammaSample(a, r), y = gammaSample(b, r);
  return x / (x + y);
}

/** Beta(a, b) density, for drawing posteriors. */
export function betaPdf(x: number, a: number, b: number): number {
  if (x <= 0 || x >= 1) return 0;
  const lnB = lgamma(a) + lgamma(b) - lgamma(a + b);
  return Math.exp((a - 1) * Math.log(x) + (b - 1) * Math.log(1 - x) - lnB);
}
function lgamma(z: number): number {
  // Lanczos approximation
  const g = 7;
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - lgamma(1 - z);
  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

export interface Snapshot {
  /** Pulls and wins of each arm before step t. */
  n: number[];
  wins: number[];
  arm: number;
  reward: number;
}

export interface Run {
  /** reward[t] ∈ {0, 1} at each step. */
  reward: number[];
  /** Expected regret of each step: best p − p of the arm chosen. */
  regret: number[];
  /** Which arm each step pulled. */
  arms: number[];
  n: number[];
  wins: number[];
}

/** Play one run of `steps` pulls. ε only matters for 'egreedy'. */
export function play(algo: Algo, p: number[], steps: number, seed: number, eps = 0.1, record?: Snapshot[]): Run {
  const r = rng(seed);
  const k = p.length;
  const best = Math.max(...p);
  const n = new Array(k).fill(0), wins = new Array(k).fill(0);
  const reward: number[] = [], regret: number[] = [], arms: number[] = [];
  const argmax = (score: (i: number) => number) => {
    let bestV = -Infinity;
    let pick: number[] = [];
    for (let i = 0; i < k; i++) {
      const v = score(i);
      if (v > bestV + 1e-12) {
        bestV = v;
        pick = [i];
      } else if (Math.abs(v - bestV) <= 1e-12) pick.push(i);
    }
    return pick[Math.floor(r() * pick.length)];
  };
  const est = (i: number) => (n[i] ? wins[i] / n[i] : 0);
  for (let t = 0; t < steps; t++) {
    let a: number;
    if (algo === 'greedy') a = argmax(est);
    else if (algo === 'egreedy') a = r() < eps ? Math.floor(r() * k) : argmax(est);
    else if (algo === 'ucb') {
      const untried = n.findIndex((x) => x === 0);
      a = untried >= 0 ? untried : argmax((i) => est(i) + Math.sqrt((2 * Math.log(t)) / n[i]));
    } else a = argmax((i) => betaSample(1 + wins[i], 1 + n[i] - wins[i], r));
    const win = r() < p[a] ? 1 : 0;
    record?.push({ n: n.slice(), wins: wins.slice(), arm: a, reward: win });
    n[a]++;
    wins[a] += win;
    reward.push(win);
    regret.push(best - p[a]);
    arms.push(a);
  }
  return { reward, regret, arms, n, wins };
}

export interface Average {
  /** Mean reward at each step across runs. */
  reward: number[];
  /** Mean cumulative regret after each step. */
  cumRegret: number[];
  /** Share of runs whose most-pulled arm is the best arm. */
  foundBest: number;
}

export function average(algo: Algo, p: number[], steps: number, runs: number, seed: number, eps = 0.1): Average {
  const reward = new Array(steps).fill(0), cumRegret = new Array(steps).fill(0);
  const bestArm = p.indexOf(Math.max(...p));
  let found = 0;
  for (let k = 0; k < runs; k++) {
    const run = play(algo, p, steps, seed * 100003 + k * 7 + 1, eps);
    let c = 0;
    for (let t = 0; t < steps; t++) {
      reward[t] += run.reward[t] / runs;
      c += run.regret[t];
      cumRegret[t] += c / runs;
    }
    const most = run.n.indexOf(Math.max(...run.n));
    if (most === bestArm) found++;
  }
  return { reward, cumRegret, foundBest: found / runs };
}

/* 강화학습 · 정책 경사: softmax policies trained with REINFORCE, with and without a baseline. */

import { rng } from '../../../../lib/math';

export function softmax(z: number[]): number[] {
  const m = Math.max(...z);
  const e = z.map((v) => Math.exp(v - m));
  const s = e.reduce((a, b) => a + b, 0);
  return e.map((v) => v / s);
}

/** Draw an index from a probability vector with one uniform number u in [0, 1). */
export function sample(p: number[], u: number): number {
  let acc = 0;
  for (let i = 0; i < p.length; i++) {
    acc += p[i];
    if (u < acc) return i;
  }
  return p.length - 1;
}

/* ───────── 1. a three-armed bandit ───────── */

/** Chance that each arm pays 1 (otherwise 0). Arm C is the best. */
export const ARM_P = [0.3, 0.5, 0.8];
export const ARM_NAMES = ['A', 'B', 'C'];

export interface BanditFrame {
  /** Step number; frame 0 is before any pull. */
  t: number;
  logits: number[];
  probs: number[];
  /** Arm pulled and reward received at this step (−1 for frame 0). */
  a: number;
  r: number;
  /** Baseline used for this update (0 when the baseline is off). */
  b: number;
  /** Advantage r − b that scaled this update. */
  adv: number;
}

/**
 * REINFORCE on the bandit. θ_k += α (r − b) (1[k = a] − π_k). With the baseline on,
 * b is the average reward seen so far (0 before the first pull). `offset` is added to every
 * reward: it changes nothing about which arm is best, only the size of the raw rewards.
 */
export function runBandit(steps: number, alpha: number, baseline: boolean, seed: number, offset = 0): BanditFrame[] {
  const r = rng(seed);
  const theta = [0, 0, 0];
  const frames: BanditFrame[] = [{ t: 0, logits: [...theta], probs: softmax(theta), a: -1, r: 0, b: 0, adv: 0 }];
  let sum = 0;
  for (let t = 1; t <= steps; t++) {
    const p = softmax(theta);
    const a = sample(p, r());
    const rew = (r() < ARM_P[a] ? 1 : 0) + offset;
    const b = baseline && t > 1 ? sum / (t - 1) : 0;
    const adv = rew - b;
    for (let k = 0; k < 3; k++) theta[k] += alpha * adv * ((k === a ? 1 : 0) - p[k]);
    sum += rew;
    frames.push({ t, logits: [...theta], probs: softmax(theta), a, r: rew, b, adv });
  }
  return frames;
}

/* ───────── 2. a corridor with a near, small prize and a far, big one ───────── */

/**
 * Cells 0..6. The agent starts in cell 2. Reaching cell 0 pays 0.5 and ends the episode,
 * reaching cell 6 pays 1 and ends it. Each move goes the chosen way, except that with
 * probability SLIP it goes the other way. Rewards are discounted by GAMMA per step.
 */
export const CORRIDOR = { n: 7, start: 2, leftR: 0.5, rightR: 1, gamma: 0.9, slip: 0.1, maxT: 40 };
/** Non-terminal cells, in order: 1..5. */
export const CELLS = [1, 2, 3, 4, 5];

export interface Step {
  s: number;
  a: number; // 0 = left, 1 = right
  r: number;
}

export type Theta = number[][]; // theta[s][a] for s in 0..6 (only 1..5 used)

export const zeroTheta = (): Theta => Array.from({ length: CORRIDOR.n }, () => [0, 0]);

export function rollout(theta: Theta, u: () => number): Step[] {
  const { start, leftR, rightR, slip, maxT, n } = CORRIDOR;
  let s = start;
  const out: Step[] = [];
  for (let t = 0; t < maxT; t++) {
    const p = softmax(theta[s]);
    const a = sample(p, u());
    const dir = (a === 1 ? 1 : -1) * (u() < slip ? -1 : 1);
    const s2 = s + dir;
    const r = s2 === 0 ? leftR : s2 === n - 1 ? rightR : 0;
    out.push({ s, a, r });
    s = s2;
    if (s === 0 || s === n - 1) break;
  }
  return out;
}

/** Discounted returns G_t for every step of an episode. */
export function returns(ep: Step[]): number[] {
  const g = new Array(ep.length).fill(0);
  let acc = 0;
  for (let t = ep.length - 1; t >= 0; t--) {
    acc = ep[t].r + CORRIDOR.gamma * acc;
    g[t] = acc;
  }
  return g;
}

/** The REINFORCE gradient of one episode, with an optional per-state baseline b(s). */
export function episodeGrad(theta: Theta, ep: Step[], b: number[] | null): Theta {
  const g = zeroTheta();
  const G = returns(ep);
  ep.forEach((st, t) => {
    const p = softmax(theta[st.s]);
    const adv = G[t] - (b ? b[st.s] : 0);
    for (let k = 0; k < 2; k++) g[st.s][k] += adv * ((k === st.a ? 1 : 0) - p[k]);
  });
  return g;
}

export interface CorridorRun {
  /** Return of each training episode, from the start state. */
  rets: number[];
  /** π(right | s) for s = 1..5 after each episode. */
  right: number[][];
  /** The episodes themselves (for drawing the latest one). */
  eps: Step[][];
  theta: Theta;
  v: number[];
}

/**
 * Train with REINFORCE for `episodes` episodes. With the baseline on, a value estimate V(s)
 * is learned alongside the policy (V ← V + β (G − V)) and subtracted from every return.
 */
export function trainCorridor(episodes: number, alpha: number, baseline: boolean, seed: number, beta = 0.1): CorridorRun {
  const u = rng(seed);
  const theta = zeroTheta();
  const v = new Array(CORRIDOR.n).fill(0);
  const rets: number[] = [];
  const right: number[][] = [];
  const eps: Step[][] = [];
  for (let e = 0; e < episodes; e++) {
    const ep = rollout(theta, u);
    const G = returns(ep);
    const g = episodeGrad(theta, ep, baseline ? v : null);
    for (const s of CELLS) for (let k = 0; k < 2; k++) theta[s][k] += alpha * g[s][k];
    if (baseline) ep.forEach((st, t) => (v[st.s] += beta * (G[t] - v[st.s])));
    rets.push(G[0] ?? 0);
    right.push(CELLS.map((s) => softmax(theta[s])[1]));
    eps.push(ep);
  }
  return { rets, right, eps, theta, v };
}

/** Mean return per episode over `seeds` independent runs. */
export function meanCurve(episodes: number, alpha: number, baseline: boolean, seeds: number, seed0 = 100): number[] {
  const acc = new Array(episodes).fill(0);
  for (let k = 0; k < seeds; k++) {
    const run = trainCorridor(episodes, alpha, baseline, seed0 + k);
    run.rets.forEach((r, i) => (acc[i] += r / seeds));
  }
  return acc;
}

/** Moving average over a window, using the samples available at the start. */
export function smooth(xs: number[], win: number): number[] {
  const out: number[] = [];
  let s = 0;
  for (let i = 0; i < xs.length; i++) {
    s += xs[i];
    if (i >= win) s -= xs[i - win];
    out.push(s / Math.min(i + 1, win));
  }
  return out;
}

/** First episode at which the curve reaches `level` (or −1 if it never does). */
export const firstReach = (xs: number[], level: number) => xs.findIndex((x) => x >= level);

/**
 * Exact state values of a policy by iterating the Bellman equation (the corridor is tiny).
 * Used as the "best possible" reference and as the ideal baseline.
 */
export function policyValues(theta: Theta): number[] {
  const { n, leftR, rightR, gamma, slip } = CORRIDOR;
  const v = new Array(n).fill(0);
  for (let it = 0; it < 500; it++) {
    for (const s of CELLS) {
      const p = softmax(theta[s]);
      let val = 0;
      for (let a = 0; a < 2; a++) {
        const intended = a === 1 ? 1 : -1;
        for (const [dir, pr] of [[intended, 1 - slip], [-intended, slip]] as [number, number][]) {
          const s2 = s + dir;
          const r = s2 === 0 ? leftR : s2 === n - 1 ? rightR : 0;
          const cont = s2 === 0 || s2 === n - 1 ? 0 : v[s2];
          val += p[a] * pr * (r + gamma * cont);
        }
      }
      v[s] = val;
    }
  }
  return v;
}

/** Value of the start state under the best deterministic policy (always go right). */
export function optimalStartValue(): number {
  const t = zeroTheta();
  for (const s of CELLS) t[s] = [-50, 50];
  return policyValues(t)[CORRIDOR.start];
}

/**
 * Spread of the one-episode gradient estimate at the starting policy (θ = 0): the summed
 * variance over all ten parameters, from `n` sampled episodes. Baselines: none, a constant
 * (the average start return), and the exact value of each state.
 */
export function gradSpread(n: number, seed: number): { none: number; constant: number; state: number; meanNorm: number } {
  const theta = zeroTheta();
  const u = rng(seed);
  const eps = Array.from({ length: n }, () => rollout(theta, u));
  const meanRet = eps.reduce((a, ep) => a + (returns(ep)[0] ?? 0), 0) / n;
  const vExact = policyValues(theta);
  const spread = (b: number[] | null) => {
    const gs = eps.map((ep) => episodeGrad(theta, ep, b));
    let total = 0;
    let norm = 0;
    for (const s of CELLS)
      for (let k = 0; k < 2; k++) {
        const xs = gs.map((g) => g[s][k]);
        const m = xs.reduce((a, x) => a + x, 0) / n;
        total += xs.reduce((a, x) => a + (x - m) * (x - m), 0) / n;
        norm += m * m;
      }
    return { total, norm: Math.sqrt(norm) };
  };
  const none = spread(null);
  return {
    none: none.total,
    constant: spread(new Array(CORRIDOR.n).fill(meanRet)).total,
    state: spread(vExact).total,
    meanNorm: none.norm,
  };
}

/* ───────── 3. PPO's clipped objective ───────── */

/** The PPO-clip objective for one action: min(ρA, clip(ρ, 1−ε, 1+ε)A). */
export function ppoClip(ratio: number, adv: number, eps: number): number {
  const c = Math.max(1 - eps, Math.min(1 + eps, ratio));
  return Math.min(ratio * adv, c * adv);
}

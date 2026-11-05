/*
 * 강화학습 · 가치 반복과 정책 반복: dynamic programming on a known model.
 * Works on a small tabular model (see Model) so the same code serves any grid preset.
 */

import { isTerminal, isWall, stateCount, transitions, type Grid } from './gridworld';

/** One possible outcome of taking an action: probability, next state, reward. */
export interface Outcome {
  p: number;
  s2: number;
  r: number;
}

/** A finite MDP with known dynamics. Terminal states have value 0 and no actions. */
export interface Model {
  n: number;
  nA: number;
  trans: (s: number, a: number) => Outcome[];
  terminal: (s: number) => boolean;
  /** States that are walls (not real states); skipped everywhere. */
  blocked?: (s: number) => boolean;
}

/**
 * The grid as a Model. Walls, and the cliff's pits (which send the agent straight back to the
 * start, so it never stands in one), are not states.
 */
export function gridModel(g: Grid): Model {
  return {
    n: stateCount(g),
    nA: 4,
    trans: (s, a) => transitions(g, s, a),
    terminal: (s) => isTerminal(g, s),
    blocked: (s) => isWall(g, s) || (g.cells[s] === 'pit' && !!g.pitReset),
  };
}

/** States that have a value worth showing: not walls, pits or terminals. */
export const isLive = (m: Model, s: number) => !m.terminal(s) && !(m.blocked?.(s) ?? false);

const live = (m: Model, s: number) => !m.terminal(s) && !(m.blocked?.(s) ?? false);

/** Expected return of taking a in s and then following values V: Σ p (r + γ V(s')). */
export function qValue(m: Model, V: ArrayLike<number>, gamma: number, s: number, a: number): number {
  let q = 0;
  for (const o of m.trans(s, a)) q += o.p * (o.r + gamma * V[o.s2]);
  return q;
}

/** All action values in s. */
export function qValues(m: Model, V: ArrayLike<number>, gamma: number, s: number): number[] {
  return Array.from({ length: m.nA }, (_, a) => qValue(m, V, gamma, s, a));
}

/** Index of the largest value; ties go to the lowest index. */
export function argmax(xs: ArrayLike<number>): number {
  let b = 0;
  for (let i = 1; i < xs.length; i++) if (xs[i] > xs[b] + 1e-12) b = i;
  return b;
}

/** Greedy policy for V (−1 for terminal and blocked states). */
export function greedyPolicy(m: Model, V: ArrayLike<number>, gamma: number): number[] {
  return Array.from({ length: m.n }, (_, s) => (live(m, s) ? argmax(qValues(m, V, gamma, s)) : -1));
}

/** One synchronous sweep of value iteration: V'(s) = max_a Σ p (r + γ V(s')). */
export function viSweep(m: Model, V: ArrayLike<number>, gamma: number): { V: number[]; delta: number } {
  const out = Array.from(V);
  let delta = 0;
  for (let s = 0; s < m.n; s++) {
    if (!live(m, s)) {
      out[s] = 0;
      continue;
    }
    const v = Math.max(...qValues(m, V, gamma, s));
    delta = Math.max(delta, Math.abs(v - V[s]));
    out[s] = v;
  }
  return { V: out, delta };
}

export interface ViFrame {
  sweep: number;
  V: number[];
  /** Largest change in this sweep (0 for the starting frame). */
  delta: number;
}

/** Value iteration from V = 0, one frame per sweep, until the change drops below tol or maxSweeps. */
export function valueIteration(m: Model, gamma: number, tol = 1e-4, maxSweeps = 500): ViFrame[] {
  let V = new Array(m.n).fill(0);
  const frames: ViFrame[] = [{ sweep: 0, V, delta: 0 }];
  for (let k = 1; k <= maxSweeps; k++) {
    const r = viSweep(m, V, gamma);
    V = r.V;
    frames.push({ sweep: k, V, delta: r.delta });
    if (r.delta < tol) break;
  }
  return frames;
}

/** Iterative policy evaluation of a deterministic policy, in place sweeps until change < tol. */
export function evaluatePolicy(m: Model, pi: number[], gamma: number, V0?: number[], tol = 1e-4, maxSweeps = 1000): { V: number[]; sweeps: number } {
  let V = V0 ? V0.slice() : new Array(m.n).fill(0);
  let sweeps = 0;
  for (; sweeps < maxSweeps; ) {
    const next = V.slice();
    let delta = 0;
    for (let s = 0; s < m.n; s++) {
      if (!live(m, s)) {
        next[s] = 0;
        continue;
      }
      next[s] = qValue(m, V, gamma, s, pi[s]);
      delta = Math.max(delta, Math.abs(next[s] - V[s]));
    }
    V = next;
    sweeps++;
    if (delta < tol) break;
  }
  return { V, sweeps };
}

export interface PiStep {
  /** 0-based iteration number. */
  iter: number;
  /** Policy that was evaluated, and its values. */
  pi: number[];
  V: number[];
  evalSweeps: number;
  /** Greedy improvement of pi with respect to V. */
  improved: number[];
  /** Number of states whose action changed in the improvement. */
  changed: number;
}

/** Policy iteration from the policy that always takes action `start` (default 0). */
export function policyIteration(m: Model, gamma: number, start = 0, tol = 1e-4, maxIter = 50): PiStep[] {
  let pi = Array.from({ length: m.n }, (_, s) => (live(m, s) ? start : -1));
  let V: number[] | undefined;
  const out: PiStep[] = [];
  for (let it = 0; it < maxIter; it++) {
    const ev = evaluatePolicy(m, pi, gamma, V, tol);
    V = ev.V;
    const improved = pi.map((a, s) => {
      if (a < 0) return a;
      const q = qValues(m, V!, gamma, s);
      // keep the current action on ties, so the loop stops instead of flipping between equals
      const best = argmax(q);
      return q[best] > q[a] + 1e-9 ? best : a;
    });
    const changed = improved.filter((a, s) => a !== pi[s]).length;
    out.push({ iter: it, pi, V, evalSweeps: ev.sweeps, improved, changed });
    if (changed === 0) break;
    pi = improved;
  }
  return out;
}

/** The terms of one Bellman backup in s, for showing the arithmetic. */
export interface BackupTerm {
  a: number;
  q: number;
  outcomes: { p: number; s2: number; r: number; v: number }[];
}

export function backup(m: Model, V: ArrayLike<number>, gamma: number, s: number): BackupTerm[] {
  return Array.from({ length: m.nA }, (_, a) => {
    const outcomes = m.trans(s, a).map((o) => ({ ...o, v: V[o.s2] }));
    return { a, q: outcomes.reduce((t, o) => t + o.p * (o.r + gamma * o.v), 0), outcomes };
  });
}

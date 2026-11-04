/* 운영체제: race conditions, mutexes and the dining philosophers (deterministic simulations). */

import { rng } from '../../../../lib/math';

/* ───────── count = count + 1 as machine instructions ───────── */

export type Op = 'lock' | 'load' | 'add' | 'store' | 'unlock';
export const PROG_PLAIN: Op[] = ['load', 'add', 'store'];
export const PROG_LOCK: Op[] = ['lock', 'load', 'add', 'store', 'unlock'];
export const OP_TEXT: Record<Op, string> = {
  lock: 'lock(m)',
  load: 'load  r, [count]',
  add: 'add   r, 1',
  store: 'store [count], r',
  unlock: 'unlock(m)',
};

export interface TraceItem {
  th: number;
  op: Op;
  mem: number;
  reg: number | null;
}
export interface RaceState {
  pc: number[];
  reg: (number | null)[];
  mem: number;
  holder: number; // -1: lock free
  trace: TraceItem[];
}
export const raceStart = (): RaceState => ({ pc: [0, 0], reg: [null, null], mem: 0, holder: -1, trace: [] });

export const finished = (s: RaceState, prog: Op[], th: number) => s.pc[th] >= prog.length;
export const blocked = (s: RaceState, prog: Op[], th: number) => !finished(s, prog, th) && prog[s.pc[th]] === 'lock' && s.holder >= 0 && s.holder !== th;

/** Execute the next instruction of thread `th`; returns null when it cannot run. */
export function raceStep(s: RaceState, prog: Op[], th: number): RaceState | null {
  if (finished(s, prog, th) || blocked(s, prog, th)) return null;
  const op = prog[s.pc[th]];
  const pc = [...s.pc];
  const reg = [...s.reg];
  let mem = s.mem;
  let holder = s.holder;
  if (op === 'lock') holder = th;
  else if (op === 'unlock') holder = -1;
  else if (op === 'load') reg[th] = mem;
  else if (op === 'add') reg[th] = (reg[th] ?? 0) + 1;
  else if (op === 'store') mem = reg[th] ?? 0;
  pc[th]++;
  return { pc, reg, mem, holder, trace: [...s.trace, { th, op, mem, reg: reg[th] }] };
}

/* ───────── many runs: k increments per thread, random preemption ───────── */

export interface RaceRun {
  count: number;
  steps: number;
  /** times a thread found the lock taken and had to give up the CPU */
  blocks: number;
}

/**
 * Two threads each run `count = count + 1` k times. Before every instruction the scheduler
 * switches to the other thread with probability p. A thread that hits a taken lock gives up the CPU.
 */
export function raceRun(k: number, p: number, locked: boolean, r: () => number): RaceRun {
  const prog = locked ? PROG_LOCK : PROG_PLAIN;
  const L = prog.length;
  const iter = [0, 0];
  const pc = [0, 0];
  const reg = [0, 0];
  let mem = 0;
  let holder = -1;
  let cur = r() < 0.5 ? 0 : 1;
  let steps = 0;
  let blocks = 0;
  const done = (t: number) => iter[t] >= k;
  while (!done(0) || !done(1)) {
    if (done(cur) || (!done(1 - cur) && r() < p)) cur = 1 - cur;
    const op = prog[pc[cur]];
    if (op === 'lock' && holder >= 0 && holder !== cur) {
      blocks++;
      cur = 1 - cur;
      continue;
    }
    if (op === 'lock') holder = cur;
    else if (op === 'unlock') holder = -1;
    else if (op === 'load') reg[cur] = mem;
    else if (op === 'add') reg[cur]++;
    else mem = reg[cur];
    steps++;
    pc[cur]++;
    if (pc[cur] === L) {
      pc[cur] = 0;
      iter[cur]++;
    }
  }
  return { count: mem, steps, blocks };
}

export function raceMany(runs: number, k: number, p: number, locked: boolean, seed: number): RaceRun[] {
  const r = rng(seed);
  return Array.from({ length: runs }, () => raceRun(k, p, locked, r));
}

/* ───────── dining philosophers ───────── */

export type Strategy = 'left' | 'order' | 'waiter';
export type PhilState = 'think' | 'hungry' | 'one' | 'eat';
export const PHIL_KO: Record<PhilState, string> = { think: '생각', hungry: '배고픔', one: '포크 하나', eat: '식사' };

export interface PhilFrame {
  st: PhilState[];
  /** holder of each fork, -1 when on the table. Fork i lies between philosopher i−1 and i. */
  forks: number[];
  meals: number[];
  /** philosopher each one is waiting for (holder of the fork it wants), -1 if none */
  waitsFor: number[];
  cycle: number[];
  deadlock: boolean;
  actor: number;
  note: string;
}

/** Fork order for philosopher i, whose forks are i and i+1: [first, second]. */
export function forkOrder(i: number, n: number, s: Strategy): [number, number] {
  const left = i;
  const right = (i + 1) % n;
  if (s === 'order') return [Math.min(left, right), Math.max(left, right)];
  return [left, right];
}

export function runPhilosophers(n: number, s: Strategy, seed: number, together: boolean, maxSteps = 260): PhilFrame[] {
  const r = rng(seed);
  const st: PhilState[] = Array(n).fill(together ? 'hungry' : 'think');
  const timer = Array.from({ length: n }, () => (together ? 0 : 1 + Math.floor(r() * 3)));
  const forks = Array(n).fill(-1);
  const meals = Array(n).fill(0);
  const seated = () => st.filter((x) => x === 'one' || x === 'eat').length;
  const wantFork = (i: number) => (st[i] === 'hungry' ? forkOrder(i, n, s)[0] : st[i] === 'one' ? forkOrder(i, n, s)[1] : -1);
  const canAct = (i: number) => {
    if (st[i] === 'think' || st[i] === 'eat') return true;
    const f = wantFork(i);
    if (forks[f] >= 0) return false;
    if (s === 'waiter' && st[i] === 'hungry' && seated() >= n - 1) return false; // the waiter keeps one seat empty
    return true;
  };
  const snapshot = (actor: number, note: string): PhilFrame => {
    const waitsFor = st.map((_, i) => {
      const f = wantFork(i);
      if (f < 0) return -1;
      if (forks[f] >= 0) return forks[f];
      return -1;
    });
    // the wait-for graph has out-degree ≤ 1, so a cycle is found by walking from each node
    let cycle: number[] = [];
    for (let a = 0; a < n && !cycle.length; a++) {
      const path: number[] = [];
      let x = a;
      while (x >= 0 && !path.includes(x)) {
        path.push(x);
        x = waitsFor[x];
      }
      if (x >= 0) cycle = path.slice(path.indexOf(x));
    }
    const stuck = st.every((_, i) => !canAct(i));
    return { st: [...st], forks: [...forks], meals: [...meals], waitsFor, cycle, deadlock: stuck, actor, note };
  };
  const frames: PhilFrame[] = [snapshot(-1, together ? '모두 동시에 배가 고파졌습니다.' : '모두 생각하는 중입니다.')];
  const name = (i: number) => `P${i}`;
  for (let step = 0; step < maxSteps; step++) {
    const able = st.map((_, i) => i).filter(canAct);
    if (!able.length) break;
    // "together": the first n turns go around the table in order, the worst case for "left first"
    const i = together && step < n ? (able.includes(step) ? step : able[0]) : able[Math.floor(r() * able.length)];
    let note = '';
    if (st[i] === 'think') {
      if (timer[i] > 0) {
        timer[i]--;
        note = `${name(i)}: 생각 중`;
      } else {
        st[i] = 'hungry';
        note = `${name(i)}: 배가 고파짐`;
      }
    } else if (st[i] === 'hungry') {
      const f = forkOrder(i, n, s)[0];
      forks[f] = i;
      st[i] = 'one';
      note = `${name(i)}: 포크 ${f}을(를) 집음`;
    } else if (st[i] === 'one') {
      const f = forkOrder(i, n, s)[1];
      forks[f] = i;
      st[i] = 'eat';
      timer[i] = 2;
      note = `${name(i)}: 포크 ${f}까지 집고 식사 시작`;
    } else {
      if (timer[i] > 1) {
        timer[i]--;
        note = `${name(i)}: 식사 중`;
      } else {
        const [a, b] = forkOrder(i, n, s);
        forks[a] = -1;
        forks[b] = -1;
        meals[i]++;
        st[i] = 'think';
        timer[i] = 1 + Math.floor(r() * 3);
        note = `${name(i)}: 식사를 마치고 포크 ${a}, ${b}를 내려놓음`;
      }
    }
    frames.push(snapshot(i, note));
    if (frames[frames.length - 1].deadlock) break;
  }
  return frames;
}
